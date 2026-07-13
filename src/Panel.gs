/**
 * Panel.gs — Datos agregados para el panel de jefatura (§20).
 */

/**
 * Resumen para el dashboard: totales, productos sin stock o bajo el mínimo
 * configurado (clave stock_minimo_default en Configuracion) y últimos
 * movimientos confirmados.
 */
function panelDashboard_(inventarioYaLeido) {
  var stockMinimo = parametrosObtener_().stock_minimo;
  var inventario = inventarioYaLeido || invListar_();

  var stockTotal = 0;
  var sinStock = [];
  var bajoMinimo = [];
  inventario.forEach(function (p) {
    stockTotal += p.stock_unidades;
    if (p.stock_unidades === 0) {
      sinStock.push({ producto_id: p.producto_id, nombre: p.nombre,
        categoria: p.categoria, codigo_producto: p.codigo_producto,
        updated_at: p.updated_at });
    } else if (p.stock_unidades <= stockMinimo) {
      bajoMinimo.push({ producto_id: p.producto_id, nombre: p.nombre,
        categoria: p.categoria, codigo_producto: p.codigo_producto,
        stock_unidades: p.stock_unidades, updated_at: p.updated_at });
    }
  });

  return {
    stock_minimo: stockMinimo,
    total_productos: inventario.length,
    stock_total_unidades: stockTotal,
    productos_sin_stock: sinStock,
    productos_bajo_minimo: bajoMinimo,
    // Fallos parciales de confirmación (M3): cabeceras EN_PROCESO con más
    // de 10 minutos. Normalmente vacío; si aparece algo, hubo un error a
    // mitad de escritura y conviene revisar/reconciliar ese movimiento.
    movimientos_en_proceso: movPendientesAntiguos_(10).map(function (m) {
      return { movimiento_id: m.movimiento_id, tipo: m.tipo,
        fecha_hora: m.fecha_hora, usuario: m.usuario_nombre_snapshot };
    }),
    ultimos_movimientos: movListar_({ limite: 10 })
  };
}

/**
 * Métricas para los gráficos del Dashboard (D-044): una sola lectura de
 * MOVIMIENTOS y MOVIMIENTO_DETALLE, reutilizada para las cinco vistas.
 * `dias` acota las series diarias y el ranking de rotación/actividad; la
 * evolución de stock es un saldo ACUMULADO, así que siempre se calcula
 * desde el historial completo — solo el tramo devuelto se recorta a `dias`.
 *
 * OJO: `MOVIMIENTOS.total_unidades` (cabecera) es una MAGNITUD ABSOLUTA
 * (suma de |delta| de cada ítem, ver movConfirmar_) — un RETIRO también
 * lo guarda positivo. El signo real para reconstruir el saldo vive en
 * MOVIMIENTO_DETALLE.total_unidades por ítem (D-039 ya lo documentó para
 * la reversa). Por eso el saldo acumulado se arma sumando los detalles,
 * no la cabecera.
 */
function panelMetricas_(dias) {
  dias = utilToInt(dias) || 30;
  var hoyMs = Date.now();
  var limiteMs = hoyMs - dias * 24 * 60 * 60 * 1000;
  var semanaActualMs = hoyMs - 7 * 24 * 60 * 60 * 1000;
  var semanaAnteriorMs = hoyMs - 14 * 24 * 60 * 60 * 1000;

  var movimientos = dbReadAll_('MOVIMIENTOS')
    .filter(function (m) { return m.estado === CONFIG.ESTADOS_MOVIMIENTO.CONFIRMADO; })
    .sort(function (a, b) {
      if (a.fecha_hora < b.fecha_hora) return -1;
      if (a.fecha_hora > b.fecha_hora) return 1;
      return 0;
    });

  var detalles = dbReadAll_('MOVIMIENTO_DETALLE');
  var deltaSignadoPorMovimiento = {};
  detalles.forEach(function (d) {
    var delta = utilToInt(d.total_unidades) || 0;
    deltaSignadoPorMovimiento[d.movimiento_id] =
      (deltaSignadoPorMovimiento[d.movimiento_id] || 0) + delta;
  });

  var saldoAcumulado = 0;
  var saldoPrevioVentana = 0; // saldo justo antes de entrar a la ventana de `dias`
  var saldoPorDia = {};       // 'yyyy-MM-dd' -> saldo al final de ese día (TODO el historial)
  var entradaPorDia = {};     // solo dentro de la ventana
  var retiroPorDia = {};
  var conteoPorUsuario = {};
  var idsRetiroVentana = {};
  var retirosSemanaActual = 0;
  var retirosSemanaAnterior = 0;

  movimientos.forEach(function (m) {
    // Cabecera: magnitud absoluta, sirve para mostrar "cuánto se movió".
    var magnitud = utilToInt(m.total_unidades) || 0;
    // Detalle sumado: sí trae el signo real, sirve para el saldo acumulado.
    saldoAcumulado += deltaSignadoPorMovimiento[m.movimiento_id] || 0;
    var fecha = m.fecha_hora.slice(0, 10);
    saldoPorDia[fecha] = saldoAcumulado;

    var t = new Date(m.fecha_hora.replace(' ', 'T')).getTime();
    if (isNaN(t)) t = 0;

    if (m.tipo === CONFIG.TIPOS_MOVIMIENTO.RETIRO) {
      if (t >= semanaActualMs) retirosSemanaActual += magnitud;
      else if (t >= semanaAnteriorMs) retirosSemanaAnterior += magnitud;
    }

    if (t < limiteMs) { saldoPrevioVentana = saldoAcumulado; return; }

    if (m.tipo === CONFIG.TIPOS_MOVIMIENTO.ENTRADA) {
      entradaPorDia[fecha] = (entradaPorDia[fecha] || 0) + magnitud;
    } else if (m.tipo === CONFIG.TIPOS_MOVIMIENTO.RETIRO) {
      retiroPorDia[fecha] = (retiroPorDia[fecha] || 0) + magnitud;
      idsRetiroVentana[m.movimiento_id] = true;
    }
    var nombreUsuario = m.usuario_nombre_snapshot || 'Desconocido';
    conteoPorUsuario[nombreUsuario] = (conteoPorUsuario[nombreUsuario] || 0) + 1;
  });

  var unidadesRetiroPorProducto = {};
  detalles.forEach(function (d) {
    if (!idsRetiroVentana[d.movimiento_id]) return;
    var nombreProducto = d.producto_nombre_snapshot || d.producto_id;
    unidadesRetiroPorProducto[nombreProducto] =
      (unidadesRetiroPorProducto[nombreProducto] || 0) + Math.abs(utilToInt(d.total_unidades) || 0);
  });

  // Series densas día a día (sin huecos) para los últimos `dias` días: los
  // días sin movimiento igual aparecen, con 0 (entrada/retiro) o el último
  // saldo conocido (evolución de stock — nunca "cae a cero" por no tener
  // movimientos ese día).
  //
  // Utilities.formatDate con formato 'yyyy-MM-dd' funciona bien contra la
  // API real, pero el mock local de pruebas (scripts/entorno-gas.js) ignora
  // el formato pedido y siempre devuelve fecha+hora completa — por eso se
  // pide el formato largo y se recorta con slice(0,10), igual que en el
  // resto del archivo, en vez de confiar en que el formato corto funcione.
  var movimientosPorDia = [];
  var evolucionStock = [];
  var saldoActual = saldoPrevioVentana;
  for (var i = dias - 1; i >= 0; i--) {
    var fechaTexto = Utilities.formatDate(new Date(hoyMs - i * 24 * 60 * 60 * 1000),
      CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss').slice(0, 10);
    movimientosPorDia.push({ fecha: fechaTexto,
      entrada: entradaPorDia[fechaTexto] || 0, retiro: retiroPorDia[fechaTexto] || 0 });
    if (saldoPorDia[fechaTexto] !== undefined) saldoActual = saldoPorDia[fechaTexto];
    evolucionStock.push({ fecha: fechaTexto, stock: saldoActual });
  }

  var topRotacion = Object.keys(unidadesRetiroPorProducto).map(function (nombreProducto) {
    return { producto: nombreProducto, unidades: unidadesRetiroPorProducto[nombreProducto] };
  }).sort(function (a, b) { return b.unidades - a.unidades; }).slice(0, 10);

  var actividadUsuario = Object.keys(conteoPorUsuario).map(function (nombreUsuario) {
    return { usuario: nombreUsuario, movimientos: conteoPorUsuario[nombreUsuario] };
  }).sort(function (a, b) { return b.movimientos - a.movimientos; });

  var cambioPorcentual = retirosSemanaAnterior > 0
    ? Math.round(((retirosSemanaActual - retirosSemanaAnterior) / retirosSemanaAnterior) * 100)
    : (retirosSemanaActual > 0 ? 100 : 0);

  return {
    dias: dias,
    movimientos_por_dia: movimientosPorDia,
    top_rotacion: topRotacion,
    evolucion_stock: evolucionStock,
    actividad_usuario: actividadUsuario,
    comparacion_semana: {
      retiros_semana_actual: retirosSemanaActual,
      retiros_semana_anterior: retirosSemanaAnterior,
      cambio_porcentual: cambioPorcentual
    }
  };
}
