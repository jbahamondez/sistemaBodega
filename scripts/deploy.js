/**
 * deploy.js — Despliega el backend a un entorno (qa | prod) sin mezclar
 * proyectos de Apps Script por accidente.
 *
 * Cada entorno tiene su propio archivo .clasp.<env>.json (scriptId propio,
 * NO versionado — contiene datos de la cuenta de Google del desarrollador).
 * Este script copia el archivo del entorno pedido a .clasp.json (el que
 * lee clasp), hace `clasp push -f`, y crea o actualiza la implementación
 * web reutilizando el mismo deploymentId (así la URL /exec no cambia entre
 * despliegues). El deploymentId se guarda de vuelta en .clasp.<env>.json
 * la primera vez que se crea.
 *
 * Uso: node scripts/deploy.js <qa|prod> ["descripción del despliegue"]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const entorno = process.argv[2];
const descripcion = process.argv[3] || ('Despliegue ' + new Date().toISOString());

if (entorno !== 'qa' && entorno !== 'prod') {
  console.error('Uso: node scripts/deploy.js <qa|prod> ["descripción"]');
  process.exit(1);
}

const raiz = path.join(__dirname, '..');
const archivoEnv = path.join(raiz, '.clasp.' + entorno + '.json');
const archivoActivo = path.join(raiz, '.clasp.json');

if (!fs.existsSync(archivoEnv)) {
  console.error('No existe ' + archivoEnv + '. Crea el proyecto de Apps Script primero.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(archivoEnv, 'utf8'));
fs.writeFileSync(archivoActivo, JSON.stringify(config, null, 2) + '\n');
console.log('Entorno activo: ' + entorno + ' (' + config.scriptId + ')');

// execSync con un string ya armado (en vez de un array + shell:true) evita
// que Windows concatene mal los argumentos con espacios (p. ej. la
// descripción entre comillas).
function clasp(args) {
  const cmd = 'clasp ' + args.map(function (a) {
    return /\s/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a;
  }).join(' ');
  return execSync(cmd, { cwd: raiz, encoding: 'utf8' });
}

console.log('\n> clasp push -f');
console.log(clasp(['push', '-f']));

let salida;
if (config.deploymentId) {
  console.log('> clasp update-deployment ' + config.deploymentId);
  salida = clasp(['update-deployment', config.deploymentId,
    '--description', descripcion]);
  console.log(salida);
} else {
  console.log('> clasp create-deployment (primer despliegue de este entorno)');
  salida = clasp(['create-deployment', '--description', descripcion]);
  console.log(salida);
  const m = salida.match(/Deployed\s+(\S+)/);
  if (m) {
    config.deploymentId = m[1];
    config.webAppUrl = 'https://script.google.com/macros/s/' + m[1] + '/exec';
    fs.writeFileSync(archivoEnv, JSON.stringify(config, null, 2) + '\n');
    fs.writeFileSync(archivoActivo, JSON.stringify(config, null, 2) + '\n');
    console.log('\ndeploymentId guardado en ' + archivoEnv);
  } else {
    console.warn('\nNo se pudo leer el deploymentId de la salida de clasp. ' +
      'Cópialo manualmente a ' + archivoEnv + ' (campo deploymentId).');
  }
}

console.log('\nURL del entorno ' + entorno + ': ' + (config.webAppUrl || '(pendiente)'));
