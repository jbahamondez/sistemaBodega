/**
 * Importacion.gs — Carga masiva del catálogo mediante planilla CSV.
 *
 * Flujo obligatorio (prompt §8.3): cargar → validar → previsualizar →
 * confirmar. Nunca se importa de forma silenciosa y la importación jamás
 * modifica el stock (§8.9) ni elimina/desactiva registros ausentes de la
 * planilla (§8.6, Caso 12).
 *
 * El mapeo de columnas vive en CONFIG.IMPORT_PLANILLA: cuando exista la
 * planilla definitiva de la chocolatería, se ajusta solo esa configuración.
 */

/** Genera la plantilla oficial CSV con encabezados y filas de ejemplo. */
function importacionPlantillaCsv_() {
  var headers = CONFIG.IMPORT_PLANILLA.columns.map(function (c) { return c.header; });
  var filas = [headers].concat(CONFIG.IMPORT_PLANILLA.exampleRows);
  return utilToCsv(filas);
}

/** Instrucciones de llenado mostradas junto a la plantilla. */
function importacionInstrucciones_() {
  return [
    'Una fila por FORMATO de empaque. Si un producto tiene varios formatos ' +
      '(display, caja, unidad), repetir los datos del producto en cada fila.',
    'nombre_producto, codigo_barras, nombre_formato, tipo_empaque y ' +
      'unidades_por_empaque son obligatorios.',
    'codigo_producto es opcional pero recomendado: es el identificador ' +
      'estable del producto entre importaciones.',
    'tipo_empaque debe ser: ' + Object.keys(CONFIG.TIPOS_EMPAQUE).join(', ') + '.',
    'unidades_por_empaque: número entero mayor que 0 (cuántas unidades ' +
      'contiene la caja o display).',
    'activo: SI o NO (vacío se interpreta como SI).',
    'Los códigos de barras se tratan como texto: se conservan los ceros ' +
      'iniciales exactamente como se escriban.',
    'Las filas de ejemplo de la plantilla deben reemplazarse por datos reales.'
  ];
}

/**
 * Previsualiza una importación SIN escribir nada.
 *
 * Devuelve { ok, erroresGlobales, resumen, filas } donde cada fila incluye
 * su clasificación (NUEVO / ACTUALIZAR / SIN_CAMBIOS / ERROR /
 * OMITIDO_POR_MODO), los datos leídos, los cambios detectados campo a campo
 * ("15 → 18") y los errores de esa fila.
 */
function importacionPrevisualizar_(csvText, modo) {
  modo = utilTrim(modo).toUpperCase() || CONFIG.MODOS_IMPORTACION.AGREGAR_Y_ACTUALIZAR;
  if (!CONFIG.MODOS_IMPORTACION[modo]) {
    throw new Error('Modo de importación inválido: ' + modo);
  }

  var parsed = utilParseCsv(csvText);
  if (parsed.rows.length === 0) {
    return importacionResultadoVacio_('El archivo está vacío.');
  }

  // Mapear encabezados de la planilla a índices de columna (tolerante a
  // mayúsculas, columnas extra y a los alias de la planilla real de la
  // chocolatería, p. ej. "EAN" → codigo_barras).
  var headers = parsed.rows[0].map(function (h) { return utilTrim(h).toLowerCase(); });
  var indice = {};
  var faltantes = [];
  CONFIG.IMPORT_PLANILLA.columns.forEach(function (col) {
    var candidatos = [col.header.toLowerCase()]
      .concat((col.aliases || []).map(function (a) { return a.toLowerCase(); }));
    var idx = -1;
    for (var i = 0; i < candidatos.length && idx === -1; i++) {
      idx = headers.indexOf(candidatos[i]);
    }
    if (idx === -1 && col.required) faltantes.push(col.header);
    indice[col.header] = idx;
  });
  if (faltantes.length > 0) {
    return importacionResultadoVacio_(
      'Faltan columnas obligatorias: ' + faltantes.join(', ') +
      '. Descarga la plantilla oficial para ver la estructura esperada.');
  }

  // Estado actual del catálogo para clasificar contra él.
  var productos = dbReadAll_('PRODUCTOS');
  var formatos = dbReadAll_('FORMATOS_EMPAQUE');
  var formatoPorCodigo = {};
  formatos.forEach(function (f) { formatoPorCodigo[f.codigo_barras] = f; });
  var productoPorId = {};
  var productoPorCodigo = {};
  var productoPorNombre = {};
  productos.forEach(function (p) {
    productoPorId[p.producto_id] = p;
    if (p.codigo_producto) productoPorCodigo[p.codigo_producto] = p;
    productoPorNombre[p.nombre.toLowerCase()] = p;
  });

  var codigosEnArchivo = {};
  var filasResultado = [];

  for (var r = 1; r < parsed.rows.length; r++) {
    var numFila = r + 1; // número de fila visible en la planilla
    var datos = importacionLeerFila_(parsed.rows[r], indice);
    var errores = importacionValidarFila_(datos);

    // Caso 9: código duplicado dentro del mismo archivo.
    if (datos.codigo_barras) {
      if (codigosEnArchivo[datos.codigo_barras]) {
        errores.push('Código de barras duplicado en el archivo (también en fila ' +
          codigosEnArchivo[datos.codigo_barras] + ').');
      } else {
        codigosEnArchivo[datos.codigo_barras] = numFila;
      }
    }

    var fila = {
      fila: numFila,
      datos: datos,
      estado: null,
      cambios: [],
      errores: errores,
      productoExistente: null
    };

    if (errores.length > 0) {
      fila.estado = CONFIG.ESTADOS_FILA_IMPORT.ERROR;
      filasResultado.push(fila);
      continue;
    }

    // Identificación (§8.7): formato por código de barras; producto por
    // codigo_producto y, como fallback, por nombre.
    var formatoExistente = formatoPorCodigo[datos.codigo_barras] || null;
    var productoExistente =
      (datos.codigo_producto && productoPorCodigo[datos.codigo_producto]) ||
      productoPorNombre[datos.nombre_producto.toLowerCase()] || null;
    fila.productoExistente = productoExistente ? productoExistente.producto_id : null;

    if (formatoExistente) {
      var productoDelFormato = productoPorId[formatoExistente.producto_id];
      fila.cambios = importacionDetectarCambios_(datos, formatoExistente, productoDelFormato);
      fila.estado = fila.cambios.length > 0
        ? CONFIG.ESTADOS_FILA_IMPORT.ACTUALIZAR
        : CONFIG.ESTADOS_FILA_IMPORT.SIN_CAMBIOS;
    } else {
      fila.estado = CONFIG.ESTADOS_FILA_IMPORT.NUEVO;
    }

    // El modo restringe qué acciones se aplican (§8.6).
    if (fila.estado === CONFIG.ESTADOS_FILA_IMPORT.NUEVO &&
        modo === CONFIG.MODOS_IMPORTACION.ACTUALIZAR) {
      fila.estado = CONFIG.ESTADOS_FILA_IMPORT.OMITIDO_POR_MODO;
    }
    if (fila.estado === CONFIG.ESTADOS_FILA_IMPORT.ACTUALIZAR &&
        modo === CONFIG.MODOS_IMPORTACION.AGREGAR) {
      fila.estado = CONFIG.ESTADOS_FILA_IMPORT.OMITIDO_POR_MODO;
    }

    filasResultado.push(fila);
  }

  var resumen = { total: filasResultado.length };
  Object.keys(CONFIG.ESTADOS_FILA_IMPORT).forEach(function (estado) {
    resumen[estado] = filasResultado.filter(function (f) {
      return f.estado === estado;
    }).length;
  });

  return {
    ok: true,
    modo: modo,
    erroresGlobales: [],
    resumen: resumen,
    filas: filasResultado
  };
}

/**
 * Aplica una importación previamente previsualizada. Recalcula la
 * clasificación bajo bloqueo (el catálogo pudo cambiar entre previsualizar
 * y confirmar), aplica solo filas NUEVO/ACTUALIZAR y registra el resultado
 * en la hoja Importaciones. Las filas con error se omiten y se informan.
 *
 * Escribe en LOTES (no fila por fila): con catálogos de cientos de
 * productos, generar un ID y escribir bajo bloqueo por cada fila
 * individualmente multiplica las llamadas a Sheets y puede acercarse al
 * límite de ejecución de Apps Script (6 min). Aquí se generan todos los IDs
 * necesarios de una vez (idNextBatch_) y se escribe con como máximo un
 * puñado de llamadas, sin importar cuántas filas traiga la planilla.
 */
function importacionAplicar_(csvText, modo, nombreArchivo, usuarioId) {
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;
  var origen = CONFIG.ORIGENES_CAMBIO.IMPORTACION_PLANILLA;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error('El sistema está procesando otra operación. Intenta nuevamente.');
  }
  try {
    var prev = importacionPrevisualizar_(csvText, modo);
    if (!prev.ok) {
      throw new Error('La planilla tiene errores de estructura: ' +
        prev.erroresGlobales.join(' '));
    }

    var contadores = importacionAplicarEnLote_(prev, origen, usuarioId);

    var registro = {
      importacion_id: idNext_('IMPORTACION'),
      fecha_hora: utilNow(),
      usuario_id: usuarioId,
      nombre_archivo: utilTrim(nombreArchivo) || 'sin nombre',
      cantidad_filas: prev.resumen.total,
      creados: contadores.productosCreados + contadores.formatosCreados,
      actualizados: contadores.productosActualizados + contadores.formatosActualizados,
      sin_cambios: prev.resumen.SIN_CAMBIOS + prev.resumen.OMITIDO_POR_MODO,
      errores: prev.resumen.ERROR,
      estado: 'COMPLETADA'
    };
    dbAppendRow_('IMPORTACIONES', registro);

    return {
      importacion_id: registro.importacion_id,
      resumen: prev.resumen,
      detalle: contadores,
      filasConError: prev.filas
        .filter(function (f) { return f.estado === CONFIG.ESTADOS_FILA_IMPORT.ERROR; })
        .map(function (f) { return { fila: f.fila, errores: f.errores }; })
    };
  } finally {
    lock.releaseLock();
  }
}

/** Últimas importaciones registradas, más recientes primero. */
function importacionListar_(limite) {
  var rows = dbReadAll_('IMPORTACIONES');
  rows.reverse();
  return rows.slice(0, limite || 20);
}

// ---------------------------------------------------------------------------
// Internas
// ---------------------------------------------------------------------------

/** Extrae y normaliza los campos de una fila según el mapeo de columnas. */
function importacionLeerFila_(row, indice) {
  function leer(header) {
    var idx = indice[header];
    return idx === -1 || idx === undefined ? '' : utilTrim(row[idx]);
  }
  var datos = {
    codigo_producto: leer('codigo_producto'),
    nombre_producto: leer('nombre_producto'),
    categoria: leer('categoria'),
    codigo_barras: utilNormalizeBarcode(leer('codigo_barras')),
    nombre_formato: leer('nombre_formato'),
    tipo_empaque: leer('tipo_empaque').toUpperCase(),
    unidades_por_empaque: importacionNormalizarEntero_(leer('unidades_por_empaque')),
    activo: leer('activo') === '' ? CONFIG.BOOL.SI : leer('activo').toUpperCase()
  };

  // Derivación de formato (D-023): la planilla real no trae nombre ni tipo
  // de empaque; se generan desde las unidades. Solo cuando vienen vacíos.
  var unidades = utilToInt(datos.unidades_por_empaque);
  if (datos.nombre_formato === '' && unidades !== null && unidades > 0) {
    datos.nombre_formato = unidades === 1 ? 'Unidad' : 'Caja x ' + unidades;
  }
  if (datos.tipo_empaque === '' && unidades !== null && unidades > 0) {
    datos.tipo_empaque = unidades === 1
      ? CONFIG.TIPOS_EMPAQUE.UNIDAD
      : CONFIG.TIPOS_EMPAQUE.CAJA;
  }
  return datos;
}

/**
 * Normaliza enteros que Excel exporta como decimales ("10.0" → "10").
 * Deja intactos los valores no numéricos para que la validación los reporte.
 */
function importacionNormalizarEntero_(valor) {
  if (/^\d+[.,]0+$/.test(valor)) {
    return valor.replace(/[.,]0+$/, '');
  }
  return valor;
}

/** Validaciones por fila (§8.5). Devuelve la lista de errores. */
function importacionValidarFila_(datos) {
  var errores = [];
  if (datos.nombre_producto === '') {
    errores.push('nombre_producto es obligatorio.');
  }
  if (datos.codigo_barras === '') {
    errores.push('codigo_barras es obligatorio.');
  } else if (!valIsCodigoBarras(datos.codigo_barras)) {
    errores.push('codigo_barras inválido: "' + datos.codigo_barras + '".');
  }
  if (datos.nombre_formato === '') {
    errores.push('nombre_formato es obligatorio.');
  }
  if (datos.tipo_empaque === '') {
    errores.push('tipo_empaque está vacío.');
  } else if (!valIsTipoEmpaque(datos.tipo_empaque)) {
    errores.push('tipo_empaque inválido: "' + datos.tipo_empaque + '". Válidos: ' +
      Object.keys(CONFIG.TIPOS_EMPAQUE).join(', ') + '.');
  }
  if (!valIsPositiveInt(datos.unidades_por_empaque)) {
    errores.push('unidades_por_empaque debe ser un entero mayor que 0.');
  }
  if (datos.activo !== CONFIG.BOOL.SI && datos.activo !== CONFIG.BOOL.NO) {
    errores.push('activo debe ser SI o NO.');
  }
  return errores;
}

/** Diferencias entre la fila de la planilla y el formato/producto existente. */
function importacionDetectarCambios_(datos, formato, producto) {
  var cambios = [];
  function comparar(entidad, campo, anterior, nuevo) {
    if (utilTrim(anterior) !== utilTrim(nuevo)) {
      cambios.push({ entidad: entidad, campo: campo,
        anterior: utilTrim(anterior), nuevo: utilTrim(nuevo) });
    }
  }
  comparar('FORMATO', 'nombre_formato', formato.nombre_formato, datos.nombre_formato);
  comparar('FORMATO', 'tipo_empaque', formato.tipo_empaque, datos.tipo_empaque);
  comparar('FORMATO', 'unidades_por_empaque', formato.unidades_por_empaque,
    datos.unidades_por_empaque);
  comparar('FORMATO', 'activo', formato.activo, datos.activo);
  if (producto) {
    comparar('PRODUCTO', 'nombre', producto.nombre, datos.nombre_producto);
    comparar('PRODUCTO', 'categoria', producto.categoria, datos.categoria);
    if (datos.codigo_producto) {
      comparar('PRODUCTO', 'codigo_producto', producto.codigo_producto,
        datos.codigo_producto);
    }
  }
  return cambios;
}

/**
 * Aplica todas las filas NUEVO y ACTUALIZAR de una previsualización con un
 * número mínimo de llamadas a Sheets: IDs generados en lote, filas nuevas
 * agregadas con un único dbAppendRows_ por hoja, y actualizaciones escritas
 * con un único dbWriteAllRows_ por hoja (se reescribe la hoja completa en
 * memoria y se sube en una sola llamada). Se ejecuta ya bajo el bloqueo de
 * importacionAplicar_, así que no hay riesgo de que otro proceso escriba
 * entre medio.
 */
function importacionAplicarEnLote_(prev, origen, usuarioId) {
  var contadores = { productosCreados: 0, productosActualizados: 0,
    formatosCreados: 0, formatosActualizados: 0 };
  var ahora = utilNow();
  var historialEntradas = [];

  var filasNuevo = prev.filas.filter(function (f) {
    return f.estado === CONFIG.ESTADOS_FILA_IMPORT.NUEVO;
  });
  var filasActualizar = prev.filas.filter(function (f) {
    return f.estado === CONFIG.ESTADOS_FILA_IMPORT.ACTUALIZAR;
  });

  // --- Productos nuevos: una fila por identidad única (codigo_producto o
  // nombre), aunque varias filas de la planilla compartan el mismo producto
  // con distintos formatos. ---
  var identidadAProductoId = {};
  var productosACrear = [];
  filasNuevo.forEach(function (fila) {
    var d = fila.datos;
    var identidad = d.codigo_producto || d.nombre_producto.toLowerCase();
    if (fila.productoExistente) {
      identidadAProductoId[identidad] = fila.productoExistente;
      return;
    }
    if (identidadAProductoId[identidad]) return;
    identidadAProductoId[identidad] = true; // marcado: se resuelve tras generar IDs
    productosACrear.push({ identidad: identidad, codigo_producto: d.codigo_producto,
      nombre: d.nombre_producto, categoria: d.categoria });
  });

  var idsProducto = productosACrear.length
    ? idNextBatch_('PRODUCTO', productosACrear.length) : [];
  var filasProductosNuevas = productosACrear.map(function (p, i) {
    identidadAProductoId[p.identidad] = idsProducto[i];
    historialEntradas.push({ entidad: 'PRODUCTO', entidad_id: idsProducto[i],
      campo: 'creacion', valor_anterior: '', valor_nuevo: p.nombre, origen: origen });
    return { producto_id: idsProducto[i], codigo_producto: p.codigo_producto,
      nombre: p.nombre, categoria: p.categoria, descripcion: '',
      activo: CONFIG.BOOL.SI, created_at: ahora, updated_at: ahora };
  });
  contadores.productosCreados = productosACrear.length;

  // --- Formatos nuevos: uno por fila NUEVO. ---
  var idsFormato = filasNuevo.length ? idNextBatch_('FORMATO', filasNuevo.length) : [];
  var filasFormatosNuevas = filasNuevo.map(function (fila, i) {
    var d = fila.datos;
    var identidad = d.codigo_producto || d.nombre_producto.toLowerCase();
    var productoId = identidadAProductoId[identidad];
    historialEntradas.push({ entidad: 'FORMATO', entidad_id: idsFormato[i],
      campo: 'creacion', valor_anterior: '',
      valor_nuevo: d.nombre_producto + ' / ' + d.nombre_formato + ' (' + d.codigo_barras + ')',
      origen: origen });
    return { formato_id: idsFormato[i], producto_id: productoId,
      codigo_barras: d.codigo_barras, nombre_formato: d.nombre_formato,
      tipo_empaque: d.tipo_empaque, unidades_por_empaque: utilToInt(d.unidades_por_empaque),
      activo: d.activo, created_at: ahora, updated_at: ahora };
  });
  contadores.formatosCreados = filasNuevo.length;

  if (filasProductosNuevas.length) dbAppendRows_('PRODUCTOS', filasProductosNuevas);
  if (filasFormatosNuevas.length) dbAppendRows_('FORMATOS_EMPAQUE', filasFormatosNuevas);

  // --- Actualizaciones: reescribir en memoria y subir cada hoja una vez. ---
  if (filasActualizar.length > 0) {
    var formatosActuales = dbReadAll_('FORMATOS_EMPAQUE');
    var formatoPorCodigo = {};
    formatosActuales.forEach(function (f) { formatoPorCodigo[f.codigo_barras] = f; });

    var productosActuales = dbReadAll_('PRODUCTOS');
    var productoPorId = {};
    productosActuales.forEach(function (p) { productoPorId[p.producto_id] = p; });

    var productosModificados = {};
    var formatosModificados = {};

    filasActualizar.forEach(function (fila) {
      var formato = formatoPorCodigo[fila.datos.codigo_barras];
      if (!formato) return; // desapareció entre previsualización y confirmación

      var tocoFormato = false;
      fila.cambios.forEach(function (c) {
        var entidadId = c.entidad === 'FORMATO' ? formato.formato_id : formato.producto_id;
        historialEntradas.push({ entidad: c.entidad, entidad_id: entidadId,
          campo: c.campo, valor_anterior: c.anterior, valor_nuevo: c.nuevo, origen: origen });
        if (c.entidad === 'FORMATO') {
          formato[c.campo] = c.nuevo;
          tocoFormato = true;
        } else {
          var producto = productoPorId[formato.producto_id];
          if (producto) {
            producto[c.campo] = c.nuevo;
            productosModificados[producto.producto_id] = true;
          }
        }
      });
      if (tocoFormato) {
        formato.updated_at = ahora;
        formatosModificados[formato.formato_id] = true;
      }
    });

    contadores.formatosActualizados = Object.keys(formatosModificados).length;
    contadores.productosActualizados = Object.keys(productosModificados).length;
    Object.keys(productosModificados).forEach(function (pid) {
      productoPorId[pid].updated_at = ahora;
    });

    dbWriteAllRows_('FORMATOS_EMPAQUE', formatosActuales);
    dbWriteAllRows_('PRODUCTOS', productosActuales);
  }

  if (historialEntradas.length > 0) {
    var idsHistorial = idNextBatch_('HISTORIAL', historialEntradas.length);
    var filasHistorial = historialEntradas.map(function (h, i) {
      return {
        historial_id: idsHistorial[i], fecha_hora: ahora, usuario_id: usuarioId,
        entidad: h.entidad, entidad_id: h.entidad_id, campo: h.campo,
        valor_anterior: h.valor_anterior === null || h.valor_anterior === undefined
          ? '' : String(h.valor_anterior),
        valor_nuevo: h.valor_nuevo === null || h.valor_nuevo === undefined
          ? '' : String(h.valor_nuevo),
        origen: h.origen
      };
    });
    dbAppendRows_('HISTORIAL_CATALOGO', filasHistorial);
  }

  return contadores;
}

/** Resultado de previsualización con error de estructura. */
function importacionResultadoVacio_(mensaje) {
  return {
    ok: false,
    erroresGlobales: [mensaje],
    resumen: { total: 0 },
    filas: []
  };
}
