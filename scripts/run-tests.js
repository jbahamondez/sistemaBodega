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

  console.log('\nPRUEBAS LOCALES OK');
  console.log(reporte1);
  console.log(reporte2);
} catch (err) {
  console.error('\nPRUEBAS LOCALES FALLIDAS\n' + err.message);
  process.exit(1);
}
