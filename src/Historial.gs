/**
 * Historial.gs — Trazabilidad de cambios del catálogo (hoja HistorialCatalogo).
 *
 * Todo cambio relevante en productos o formatos deja registro: quién, cuándo,
 * qué campo, valor anterior, valor nuevo y origen (EDICION_MANUAL o
 * IMPORTACION_PLANILLA).
 */

/**
 * Registra un cambio de un campo de una entidad del catálogo.
 * entidad: 'PRODUCTO' | 'FORMATO'.
 */
function histRegistrar_(usuarioId, entidad, entidadId, campo, valorAnterior, valorNuevo, origen) {
  dbAppendRow_('HISTORIAL_CATALOGO', {
    historial_id: idNext_('HISTORIAL'),
    fecha_hora: utilNow(),
    usuario_id: usuarioId,
    entidad: entidad,
    entidad_id: entidadId,
    campo: campo,
    valor_anterior: valorAnterior === null || valorAnterior === undefined ? '' : String(valorAnterior),
    valor_nuevo: valorNuevo === null || valorNuevo === undefined ? '' : String(valorNuevo),
    origen: origen
  });
}

/**
 * Registra en lote los cambios detectados entre un registro existente y un
 * patch (solo campos cuyo valor cambia). Devuelve la cantidad registrada.
 */
function histRegistrarCambios_(usuarioId, entidad, entidadId, registroAnterior, patch, origen) {
  var cambios = Object.keys(patch).filter(function (campo) {
    return utilTrim(registroAnterior[campo]) !== utilTrim(patch[campo]);
  });
  if (cambios.length === 0) return 0;

  var ids = idNextBatch_('HISTORIAL', cambios.length);
  var ahora = utilNow();
  var filas = cambios.map(function (campo, i) {
    return {
      historial_id: ids[i],
      fecha_hora: ahora,
      usuario_id: usuarioId,
      entidad: entidad,
      entidad_id: entidadId,
      campo: campo,
      valor_anterior: utilTrim(registroAnterior[campo]),
      valor_nuevo: utilTrim(patch[campo]),
      origen: origen
    };
  });
  dbAppendRows_('HISTORIAL_CATALOGO', filas);
  return filas.length;
}

/** Últimos cambios del catálogo, más recientes primero. */
function histListar_(limite) {
  var rows = dbReadAll_('HISTORIAL_CATALOGO');
  rows.reverse();
  return rows.slice(0, limite || 100);
}
