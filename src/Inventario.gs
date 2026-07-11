/**
 * Inventario.gs — Estado actual del stock por producto.
 *
 * El inventario es una VISTA optimizada del estado actual: la fuente de
 * auditoría son Movimientos + MovimientoDetalle (§19). Este módulo solo lee;
 * la única escritura (invActualizarStock_) ocurre dentro de la transacción
 * de movConfirmar_, bajo bloqueo. Nada más debe modificar la hoja Inventario.
 */

/** Stock actual en unidades de un producto (0 si nunca tuvo movimientos). */
function invGetStock_(productoId) {
  var fila = dbFindById_('INVENTARIO', productoId);
  return fila ? (utilToInt(fila.stock_unidades) || 0) : 0;
}

/**
 * Inventario completo para consulta: producto, stock en unidades,
 * equivalencia aproximada por cada formato activo y última actualización.
 */
function invListar_() {
  var inventario = {};
  dbReadAll_('INVENTARIO').forEach(function (i) { inventario[i.producto_id] = i; });

  var formatosPorProducto = {};
  dbReadAll_('FORMATOS_EMPAQUE').forEach(function (f) {
    if (!utilToBool(f.activo)) return;
    (formatosPorProducto[f.producto_id] = formatosPorProducto[f.producto_id] || []).push(f);
  });

  return dbReadAll_('PRODUCTOS')
    .filter(function (p) { return utilToBool(p.activo); })
    .map(function (p) {
      var inv = inventario[p.producto_id];
      var stock = inv ? (utilToInt(inv.stock_unidades) || 0) : 0;
      var equivalencias = (formatosPorProducto[p.producto_id] || [])
        .map(function (f) {
          var unidades = utilToInt(f.unidades_por_empaque) || 1;
          return {
            nombre_formato: f.nombre_formato,
            codigo_barras: f.codigo_barras, // para armar ajustes desde el panel
            unidades_por_empaque: unidades,
            empaques_completos: Math.floor(stock / unidades)
          };
        });
      return {
        producto_id: p.producto_id,
        codigo_producto: p.codigo_producto,
        nombre: p.nombre,
        categoria: p.categoria,
        stock_unidades: stock,
        equivalencias: equivalencias,
        updated_at: inv ? inv.updated_at : '',
        updated_by: inv ? inv.updated_by : ''
      };
    });
}

/**
 * INTERNA — escribe el stock de un producto. Solo debe invocarse desde
 * movConfirmar_, dentro del bloqueo de la transacción. Crea la fila de
 * inventario si el producto nunca tuvo stock.
 */
function invActualizarStock_(productoId, nuevoStock, usuarioId) {
  if (nuevoStock < 0) {
    // Defensa en profundidad: movConfirmar_ ya validó. Nunca stock negativo.
    throw new Error('Stock negativo no permitido para ' + productoId + '.');
  }
  var fila = dbFindById_('INVENTARIO', productoId);
  if (fila) {
    dbUpdateRowByIndex_('INVENTARIO', fila._rowIndex, {
      stock_unidades: nuevoStock,
      updated_at: utilNow(),
      updated_by: usuarioId
    });
  } else {
    dbAppendRow_('INVENTARIO', {
      producto_id: productoId,
      stock_unidades: nuevoStock,
      updated_at: utilNow(),
      updated_by: usuarioId
    });
  }
}
