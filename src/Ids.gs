/**
 * Ids.gs — Generación de identificadores únicos, legibles y estables.
 *
 * Formato: PREFIJO-NNNN (p. ej. PROD-0001, MOV-000048). Los contadores viven
 * en la hoja Configuracion y se incrementan bajo LockService para que dos
 * ejecuciones simultáneas nunca obtengan el mismo ID.
 */

/** Genera el siguiente ID para una entidad de CONFIG.IDS (p. ej. 'PRODUCTO'). */
function idNext_(entityKey) {
  return idNextBatch_(entityKey, 1)[0];
}

/**
 * Genera n IDs consecutivos en una sola adquisición del bloqueo.
 * Útil para movimientos con muchos detalles.
 */
function idNextBatch_(entityKey, n) {
  var def = CONFIG.IDS[entityKey];
  if (!def) throw new Error('Entidad de ID desconocida: ' + entityKey);
  if (!n || n < 1) throw new Error('Cantidad de IDs inválida: ' + n);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error(
      'El sistema está ocupado procesando otra operación. Intenta nuevamente.');
  }
  try {
    var current = utilToInt(dbGetConfigValue_(def.counterKey, '0')) || 0;
    var ids = [];
    for (var i = 1; i <= n; i++) {
      ids.push(def.prefix + '-' + utilPadNumber(current + i, def.padding));
    }
    dbSetConfigValue_(def.counterKey, current + n);
    return ids;
  } finally {
    lock.releaseLock();
  }
}
