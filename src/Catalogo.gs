/**
 * Catalogo.gs — Administración del catálogo de productos y formatos de empaque.
 *
 * Reglas clave (prompt maestro §8):
 * - Un producto puede tener múltiples formatos, cada uno con su código de
 *   barras y equivalencia en unidades.
 * - El código de barras debe ser único entre formatos ACTIVOS.
 * - Cambiar el catálogo NUNCA modifica el stock ni el historial de
 *   movimientos (los detalles guardan snapshots).
 * - Se prefiere desactivar antes que eliminar. Eliminar (catalogoEliminar_)
 *   solo se permite si el producto/formato NUNCA tuvo stock ni movimientos;
 *   si los tuvo, se bloquea (nunca se borra historial) y hay que desactivar.
 * - Todo cambio queda en HistorialCatalogo.
 *
 * Nota Fase 7: el usuario responsable se registra con un placeholder hasta
 * implementar autenticación; entonces estas funciones recibirán la sesión.
 */

/** Catálogo completo: productos con sus formatos anidados. */
function catalogoListar_() {
  var productos = dbReadAll_('PRODUCTOS');
  var formatos = dbReadAll_('FORMATOS_EMPAQUE');
  var inventario = dbReadAll_('INVENTARIO');

  var stockPorProducto = {};
  inventario.forEach(function (i) {
    stockPorProducto[i.producto_id] = utilToInt(i.stock_unidades) || 0;
  });

  var formatosPorProducto = {};
  formatos.forEach(function (f) {
    (formatosPorProducto[f.producto_id] = formatosPorProducto[f.producto_id] || []).push(f);
  });

  return productos.map(function (p) {
    return {
      producto_id: p.producto_id,
      codigo_producto: p.codigo_producto,
      nombre: p.nombre,
      categoria: p.categoria,
      descripcion: p.descripcion,
      activo: p.activo,
      created_at: p.created_at,
      updated_at: p.updated_at,
      stock_unidades: stockPorProducto[p.producto_id] || 0,
      formatos: formatosPorProducto[p.producto_id] || []
    };
  });
}

/** Crea un producto. Devuelve el producto creado. Bajo lock (A5). */
function catalogoCrearProducto_(datos, origen, usuarioId) {
  origen = origen || CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL;
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;

  var nombre = valRequireNonEmpty(datos.nombre, 'nombre del producto');
  var codigoProducto = utilTrim(datos.codigo_producto);

  return dbConLock_(function () {
    if (codigoProducto) {
      var existente = dbFindOne_('PRODUCTOS', function (p) {
        return p.codigo_producto === codigoProducto;
      });
      if (existente) {
        throw new Error(
          'Ya existe un producto con código "' + codigoProducto + '" (' +
          existente.nombre + ').');
      }
    }

    var ahora = utilNow();
    var producto = {
      producto_id: idNext_('PRODUCTO'),
      codigo_producto: codigoProducto,
      nombre: nombre,
      categoria: utilTrim(datos.categoria),
      descripcion: utilTrim(datos.descripcion),
      activo: CONFIG.BOOL.SI,
      created_at: ahora,
      updated_at: ahora
    };
    dbAppendRow_('PRODUCTOS', producto);
    histRegistrar_(usuarioId, 'PRODUCTO', producto.producto_id, 'creacion', '',
      producto.nombre, origen);
    return producto;
  });
}

/** Edita campos de un producto existente. El stock nunca se toca (§8.9). */
function catalogoEditarProducto_(productoId, patch, origen, usuarioId) {
  origen = origen || CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL;
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;

  var producto = dbFindById_('PRODUCTOS', productoId);
  if (!producto) throw new Error('Producto no encontrado: ' + productoId);

  var cambios = {};
  ['codigo_producto', 'nombre', 'categoria', 'descripcion'].forEach(function (campo) {
    if (patch[campo] !== undefined && utilTrim(patch[campo]) !== utilTrim(producto[campo])) {
      cambios[campo] = utilTrim(patch[campo]);
    }
  });
  if (Object.keys(cambios).length === 0) return producto;

  if (cambios.nombre !== undefined) {
    valRequireNonEmpty(cambios.nombre, 'nombre del producto');
  }
  if (cambios.codigo_producto) {
    var duplicado = dbFindOne_('PRODUCTOS', function (p) {
      return p.codigo_producto === cambios.codigo_producto &&
             p.producto_id !== producto.producto_id;
    });
    if (duplicado) {
      throw new Error(
        'El código "' + cambios.codigo_producto + '" ya lo usa el producto ' +
        duplicado.nombre + '.');
    }
  }

  histRegistrarCambios_(usuarioId, 'PRODUCTO', producto.producto_id, producto,
    cambios, origen);
  cambios.updated_at = utilNow();
  dbUpdateById_('PRODUCTOS', productoId, cambios);
  return dbFindById_('PRODUCTOS', productoId);
}

/** Crea un formato de empaque para un producto existente. Bajo lock (A5). */
function catalogoCrearFormato_(datos, origen, usuarioId) {
  origen = origen || CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL;
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;

  var codigoBarras = utilNormalizeBarcode(datos.codigo_barras);
  if (!valIsCodigoBarras(codigoBarras)) {
    throw new Error('Código de barras inválido: "' + datos.codigo_barras + '"');
  }
  var tipoEmpaque = utilTrim(datos.tipo_empaque).toUpperCase();
  if (!valIsTipoEmpaque(tipoEmpaque)) {
    throw new Error(
      'Tipo de empaque inválido: "' + datos.tipo_empaque +
      '". Válidos: ' + Object.keys(CONFIG.TIPOS_EMPAQUE).join(', '));
  }
  var unidades = valRequirePositiveInt(datos.unidades_por_empaque, 'unidades por empaque');

  return dbConLock_(function () {
    var producto = dbFindById_('PRODUCTOS', utilTrim(datos.producto_id));
    if (!producto) throw new Error('Producto no encontrado: ' + datos.producto_id);
    catalogoValidarCodigoBarrasUnico_(codigoBarras, null);

    var ahora = utilNow();
    var formato = {
      formato_id: idNext_('FORMATO'),
      producto_id: producto.producto_id,
      codigo_barras: codigoBarras,
      nombre_formato: valRequireNonEmpty(datos.nombre_formato, 'nombre del formato'),
      tipo_empaque: tipoEmpaque,
      unidades_por_empaque: unidades,
      activo: CONFIG.BOOL.SI,
      created_at: ahora,
      updated_at: ahora
    };
    dbAppendRow_('FORMATOS_EMPAQUE', formato);
    histRegistrar_(usuarioId, 'FORMATO', formato.formato_id, 'creacion', '',
      producto.nombre + ' / ' + formato.nombre_formato + ' (' + codigoBarras + ')',
      origen);
    return formato;
  });
}

/**
 * Edita un formato. Cambiar unidades_por_empaque afecta SOLO movimientos
 * futuros: los históricos conservan su snapshot y el stock no se recalcula
 * (§8.8, §8.9, Caso 10).
 */
function catalogoEditarFormato_(formatoId, patch, origen, usuarioId) {
  origen = origen || CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL;
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;

  var formato = dbFindById_('FORMATOS_EMPAQUE', formatoId);
  if (!formato) throw new Error('Formato no encontrado: ' + formatoId);

  var cambios = {};
  ['codigo_barras', 'nombre_formato', 'tipo_empaque', 'unidades_por_empaque']
    .forEach(function (campo) {
      if (patch[campo] !== undefined && utilTrim(patch[campo]) !== utilTrim(formato[campo])) {
        cambios[campo] = utilTrim(patch[campo]);
      }
    });
  if (Object.keys(cambios).length === 0) return formato;

  if (cambios.codigo_barras !== undefined) {
    cambios.codigo_barras = utilNormalizeBarcode(cambios.codigo_barras);
    if (!valIsCodigoBarras(cambios.codigo_barras)) {
      throw new Error('Código de barras inválido: "' + cambios.codigo_barras + '"');
    }
    if (utilToBool(formato.activo)) {
      catalogoValidarCodigoBarrasUnico_(cambios.codigo_barras, formatoId);
    }
  }
  if (cambios.tipo_empaque !== undefined) {
    cambios.tipo_empaque = cambios.tipo_empaque.toUpperCase();
    if (!valIsTipoEmpaque(cambios.tipo_empaque)) {
      throw new Error('Tipo de empaque inválido: "' + cambios.tipo_empaque + '"');
    }
  }
  if (cambios.unidades_por_empaque !== undefined) {
    cambios.unidades_por_empaque =
      valRequirePositiveInt(cambios.unidades_por_empaque, 'unidades por empaque');
  }

  histRegistrarCambios_(usuarioId, 'FORMATO', formatoId, formato, cambios, origen);
  cambios.updated_at = utilNow();
  dbUpdateById_('FORMATOS_EMPAQUE', formatoId, cambios);
  return dbFindById_('FORMATOS_EMPAQUE', formatoId);
}

/**
 * Activa o desactiva un producto o formato.
 *
 * Si se desactiva algo con stock o movimientos históricos y forzar=false,
 * NO aplica el cambio: devuelve { requiereConfirmacion: true, advertencia }
 * para que la interfaz pida confirmación explícita (§8.10). Nunca se elimina
 * físicamente nada.
 */
function catalogoCambiarEstado_(entidad, id, activar, forzar, origen, usuarioId) {
  origen = origen || CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL;
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;

  var sheetKey = entidad === 'PRODUCTO' ? 'PRODUCTOS' : 'FORMATOS_EMPAQUE';
  var registro = dbFindById_(sheetKey, id);
  if (!registro) throw new Error(entidad + ' no encontrado: ' + id);

  var nuevoEstado = utilBoolToSheet(!!activar);
  if (registro.activo === nuevoEstado) {
    return { aplicado: false, mensaje: 'El registro ya estaba en ese estado.' };
  }

  if (!activar && !forzar) {
    var advertencia = catalogoAdvertenciaDesactivacion_(entidad, registro);
    if (advertencia) {
      return { aplicado: false, requiereConfirmacion: true, advertencia: advertencia };
    }
  }

  if (activar && entidad === 'FORMATO') {
    catalogoValidarCodigoBarrasUnico_(registro.codigo_barras, id);
  }

  histRegistrar_(usuarioId, entidad, id, 'activo', registro.activo, nuevoEstado, origen);
  dbUpdateById_(sheetKey, id, { activo: nuevoEstado, updated_at: utilNow() });
  return { aplicado: true };
}

/**
 * Activa o desactiva VARIOS productos en una sola operación (una escritura
 * a Sheets en vez de una llamada por producto). La interfaz pide una única
 * confirmación por el lote completo, cumpliendo el espíritu de §8.10; el
 * historial registra el cambio de cada producto individualmente.
 */
function catalogoCambiarEstadoLoteProductos_(productoIds, activar, usuarioId) {
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;
  if (!productoIds || productoIds.length === 0) {
    throw new Error('No se seleccionó ningún producto.');
  }
  var nuevoEstado = utilBoolToSheet(!!activar);
  var buscados = {};
  productoIds.forEach(function (id) { buscados[utilTrim(id)] = true; });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error('El sistema está procesando otra operación. Intenta nuevamente.');
  }
  try {
    var productos = dbReadAll_('PRODUCTOS');
    var ahora = utilNow();
    var cambiados = [];
    productos.forEach(function (p) {
      if (buscados[p.producto_id] && p.activo !== nuevoEstado) {
        p.activo = nuevoEstado;
        p.updated_at = ahora;
        cambiados.push(p.producto_id);
      }
    });

    if (cambiados.length > 0) {
      dbWriteAllRows_('PRODUCTOS', productos);
      var ids = idNextBatch_('HISTORIAL', cambiados.length);
      dbAppendRows_('HISTORIAL_CATALOGO', cambiados.map(function (pid, i) {
        return {
          historial_id: ids[i], fecha_hora: ahora, usuario_id: usuarioId,
          entidad: 'PRODUCTO', entidad_id: pid, campo: 'activo',
          valor_anterior: utilBoolToSheet(!activar), valor_nuevo: nuevoEstado,
          origen: CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL
        };
      }));
    }
    return { cambiados: cambiados.length,
      sin_cambio: productoIds.length - cambiados.length };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Elimina físicamente un formato de empaque. Bloquea si alguna vez apareció
 * en un movimiento (MOVIMIENTO_DETALLE.formato_id): ahí la trazabilidad
 * depende de que el registro exista para desambiguar (aunque los detalles ya
 * guardan snapshots de texto, el borrado nunca es reversible). Sin
 * movimientos, no hay ningún dato que perder.
 */
function catalogoEliminarFormato_(formatoId, origen, usuarioId) {
  origen = origen || CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL;
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;

  return dbConLock_(function () {
    var formato = dbFindById_('FORMATOS_EMPAQUE', formatoId);
    if (!formato) throw new Error('Formato no encontrado: ' + formatoId);

    var tieneMovimientos = dbFindOne_('MOVIMIENTO_DETALLE', function (d) {
      return d.formato_id === formatoId;
    });
    if (tieneMovimientos) {
      throw new Error('Este formato tiene movimientos históricos y no puede ' +
        'eliminarse (la trazabilidad conserva sus datos). Desactívalo en su lugar.');
    }

    dbDeleteRowByIndex_('FORMATOS_EMPAQUE', formato._rowIndex);
    histRegistrar_(usuarioId, 'FORMATO', formatoId, 'eliminacion',
      formato.nombre_formato + ' (' + formato.codigo_barras + ')', '', origen);
    return { formato_id: formatoId, eliminado: true };
  });
}

/**
 * Elimina físicamente un producto y, en cascada, sus formatos de empaque —
 * seguro porque MOVIMIENTO_DETALLE guarda producto_id Y formato_id juntos en
 * cada detalle (§ arriba): si el producto nunca tuvo un movimiento, ninguno
 * de sus formatos pudo tenerlo tampoco. Bloquea si tiene stock (aunque sea
 * sin movimientos, p. ej. un ajuste manual) o movimientos históricos.
 */
function catalogoEliminarProducto_(productoId, origen, usuarioId) {
  origen = origen || CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL;
  usuarioId = usuarioId || CONFIG.USUARIO_PENDIENTE_AUTH;

  return dbConLock_(function () {
    var producto = dbFindById_('PRODUCTOS', productoId);
    if (!producto) throw new Error('Producto no encontrado: ' + productoId);

    var inv = dbFindById_('INVENTARIO', productoId);
    var stock = inv ? (utilToInt(inv.stock_unidades) || 0) : 0;
    if (stock > 0) {
      throw new Error('Este producto tiene ' + stock + ' unidades en stock y no ' +
        'puede eliminarse. Desactívalo en su lugar.');
    }
    var tieneMovimientos = dbFindOne_('MOVIMIENTO_DETALLE', function (d) {
      return d.producto_id === productoId;
    });
    if (tieneMovimientos) {
      throw new Error('Este producto tiene movimientos históricos y no puede ' +
        'eliminarse (la trazabilidad conserva sus datos). Desactívalo en su lugar.');
    }

    var formatos = dbFindWhere_('FORMATOS_EMPAQUE', function (f) {
      return f.producto_id === productoId;
    });
    formatos.forEach(function (f) { dbDeleteRowByIndex_('FORMATOS_EMPAQUE', f._rowIndex); });
    if (inv) dbDeleteRowByIndex_('INVENTARIO', inv._rowIndex);
    dbDeleteRowByIndex_('PRODUCTOS', producto._rowIndex);

    histRegistrar_(usuarioId, 'PRODUCTO', productoId, 'eliminacion',
      producto.nombre + ' (' + formatos.length + ' formato(s))', '', origen);
    return { producto_id: productoId, eliminado: true, formatos_eliminados: formatos.length };
  });
}

/**
 * Elimina varios productos. No usa un único lock para todo el lote (a
 * diferencia de activar/desactivar en lote): cada producto puede bloquearse
 * por una razón distinta (stock, movimientos), así que se procesan uno por
 * uno y se informa cuáles se eliminaron y cuáles no, con el motivo.
 */
function catalogoEliminarLoteProductos_(productoIds, usuarioId) {
  if (!productoIds || productoIds.length === 0) {
    throw new Error('No se seleccionó ningún producto.');
  }
  var eliminados = [];
  var bloqueados = [];
  productoIds.forEach(function (id) {
    id = utilTrim(id);
    try {
      catalogoEliminarProducto_(id, CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL, usuarioId);
      eliminados.push(id);
    } catch (e) {
      var producto = dbFindById_('PRODUCTOS', id);
      bloqueados.push({ producto_id: id, nombre: producto ? producto.nombre : id,
        motivo: e.message });
    }
  });
  return { eliminados: eliminados.length, bloqueados: bloqueados };
}

/** Advertencia si la entidad tiene stock o movimientos históricos. */
function catalogoAdvertenciaDesactivacion_(entidad, registro) {
  var productoId = entidad === 'PRODUCTO' ? registro.producto_id : registro.producto_id;
  var partes = [];

  var inv = dbFindById_('INVENTARIO', productoId);
  var stock = inv ? (utilToInt(inv.stock_unidades) || 0) : 0;
  if (stock > 0) partes.push(stock + ' unidades en stock');

  var tieneMovimientos = dbFindOne_('MOVIMIENTO_DETALLE', function (d) {
    return entidad === 'PRODUCTO'
      ? d.producto_id === registro.producto_id
      : d.formato_id === registro.formato_id;
  });
  if (tieneMovimientos) partes.push('movimientos históricos');

  if (partes.length === 0) return null;
  return 'Este ' + entidad.toLowerCase() + ' tiene ' + partes.join(' y ') +
    '. Se desactivará pero su historial y stock se conservan.';
}

/** Lanza error si otro formato ACTIVO ya usa el código de barras (§8.5). */
function catalogoValidarCodigoBarrasUnico_(codigoBarras, formatoIdExcluido) {
  var conflicto = dbFindOne_('FORMATOS_EMPAQUE', function (f) {
    return f.codigo_barras === codigoBarras &&
           utilToBool(f.activo) &&
           f.formato_id !== formatoIdExcluido;
  });
  if (conflicto) {
    var producto = dbFindById_('PRODUCTOS', conflicto.producto_id);
    throw new Error(
      'El código de barras "' + codigoBarras + '" ya está en uso por el ' +
      'formato activo "' + conflicto.nombre_formato + '" del producto "' +
      (producto ? producto.nombre : conflicto.producto_id) + '".');
  }
}

/**
 * Busca un formato ACTIVO por código de barras, con su producto. Base del
 * escaneo en ingresos y retiros (Fases 4 y 5). Devuelve null si no existe.
 */
function catalogoBuscarPorCodigoBarras_(codigoBarras) {
  var codigo = utilNormalizeBarcode(codigoBarras);
  var formato = dbFindOne_('FORMATOS_EMPAQUE', function (f) {
    return f.codigo_barras === codigo && utilToBool(f.activo);
  });
  if (!formato) return null;
  var producto = dbFindById_('PRODUCTOS', formato.producto_id);
  if (!producto || !utilToBool(producto.activo)) return null;
  return { producto: producto, formato: formato };
}

/**
 * Catálogo liviano (solo identidad: código → producto/formato, SIN stock)
 * para que el cliente lo guarde localmente y reconozca un código escaneado
 * sin depender de la red en ese instante (D-047, mitigación de "sin señal"
 * en Retiro). El stock NUNCA se cachea aquí a propósito: sigue
 * validándose siempre en el servidor al confirmar (movConfirmar_ relee todo
 * bajo lock), así que esto es una comodidad de identificación, no un hueco
 * de seguridad ni de integridad de datos.
 */
function catalogoListarOffline_() {
  var productosActivos = {};
  dbReadAll_('PRODUCTOS').forEach(function (p) {
    if (utilToBool(p.activo)) productosActivos[p.producto_id] = p;
  });
  return dbReadAll_('FORMATOS_EMPAQUE')
    .filter(function (f) { return utilToBool(f.activo) && productosActivos[f.producto_id]; })
    .map(function (f) {
      var p = productosActivos[f.producto_id];
      return {
        codigo_barras: f.codigo_barras,
        producto_id: p.producto_id,
        producto_nombre: p.nombre,
        formato_id: f.formato_id,
        formato_nombre: f.nombre_formato,
        tipo_empaque: f.tipo_empaque,
        unidades_por_empaque: utilToInt(f.unidades_por_empaque)
      };
    });
}

/** Exporta el catálogo completo como CSV (§8.13), reimportable tras editar. */
function catalogoExportarCsv_() {
  var productos = {};
  dbReadAll_('PRODUCTOS').forEach(function (p) { productos[p.producto_id] = p; });

  var filas = [[
    'producto_id', 'codigo_producto', 'nombre_producto', 'categoria',
    'producto_activo', 'formato_id', 'codigo_barras', 'nombre_formato',
    'tipo_empaque', 'unidades_por_empaque', 'activo'
  ]];

  dbReadAll_('FORMATOS_EMPAQUE').forEach(function (f) {
    var p = productos[f.producto_id] || {};
    filas.push([
      f.producto_id, p.codigo_producto || '', p.nombre || '', p.categoria || '',
      p.activo || '', f.formato_id, f.codigo_barras, f.nombre_formato,
      f.tipo_empaque, f.unidades_por_empaque, f.activo
    ]);
    delete productos[f.producto_id];
  });

  // Productos sin formatos también se exportan (fila sin datos de formato).
  Object.keys(productos).forEach(function (pid) {
    var p = productos[pid];
    filas.push([p.producto_id, p.codigo_producto, p.nombre, p.categoria,
      p.activo, '', '', '', '', '', '']);
  });

  return utilToCsv(filas);
}
