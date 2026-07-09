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
function importacionPlantillaCsv() {
  var headers = CONFIG.IMPORT_PLANILLA.columns.map(function (c) { return c.header; });
  var filas = [headers].concat(CONFIG.IMPORT_PLANILLA.exampleRows);
  return utilToCsv(filas);
}

/** Instrucciones de llenado mostradas junto a la plantilla. */
function importacionInstrucciones() {
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
function importacionPrevisualizar(csvText, modo) {
  modo = utilTrim(modo).toUpperCase() || CONFIG.MODOS_IMPORTACION.AGREGAR_Y_ACTUALIZAR;
  if (!CONFIG.MODOS_IMPORTACION[modo]) {
    throw new Error('Modo de importación inválido: ' + modo);
  }

  var parsed = utilParseCsv(csvText);
  if (parsed.rows.length === 0) {
    return importacionResultadoVacio_('El archivo está vacío.');
  }

  // Mapear encabezados de la planilla a índices de columna (tolerante a
  // mayúsculas y columnas extra, p. ej. un catálogo exportado y editado).
  var headers = parsed.rows[0].map(function (h) { return utilTrim(h).toLowerCase(); });
  var indice = {};
  var faltantes = [];
  CONFIG.IMPORT_PLANILLA.columns.forEach(function (col) {
    var idx = headers.indexOf(col.header.toLowerCase());
    if (idx === -1 && col.required) faltantes.push(col.header);
    indice[col.header] = idx;
  });
  if (faltantes.length > 0) {
    return importacionResultadoVacio_(
      'Faltan columnas obligatorias: ' + faltantes.join(', ') +
      '. Descarga la plantilla oficial para ver la estructura esperada.');
  }

  // Estado actual del catálogo para clasificar contra él.
  var productos = dbReadAll('PRODUCTOS');
  var formatos = dbReadAll('FORMATOS_EMPAQUE');
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
 */
function importacionAplicar(csvText, modo, nombreArchivo, usuarioId) {
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;
  var origen = CONFIG.ORIGENES_CAMBIO.IMPORTACION_PLANILLA;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error('El sistema está procesando otra operación. Intenta nuevamente.');
  }
  try {
    var prev = importacionPrevisualizar(csvText, modo);
    if (!prev.ok) {
      throw new Error('La planilla tiene errores de estructura: ' +
        prev.erroresGlobales.join(' '));
    }

    var contadores = { productosCreados: 0, productosActualizados: 0,
      formatosCreados: 0, formatosActualizados: 0 };
    // Productos creados durante esta importación, para que varias filas del
    // mismo producto nuevo (distintos formatos) no lo dupliquen.
    var creadosPorIdentidad = {};

    prev.filas.forEach(function (fila) {
      if (fila.estado === CONFIG.ESTADOS_FILA_IMPORT.NUEVO) {
        importacionAplicarNuevo_(fila, creadosPorIdentidad, contadores, origen, usuarioId);
      } else if (fila.estado === CONFIG.ESTADOS_FILA_IMPORT.ACTUALIZAR) {
        importacionAplicarActualizacion_(fila, contadores, origen, usuarioId);
      }
    });

    var registro = {
      importacion_id: idNext('IMPORTACION'),
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
    dbAppendRow('IMPORTACIONES', registro);

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
function importacionListar(limite) {
  var rows = dbReadAll('IMPORTACIONES');
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
  return {
    codigo_producto: leer('codigo_producto'),
    nombre_producto: leer('nombre_producto'),
    categoria: leer('categoria'),
    codigo_barras: utilNormalizeBarcode(leer('codigo_barras')),
    nombre_formato: leer('nombre_formato'),
    tipo_empaque: leer('tipo_empaque').toUpperCase(),
    unidades_por_empaque: leer('unidades_por_empaque'),
    activo: leer('activo') === '' ? CONFIG.BOOL.SI : leer('activo').toUpperCase()
  };
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

/** Crea producto (si no existe) y formato para una fila NUEVO. */
function importacionAplicarNuevo_(fila, creadosPorIdentidad, contadores, origen, usuarioId) {
  var datos = fila.datos;
  var identidad = datos.codigo_producto || datos.nombre_producto.toLowerCase();

  var productoId = fila.productoExistente || creadosPorIdentidad[identidad] || null;
  if (!productoId) {
    var producto = catalogoCrearProducto({
      codigo_producto: datos.codigo_producto,
      nombre: datos.nombre_producto,
      categoria: datos.categoria
    }, origen, usuarioId);
    productoId = producto.producto_id;
    creadosPorIdentidad[identidad] = productoId;
    contadores.productosCreados++;
  }

  var formato = catalogoCrearFormato({
    producto_id: productoId,
    codigo_barras: datos.codigo_barras,
    nombre_formato: datos.nombre_formato,
    tipo_empaque: datos.tipo_empaque,
    unidades_por_empaque: datos.unidades_por_empaque
  }, origen, usuarioId);
  contadores.formatosCreados++;

  if (datos.activo === CONFIG.BOOL.NO) {
    catalogoCambiarEstado('FORMATO', formato.formato_id, false, true, origen, usuarioId);
  }
}

/** Aplica los cambios detectados de una fila ACTUALIZAR. */
function importacionAplicarActualizacion_(fila, contadores, origen, usuarioId) {
  var formato = dbFindOne('FORMATOS_EMPAQUE', function (f) {
    return f.codigo_barras === fila.datos.codigo_barras;
  });
  if (!formato) return; // desapareció entre previsualización y confirmación

  var patchFormato = {};
  var patchProducto = {};
  fila.cambios.forEach(function (c) {
    if (c.entidad === 'FORMATO' && c.campo !== 'activo') {
      patchFormato[c.campo] = c.nuevo;
    } else if (c.entidad === 'PRODUCTO') {
      patchProducto[c.campo === 'nombre' ? 'nombre' : c.campo] = c.nuevo;
    }
  });

  var formatoActualizado = false;
  if (Object.keys(patchFormato).length > 0) {
    catalogoEditarFormato(formato.formato_id, patchFormato, origen, usuarioId);
    formatoActualizado = true;
  }
  var cambioActivo = fila.cambios.filter(function (c) {
    return c.entidad === 'FORMATO' && c.campo === 'activo';
  })[0];
  if (cambioActivo) {
    catalogoCambiarEstado('FORMATO', formato.formato_id,
      cambioActivo.nuevo === CONFIG.BOOL.SI, true, origen, usuarioId);
    formatoActualizado = true;
  }
  if (formatoActualizado) contadores.formatosActualizados++;
  if (Object.keys(patchProducto).length > 0) {
    catalogoEditarProducto(formato.producto_id, patchProducto, origen, usuarioId);
    contadores.productosActualizados++;
  }
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
