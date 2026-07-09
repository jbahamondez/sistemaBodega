/**
 * previsualizar-csv.js — Ensaya la importación de un CSV real con el motor
 * del sistema (mismo código que corre en producción) sobre una base
 * simulada en memoria. No toca la base real.
 *
 * Uso: node scripts/previsualizar-csv.js <ruta.csv> [modo]
 */
'use strict';

const fs = require('fs');
const crearEntornoGas = require('./entorno-gas');

const ruta = process.argv[2];
const modo = process.argv[3] || 'AGREGAR_Y_ACTUALIZAR';
if (!ruta) {
  console.error('Uso: node scripts/previsualizar-csv.js <ruta.csv> [modo]');
  process.exit(1);
}
const csv = fs.readFileSync(ruta, 'utf8');

const gas = crearEntornoGas({ silencioso: true });
gas.ejecutar('setupDatabase()');
gas.csvEntrada = csv;
gas.modoEntrada = modo;
const prev = gas.ejecutar('importacionPrevisualizar_(csvEntrada, modoEntrada)');

if (!prev.ok) {
  console.error('ESTRUCTURA RECHAZADA: ' + prev.erroresGlobales.join(' '));
  process.exit(1);
}

console.log('PREVISUALIZACIÓN — modo ' + modo);
console.log('  Total filas:      ' + prev.resumen.total);
console.log('  Nuevos:           ' + prev.resumen.NUEVO);
console.log('  A actualizar:     ' + prev.resumen.ACTUALIZAR);
console.log('  Sin cambios:      ' + prev.resumen.SIN_CAMBIOS);
console.log('  Omitidos x modo:  ' + prev.resumen.OMITIDO_POR_MODO);
console.log('  Con ERROR:        ' + prev.resumen.ERROR);

const conError = prev.filas.filter((f) => f.estado === 'ERROR');
if (conError.length) {
  console.log('\nFILAS CON ERROR:');
  conError.forEach((f) => {
    console.log('  Fila ' + f.fila + ' [' + f.datos.codigo_producto + ' / ' +
      f.datos.nombre_producto + ' / EAN "' + f.datos.codigo_barras + '"]');
    f.errores.forEach((e) => console.log('    - ' + e));
  });
}

console.log('\nMUESTRA DE FILAS VÁLIDAS (primeras 5):');
prev.filas.filter((f) => f.estado !== 'ERROR').slice(0, 5).forEach((f) => {
  const d = f.datos;
  console.log('  ' + f.estado + ' | ' + d.codigo_producto + ' | ' + d.nombre_producto +
    ' | EAN ' + d.codigo_barras + ' | ' + d.nombre_formato + ' (' + d.tipo_empaque +
    ') x' + d.unidades_por_empaque);
});

// Distribución de largos de EAN para detectar códigos sospechosos.
const largos = {};
prev.filas.forEach((f) => {
  const l = f.datos.codigo_barras.length;
  largos[l] = (largos[l] || 0) + 1;
});
console.log('\nLARGOS DE CÓDIGO DE BARRAS (dígitos: filas):');
Object.keys(largos).sort((a, b) => a - b).forEach((l) => {
  console.log('  ' + l + ' caracteres: ' + largos[l] + ' filas');
});
const sospechosos = prev.filas.filter((f) =>
  f.estado !== 'ERROR' && [8, 12, 13, 14].indexOf(f.datos.codigo_barras.length) === -1);
if (sospechosos.length) {
  console.log('\nCÓDIGOS CON LARGO ATÍPICO (no EAN-8/UPC-12/EAN-13/GTIN-14):');
  sospechosos.forEach((f) => {
    console.log('  Fila ' + f.fila + ': "' + f.datos.codigo_barras + '" (' +
      f.datos.codigo_barras.length + ') — ' + f.datos.nombre_producto);
  });
}
