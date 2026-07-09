/**
 * Panel.gs — Datos agregados para el panel de jefatura (§20).
 */

/**
 * Resumen para el dashboard: totales, productos sin stock o bajo el mínimo
 * configurado (clave stock_minimo_default en Configuracion) y últimos
 * movimientos confirmados.
 */
function panelDashboard_() {
  var stockMinimo = utilToInt(dbGetConfigValue_('stock_minimo_default', '10')) || 0;
  var inventario = invListar_();

  var stockTotal = 0;
  var sinStock = [];
  var bajoMinimo = [];
  inventario.forEach(function (p) {
    stockTotal += p.stock_unidades;
    if (p.stock_unidades === 0) {
      sinStock.push({ producto_id: p.producto_id, nombre: p.nombre });
    } else if (p.stock_unidades <= stockMinimo) {
      bajoMinimo.push({ producto_id: p.producto_id, nombre: p.nombre,
        stock_unidades: p.stock_unidades });
    }
  });

  return {
    stock_minimo: stockMinimo,
    total_productos: inventario.length,
    stock_total_unidades: stockTotal,
    productos_sin_stock: sinStock,
    productos_bajo_minimo: bajoMinimo,
    ultimos_movimientos: movListar_({}).slice(0, 10)
  };
}
