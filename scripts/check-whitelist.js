/**
 * Verifica que toda función api* definida en src/Api.gs esté registrada en
 * la whitelist de src/Http.gs (httpFunciones_()). Sin este chequeo, una
 * función nueva en Api.gs puede quedar inaccesible desde el cliente
 * ("Función desconocida") sin que ninguna otra herramienta lo detecte — ya
 * pasó dos veces en este proyecto.
 *
 * Uso: node scripts/check-whitelist.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const apiCode = fs.readFileSync(path.join(srcDir, 'Api.gs'), 'utf8');
const httpCode = fs.readFileSync(path.join(srcDir, 'Http.gs'), 'utf8');

const definidas = [...apiCode.matchAll(/^function (api\w+)\s*\(/gm)].map((m) => m[1]);
const registradas = new Set(
  [...httpCode.matchAll(/\b(api\w+)\s*:\s*api\w+/g)].map((m) => m[1])
);

const faltantes = definidas.filter((nombre) => !registradas.has(nombre));

if (faltantes.length > 0) {
  console.error('Funciones de Api.gs NO registradas en httpFunciones_() (Http.gs):');
  faltantes.forEach((nombre) => console.error('  - ' + nombre));
  process.exit(1);
}
console.log(`${definidas.length} funciones api* — todas registradas en la whitelist HTTP.`);
