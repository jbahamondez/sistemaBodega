/**
 * Ejecuta localmente las pruebas de src/SelfTest.gs con mocks mínimos de los
 * servicios de Google Apps Script. Las pruebas de integración que requieren
 * la base de datos real se omiten solas (la detección de BD lanza error y el
 * test lo captura).
 *
 * Uso: node scripts/run-tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

// --- Mocks de servicios de Apps Script (solo lo que usan las pruebas puras) ---
const Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  getUuid: () => crypto.randomUUID(),
  computeDigest: (_alg, input) => {
    const buf = crypto.createHash('sha256').update(String(input), 'utf8').digest();
    // Apps Script devuelve bytes con signo (-128..127).
    return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
  },
  formatDate: (date) => date.toISOString().replace('T', ' ').slice(0, 19)
};

const PropertiesService = {
  getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} })
};

const context = {
  Utilities,
  PropertiesService,
  Logger: { log: (m) => console.log(m) },
  LockService: {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
  },
  SpreadsheetApp: {},
  HtmlService: {},
  console
};
vm.createContext(context);

// Mismo ámbito global compartido que usa Apps Script: se cargan todos los .gs.
const srcDir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.gs')).sort();
for (const file of files) {
  const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
  vm.runInContext(code, context, { filename: file });
}

try {
  const report = vm.runInContext('runFoundationTests()', context);
  console.log('\nPRUEBAS LOCALES OK\n' + report);
} catch (err) {
  console.error('\nPRUEBAS LOCALES FALLIDAS\n' + err.message);
  process.exit(1);
}
