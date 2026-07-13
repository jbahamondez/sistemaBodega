/**
 * Backup.gs — Respaldo diario de la planilla en Drive, con rotación.
 *
 * Protege contra lo que un rollback de código NO deshace: escrituras ya
 * hechas en los datos reales (un bug, una importación mal hecha, un ajuste
 * equivocado). Complementa —no reemplaza— el historial de versiones nativo
 * de Google Sheets.
 *
 * setupInstalarRespaldoDiario() se ejecuta una vez desde el editor (como
 * setupDatabase()) para instalar el disparador. Es idempotente: si ya
 * existe, no crea uno duplicado.
 */

var BACKUP_CARPETA_NOMBRE = 'Respaldos - Sistema Bodega';
var BACKUP_FUNCION_DISPARADOR = 'backupEjecutar_';

/** Nombre del archivo de respaldo para una fecha dada (yyyy-MM-dd). */
function backupNombreArchivo_(fechaTexto) {
  return CONFIG.SPREADSHEET_NAME + ' — respaldo ' + fechaTexto;
}

/**
 * Dada una lista de respaldos { nombre, creadoEn: Date } y una fecha de
 * referencia, devuelve los que superan la retención (deben eliminarse).
 * Pura — no toca Drive — para poder probarla sin depender de la nube.
 */
function backupVencidos_(archivos, ahora, retencionDias) {
  var limite = ahora.getTime() - retencionDias * 24 * 60 * 60 * 1000;
  return archivos.filter(function (a) { return a.creadoEn.getTime() < limite; });
}

/** Copia la planilla activa a la carpeta de respaldos y aplica la rotación. */
function backupEjecutar_() {
  var ss = dbGetSpreadsheet_();
  var carpeta = backupObtenerCarpeta_();
  var ahora = new Date();
  var fechaTexto = Utilities.formatDate(ahora, CONFIG.TIMEZONE, 'yyyy-MM-dd');

  DriveApp.getFileById(ss.getId()).makeCopy(backupNombreArchivo_(fechaTexto), carpeta);

  var existentes = [];
  var it = carpeta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    existentes.push({ archivo: f, nombre: f.getName(), creadoEn: f.getDateCreated() });
  }

  var retencionDias = parametrosObtener_().backup_retencion_dias;
  var vencidos = backupVencidos_(existentes, ahora, retencionDias);
  vencidos.forEach(function (v) { v.archivo.setTrashed(true); });

  Logger.log('Respaldo creado: "' + backupNombreArchivo_(fechaTexto) + '". ' +
    'Eliminados por retención (' + retencionDias + ' días): ' + vencidos.length);
}

/** Carpeta de respaldos en Drive, creándola si no existe todavía. */
function backupObtenerCarpeta_() {
  var it = DriveApp.getFoldersByName(BACKUP_CARPETA_NOMBRE);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(BACKUP_CARPETA_NOMBRE);
}

/**
 * Instala el disparador diario (~03:00, zona del proyecto). Idempotente:
 * ejecutarla de nuevo no crea un segundo disparador. Ejecutar una vez desde
 * el editor, igual que setupDatabase().
 */
function setupInstalarRespaldoDiario() {
  var yaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === BACKUP_FUNCION_DISPARADOR;
  });
  if (yaExiste) {
    Logger.log('El disparador de respaldo diario ya estaba instalado. No se creó otro.');
    return 'YA_EXISTIA';
  }
  ScriptApp.newTrigger(BACKUP_FUNCION_DISPARADOR).timeBased().everyDays(1).atHour(3).create();
  Logger.log('Disparador de respaldo diario instalado (carpeta "' +
    BACKUP_CARPETA_NOMBRE + '", retención ' + parametrosObtener_().backup_retencion_dias +
    ' días).');
  return 'INSTALADO';
}
