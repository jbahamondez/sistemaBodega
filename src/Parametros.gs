/**
 * Parametros.gs — Parámetros del sistema editables desde el Panel
 * ("Configuración"), respaldados en la hoja Configuracion (clave/valor,
 * mismo mecanismo que ya usan los contadores de IDs). Distinto de un
 * movimiento AJUSTE (corrección de cantidades de stock): esto ajusta
 * comportamiento del sistema, no inventario.
 *
 * Se dejan fuera a propósito los parámetros de seguridad (intentos máximos
 * de login, mínimo de dígitos del PIN): quedan fijos en el código para que
 * nadie los debilite sin querer desde la interfaz.
 */

var PARAM_STOCK_MINIMO_CLAVE = 'stock_minimo_default';
var PARAM_BACKUP_RETENCION_CLAVE = 'backup_retencion_dias';
var PARAM_MOV_LIMITE_CLAVE = 'mov_limite_default';

var PARAM_STOCK_MINIMO_DEFECTO = 10;
var PARAM_BACKUP_RETENCION_DEFECTO = 14;
var PARAM_MOV_LIMITE_DEFECTO = 200;
var PARAM_MOV_LIMITE_MAXIMO = 1000; // tope duro (A6): evita listados sin límite real

/** Valores actuales, con su valor por defecto si nunca se configuraron. */
function parametrosObtener_() {
  return {
    stock_minimo: utilToInt(dbGetConfigValue_(PARAM_STOCK_MINIMO_CLAVE,
      String(PARAM_STOCK_MINIMO_DEFECTO))),
    backup_retencion_dias: utilToInt(dbGetConfigValue_(PARAM_BACKUP_RETENCION_CLAVE,
      String(PARAM_BACKUP_RETENCION_DEFECTO))),
    mov_limite: utilToInt(dbGetConfigValue_(PARAM_MOV_LIMITE_CLAVE,
      String(PARAM_MOV_LIMITE_DEFECTO)))
  };
}

/** Valida y guarda los tres parámetros de una vez. Devuelve los valores guardados. */
function parametrosGuardar_(datos) {
  datos = datos || {};
  var stockMinimo = utilToInt(datos.stock_minimo);
  if (stockMinimo === null || stockMinimo < 0) {
    throw new Error('El stock mínimo debe ser un número entero mayor o igual a 0.');
  }
  var retencion = valRequirePositiveInt(datos.backup_retencion_dias,
    'días de retención de respaldos');
  var limite = valRequirePositiveInt(datos.mov_limite, 'tope de movimientos en listados');
  if (limite > PARAM_MOV_LIMITE_MAXIMO) {
    throw new Error('El tope de movimientos no puede superar ' + PARAM_MOV_LIMITE_MAXIMO + '.');
  }

  dbSetConfigValue_(PARAM_STOCK_MINIMO_CLAVE, stockMinimo);
  dbSetConfigValue_(PARAM_BACKUP_RETENCION_CLAVE, retencion);
  dbSetConfigValue_(PARAM_MOV_LIMITE_CLAVE, limite);
  return parametrosObtener_();
}
