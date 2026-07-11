/**
 * Movimientos.gs — Confirmación transaccional de movimientos de inventario.
 *
 * Es el ÚNICO camino por el que cambia el stock (regla de negocio nº 1).
 * ENTRADA (Fase 4), RETIRO (Fase 5), AJUSTE y REVERSA usan movConfirmar_.
 *
 * Secuencia obligatoria (§5, §15):
 *   1. Obtener bloqueo.
 *   2. Releer catálogo y stock VIGENTES (nunca confiar en lo que vio el
 *      cliente antes de confirmar).
 *   3. Validar TODO el movimiento; si un solo ítem falla, no se escribe nada
 *      (sin confirmaciones parciales).
 *   4. Escribir cabecera EN_PROCESO → detalles con snapshots → inventario →
 *      cabecera CONFIRMADO. Un fallo intermedio deja un EN_PROCESO
 *      detectable que no cuenta como confirmado (D-005).
 *   5. Liberar bloqueo.
 *
 * Los movimientos confirmados son inmutables: los errores se corrigen con un
 * nuevo movimiento AJUSTE o REVERSA (§17), nunca editando ni borrando.
 */

/**
 * Confirma un movimiento completo.
 *
 * datos = {
 *   tipo: 'ENTRADA' | 'RETIRO' | 'AJUSTE' | 'REVERSA',
 *   usuarioId, usuarioNombre,          // responsable (sesión real en Fase 7)
 *   origen, destino, observacion,      // informativos (ej. destino 'TIENDA')
 *   items: [{ codigo_barras, cantidad_empaques }]
 * }
 *
 * cantidad_empaques debe ser > 0 en ENTRADA y RETIRO. En AJUSTE y REVERSA
 * puede ser negativo (correcciones en ambos sentidos, §17).
 *
 * datos.claveIdempotencia (opcional pero recomendado): identificador único
 * del intento generado por el cliente al armar el carro. Si ya existe un
 * movimiento CONFIRMADO con esa clave, se devuelve ese resultado en vez de
 * crear otro — así un reintento tras un corte de red no duplica el
 * movimiento (auditoría C2).
 *
 * Devuelve { movimiento_id, tipo, total_unidades, detalles } o lanza Error
 * sin haber modificado nada.
 */
function movConfirmar_(datos) {
  var tipo = utilTrim(datos.tipo).toUpperCase();
  if (!valIsTipoMovimiento(tipo)) {
    throw new Error('Tipo de movimiento inválido: "' + datos.tipo + '".');
  }
  if (!datos.items || datos.items.length === 0) {
    throw new Error('El movimiento no tiene productos. Escanea al menos uno.');
  }
  var usuarioId = utilTrim(datos.usuarioId) || CONFIG.USUARIO_PENDIENTE_AUTH;
  var usuarioNombre = utilTrim(datos.usuarioNombre) || usuarioId;
  var claveIdempotencia = utilTrim(datos.claveIdempotencia);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error('El sistema está procesando otro movimiento. Intenta nuevamente.');
  }
  try {
    // --- 1b. Idempotencia: si este intento ya se confirmó, devolverlo -----
    // La verificación ocurre DENTRO del lock: dos envíos simultáneos con la
    // misma clave se serializan y el segundo encuentra al primero.
    if (claveIdempotencia) {
      var yaConfirmado = movBuscarPorClave_(claveIdempotencia);
      if (yaConfirmado) return yaConfirmado;
    }

    // --- 2. Releer catálogo vigente y resolver cada ítem -------------------
    var items = datos.items.map(function (item, i) {
      return movResolverItem_(item, tipo, i + 1);
    });

    // --- 3. Validar contra stock vigente (releído bajo el bloqueo) ---------
    // Delta neto por producto: un movimiento puede traer varios formatos del
    // mismo producto (p. ej. 2 displays + 1 caja de Chocolate Bitter).
    var stockPorProducto = {};
    items.forEach(function (it) {
      if (stockPorProducto[it.producto_id] === undefined) {
        stockPorProducto[it.producto_id] = invGetStock_(it.producto_id);
      }
    });

    var insuficientes = [];
    var stockSimulado = {};
    Object.keys(stockPorProducto).forEach(function (pid) {
      stockSimulado[pid] = stockPorProducto[pid];
    });
    items.forEach(function (it) {
      it.stock_anterior = stockSimulado[it.producto_id];
      it.stock_posterior = it.stock_anterior + it.delta_unidades;
      stockSimulado[it.producto_id] = it.stock_posterior;
      if (it.stock_posterior < 0) {
        insuficientes.push(
          it.producto_nombre + ': stock disponible ' + it.stock_anterior +
          ' unidades, se intentó descontar ' + (-it.delta_unidades) + '.');
      }
    });
    if (insuficientes.length > 0) {
      // Nada se escribió: el movimiento completo se rechaza (§15).
      throw new Error('Stock insuficiente. ' + insuficientes.join(' '));
    }

    // --- 4. Escritura en orden seguro --------------------------------------
    var movimientoId = idNext_('MOVIMIENTO');
    var ahora = utilNow();
    var totalEmpaques = 0;
    var totalUnidades = 0;
    items.forEach(function (it) {
      totalEmpaques += Math.abs(it.cantidad_empaques);
      totalUnidades += Math.abs(it.delta_unidades);
    });

    dbAppendRow_('MOVIMIENTOS', {
      movimiento_id: movimientoId,
      tipo: tipo,
      estado: CONFIG.ESTADOS_MOVIMIENTO.EN_PROCESO,
      usuario_id: usuarioId,
      usuario_nombre_snapshot: usuarioNombre,
      fecha_hora: ahora,
      origen: utilTrim(datos.origen) || (tipo === 'ENTRADA' ? 'PROVEEDOR' : 'BODEGA'),
      destino: utilTrim(datos.destino) || (tipo === 'RETIRO' ? 'TIENDA' : 'BODEGA'),
      observacion: utilTrim(datos.observacion),
      total_formatos: items.length,
      total_empaques: totalEmpaques,
      total_unidades: totalUnidades,
      clave_idempotencia: claveIdempotencia
    });

    var detalleIds = idNextBatch_('DETALLE', items.length);
    dbAppendRows_('MOVIMIENTO_DETALLE', items.map(function (it, i) {
      return {
        detalle_id: detalleIds[i],
        movimiento_id: movimientoId,
        producto_id: it.producto_id,
        formato_id: it.formato_id,
        codigo_barras_snapshot: it.codigo_barras,
        producto_nombre_snapshot: it.producto_nombre,
        formato_nombre_snapshot: it.formato_nombre,
        cantidad_empaques: it.cantidad_empaques,
        unidades_por_empaque_snapshot: it.unidades_por_empaque,
        total_unidades: it.delta_unidades,
        stock_anterior: it.stock_anterior,
        stock_posterior: it.stock_posterior
      };
    }));

    Object.keys(stockSimulado).forEach(function (pid) {
      invActualizarStock_(pid, stockSimulado[pid], usuarioId);
    });

    dbUpdateById_('MOVIMIENTOS', movimientoId, {
      estado: CONFIG.ESTADOS_MOVIMIENTO.CONFIRMADO
    });

    return {
      movimiento_id: movimientoId,
      tipo: tipo,
      fecha_hora: ahora,
      total_formatos: items.length,
      total_empaques: totalEmpaques,
      total_unidades: totalUnidades,
      detalles: items.map(function (it) {
        return {
          producto: it.producto_nombre,
          formato: it.formato_nombre,
          cantidad_empaques: it.cantidad_empaques,
          unidades: it.delta_unidades,
          stock_posterior: it.stock_posterior
        };
      })
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Búsqueda por código de barras para las pantallas de escaneo (pistola en
 * ingreso, cámara en retiro). Devuelve el producto, el formato y el stock
 * actual, o { encontrado: false } si el código no está registrado (§22).
 */
function movBuscarCodigo_(codigoBarras) {
  var resultado = catalogoBuscarPorCodigoBarras_(codigoBarras);
  if (!resultado) {
    return { encontrado: false, codigo_barras: utilNormalizeBarcode(codigoBarras) };
  }
  return {
    encontrado: true,
    codigo_barras: resultado.formato.codigo_barras,
    producto_id: resultado.producto.producto_id,
    producto_nombre: resultado.producto.nombre,
    formato_id: resultado.formato.formato_id,
    formato_nombre: resultado.formato.nombre_formato,
    tipo_empaque: resultado.formato.tipo_empaque,
    unidades_por_empaque: utilToInt(resultado.formato.unidades_por_empaque),
    stock_unidades: invGetStock_(resultado.producto.producto_id)
  };
}

/**
 * Busca un movimiento CONFIRMADO por su clave de idempotencia y reconstruye
 * la misma respuesta que devolvió movConfirmar_ al confirmarlo. Devuelve
 * null si esa clave no corresponde a ningún movimiento confirmado.
 */
function movBuscarPorClave_(claveIdempotencia) {
  var cabecera = dbFindOne_('MOVIMIENTOS', function (m) {
    return m.clave_idempotencia === claveIdempotencia &&
           m.estado === CONFIG.ESTADOS_MOVIMIENTO.CONFIRMADO;
  });
  if (!cabecera) return null;

  var detalles = dbFindWhere_('MOVIMIENTO_DETALLE', function (d) {
    return d.movimiento_id === cabecera.movimiento_id;
  });
  return {
    movimiento_id: cabecera.movimiento_id,
    tipo: cabecera.tipo,
    fecha_hora: cabecera.fecha_hora,
    total_formatos: utilToInt(cabecera.total_formatos),
    total_empaques: utilToInt(cabecera.total_empaques),
    total_unidades: utilToInt(cabecera.total_unidades),
    reintento: true, // señal para la UI: no es un movimiento nuevo
    detalles: detalles.map(function (d) {
      return {
        producto: d.producto_nombre_snapshot,
        formato: d.formato_nombre_snapshot,
        cantidad_empaques: utilToInt(d.cantidad_empaques),
        unidades: utilToInt(d.total_unidades),
        stock_posterior: utilToInt(d.stock_posterior)
      };
    })
  };
}

/** Resuelve un ítem contra el catálogo vigente y calcula su delta en unidades. */
function movResolverItem_(item, tipo, posicion) {
  var cantidad = utilToInt(item.cantidad_empaques);
  if (cantidad === null || cantidad === 0) {
    throw new Error('Ítem ' + posicion + ': la cantidad de empaques es inválida.');
  }
  var permiteNegativo = tipo === CONFIG.TIPOS_MOVIMIENTO.AJUSTE ||
                        tipo === CONFIG.TIPOS_MOVIMIENTO.REVERSA;
  if (cantidad < 0 && !permiteNegativo) {
    throw new Error('Ítem ' + posicion + ': la cantidad debe ser mayor que 0 en ' + tipo + '.');
  }

  var encontrado = catalogoBuscarPorCodigoBarras_(item.codigo_barras);
  if (!encontrado) {
    throw new Error('Código no registrado: "' +
      utilNormalizeBarcode(item.codigo_barras) + '".');
  }

  var unidadesPorEmpaque = utilToInt(encontrado.formato.unidades_por_empaque);
  var signo = tipo === CONFIG.TIPOS_MOVIMIENTO.RETIRO ? -1 : 1;
  // ENTRADA/AJUSTE/REVERSA suman con el signo de la cantidad; RETIRO resta.

  return {
    producto_id: encontrado.producto.producto_id,
    producto_nombre: encontrado.producto.nombre,
    formato_id: encontrado.formato.formato_id,
    formato_nombre: encontrado.formato.nombre_formato,
    codigo_barras: encontrado.formato.codigo_barras,
    cantidad_empaques: cantidad,
    unidades_por_empaque: unidadesPorEmpaque,
    delta_unidades: signo * cantidad * unidadesPorEmpaque
  };
}

/** Tope por defecto de movimientos devueltos (auditoría A6). */
var MOV_LIMITE_DEFAULT = 200;

/**
 * Lista movimientos CONFIRMADOS, más recientes primero, con filtros
 * opcionales: { tipo, usuarioId, productoId, desde, hasta, limite } (fechas
 * 'yyyy-MM-dd'). Siempre acotado: sin `limite` explícito se devuelven como
 * máximo MOV_LIMITE_DEFAULT — el historial crece para siempre y una consulta
 * sin filtros no debe arrastrar todo (A6). El cliente detecta el truncado
 * comparando length === limite y avisa "mostrando los N más recientes".
 */
function movListar_(filtros) {
  filtros = filtros || {};
  var limite = utilToInt(filtros.limite);
  if (limite === null || limite <= 0) limite = MOV_LIMITE_DEFAULT;

  var conProducto = null;
  if (filtros.productoId) {
    conProducto = {};
    dbFindWhere_('MOVIMIENTO_DETALLE', function (d) {
      return d.producto_id === utilTrim(filtros.productoId);
    }).forEach(function (d) { conProducto[d.movimiento_id] = true; });
  }

  return dbReadAll_('MOVIMIENTOS')
    .filter(function (m) {
      if (m.estado !== CONFIG.ESTADOS_MOVIMIENTO.CONFIRMADO) return false;
      if (filtros.tipo && m.tipo !== utilTrim(filtros.tipo).toUpperCase()) return false;
      if (filtros.usuarioId && m.usuario_id !== utilTrim(filtros.usuarioId)) return false;
      if (conProducto && !conProducto[m.movimiento_id]) return false;
      var fecha = m.fecha_hora.slice(0, 10);
      if (filtros.desde && fecha < filtros.desde) return false;
      if (filtros.hasta && fecha > filtros.hasta) return false;
      return true;
    })
    .reverse()
    .slice(0, limite);
}

/**
 * Movimientos EN_PROCESO con más antigüedad que `minutos` (auditoría M3):
 * un fallo intermedio en la confirmación los deja así por diseño (D-005),
 * pero nadie los ve porque movListar_ los filtra. El dashboard los reporta
 * para que jefatura sepa que hubo un fallo parcial y pueda reconciliar.
 */
function movPendientesAntiguos_(minutos) {
  var limiteMs = Date.now() - (minutos || 10) * 60 * 1000;
  return dbReadAll_('MOVIMIENTOS').filter(function (m) {
    if (m.estado !== CONFIG.ESTADOS_MOVIMIENTO.EN_PROCESO) return false;
    var t = new Date(m.fecha_hora.replace(' ', 'T')).getTime();
    return isNaN(t) ? true : t < limiteMs; // fecha ilegible: también reportar
  });
}

/** Cabecera + detalles de un movimiento específico. */
function movObtenerDetalle_(movimientoId) {
  var cabecera = dbFindById_('MOVIMIENTOS', movimientoId);
  if (!cabecera) throw new Error('Movimiento no encontrado: ' + movimientoId);
  var detalles = dbFindWhere_('MOVIMIENTO_DETALLE', function (d) {
    return d.movimiento_id === cabecera.movimiento_id;
  });
  return { cabecera: cabecera, detalles: detalles };
}

/**
 * Trazabilidad de un producto: todos sus detalles de movimientos
 * confirmados en orden cronológico, con la cabecera de cada uno.
 */
function movTrazabilidadProducto_(productoId) {
  var confirmados = {};
  dbReadAll_('MOVIMIENTOS').forEach(function (m) {
    if (m.estado === CONFIG.ESTADOS_MOVIMIENTO.CONFIRMADO) {
      confirmados[m.movimiento_id] = m;
    }
  });
  return dbFindWhere_('MOVIMIENTO_DETALLE', function (d) {
    return d.producto_id === utilTrim(productoId) && confirmados[d.movimiento_id];
  }).map(function (d) {
    var m = confirmados[d.movimiento_id];
    return {
      movimiento_id: d.movimiento_id,
      tipo: m.tipo,
      fecha_hora: m.fecha_hora,
      usuario: m.usuario_nombre_snapshot,
      formato: d.formato_nombre_snapshot,
      cantidad_empaques: utilToInt(d.cantidad_empaques),
      unidades_por_empaque: utilToInt(d.unidades_por_empaque_snapshot),
      total_unidades: utilToInt(d.total_unidades),
      stock_anterior: utilToInt(d.stock_anterior),
      stock_posterior: utilToInt(d.stock_posterior)
    };
  });
}
