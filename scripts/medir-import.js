/**
 * medir-import.js — Cuenta cuántas llamadas a Sheets/Lock genera
 * importacionAplicar_ para un CSV real, instrumentando el entorno simulado.
 * Uso: node scripts/medir-import.js <ruta.csv>
 */
'use strict';
const fs = require('fs');
const crearEntornoGas = require('./entorno-gas');

const ruta = process.argv[2];
const csv = fs.readFileSync(ruta, 'utf8');

const gas = crearEntornoGas({ silencioso: true });
gas.ejecutar('setupDatabase()');

let llamadasSheets = 0;
let llamadasLock = 0;
const ss = gas.ejecutar('dbGetSpreadsheet_()');
for (const sheet of ss.getSheets()) {
  const original = sheet.getRange.bind(sheet);
  sheet.getRange = function (...args) {
    llamadasSheets++;
    return original(...args);
  };
}
const lockOriginal = gas.LockService.getScriptLock;
gas.LockService.getScriptLock = function () {
  llamadasLock++;
  return lockOriginal();
};

gas.csvEntrada = csv;
const t0 = Date.now();
const res = gas.ejecutar(
  "importacionAplicar_(csvEntrada, 'AGREGAR_Y_ACTUALIZAR', 'medicion.csv')");
const ms = Date.now() - t0;

console.log('Filas importadas: ' + JSON.stringify(res.detalle));
console.log('Llamadas a Sheets (getRange): ' + llamadasSheets);
console.log('Adquisiciones de LockService: ' + llamadasLock);
console.log('Tiempo en el mock (sin latencia de red real): ' + ms + ' ms');
