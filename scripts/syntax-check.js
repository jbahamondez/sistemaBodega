/**
 * Verifica la sintaxis de todos los archivos src/*.gs compilándolos con el
 * motor V8 de Node (mismo motor que usa Apps Script), sin ejecutarlos.
 *
 * Uso: node scripts/syntax-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcDir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.gs'));

let failures = 0;
for (const file of files) {
  const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
  try {
    new vm.Script(code, { filename: file });
    console.log(`OK    ${file}`);
  } catch (err) {
    failures++;
    console.error(`FALLO ${file}: ${err.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} archivo(s) con errores de sintaxis.`);
  process.exit(1);
}
console.log(`\n${files.length} archivos .gs con sintaxis válida.`);
