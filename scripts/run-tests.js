/**
 * Ejecuta localmente las pruebas de src/SelfTest.gs sobre el entorno
 * simulado de Apps Script (scripts/entorno-gas.js). Incluye las pruebas de
 * movimientos, permisos, importación y router HTTP sin tocar la base real.
 *
 * Uso: node scripts/run-tests.js
 */
'use strict';

const crearEntornoGas = require('./entorno-gas');
const gas = crearEntornoGas();

try {
  // 1. Pruebas puras y de fundación.
  const reporte1 = gas.ejecutar('runFoundationTests()');

  // 2. Base simulada + pruebas de integración.
  gas.ejecutar("setupDatabase(); dbSetConfigValue_('entorno', 'TEST');");
  const reporte2 = gas.ejecutar('runMovimientoTests()');

  // 3. Backup.gs contra el mock de Drive (backupEjecutar_ hace escrituras
  // reales en Drive/Sheets: por eso NUNCA vive en SelfTest.gs, solo aquí,
  // contra el entorno simulado).
  const reporte3 = probarBackup(gas);

  console.log('\nPRUEBAS LOCALES OK');
  console.log(reporte1);
  console.log(reporte2);
  console.log(reporte3);
} catch (err) {
  console.error('\nPRUEBAS LOCALES FALLIDAS\n' + err.message);
  process.exit(1);
}

function probarBackup(gas) {
  const resultados = [];
  const afirmar = (cond, msg) => {
    resultados.push((cond ? 'OK    ' : 'FALLO ') + msg);
    if (!cond) throw new Error('Aserción de backup falló: ' + msg);
  };

  // Primer respaldo: crea la carpeta y un archivo con el nombre de hoy.
  gas.ejecutar('backupEjecutar_()');
  let carpeta = gas.DriveApp.getFoldersByName('Respaldos - Sistema Bodega').next();
  afirmar(!!carpeta, 'backupEjecutar_ crea la carpeta de respaldos');
  let archivos = [];
  { const it = carpeta.getFiles(); while (it.hasNext()) archivos.push(it.next()); }
  afirmar(archivos.length === 1, 'primer respaldo crea exactamente un archivo');

  // Envejecer ese archivo 20 días (fuera de la retención de 14) y correr
  // el respaldo de nuevo: debe crear uno nuevo Y eliminar el viejo por rotación.
  const archivoViejo = archivos[0];
  archivoViejo.created = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  gas.ejecutar('backupEjecutar_()');
  archivos = [];
  { const it = carpeta.getFiles(); while (it.hasNext()) archivos.push(it.next()); }
  afirmar(archivos.length === 1, 'la rotación elimina el respaldo vencido y deja solo el nuevo');
  afirmar(archivoViejo.trashed === true, 'el archivo de 20 días quedó marcado como eliminado');

  // El disparador diario es idempotente: instalarlo dos veces no duplica.
  const r1 = gas.ejecutar('setupInstalarRespaldoDiario()');
  const r2 = gas.ejecutar('setupInstalarRespaldoDiario()');
  afirmar(r1 === 'INSTALADO' && r2 === 'YA_EXISTIA',
    'setupInstalarRespaldoDiario es idempotente (no duplica el disparador)');
  afirmar(gas.ScriptApp.getProjectTriggers().length === 1,
    'solo existe un disparador de respaldo tras instalar dos veces');

  return resultados.join('\n');
}
