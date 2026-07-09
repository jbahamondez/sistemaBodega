/**
 * Ejecuta localmente las pruebas de src/SelfTest.gs con mocks en memoria de
 * los servicios de Google Apps Script, incluida una simulación funcional de
 * Google Sheets. Esto permite correr también las pruebas de movimientos e
 * inventario (Casos 1, 2, 3 y 5 del prompt) sin tocar la base real.
 *
 * Uso: node scripts/run-tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

// ---------------------- Mock de Google Sheets en memoria -------------------
class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet; this.row = row; this.col = col;
    this.numRows = numRows || 1; this.numCols = numCols || 1;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const fila = this.sheet.data[this.row - 1 + r] || [];
      const filaOut = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = fila[this.col - 1 + c];
        filaOut.push(v === undefined ? '' : v);
      }
      out.push(filaOut);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const destino = this.row - 1 + r;
      while (this.sheet.data.length <= destino) this.sheet.data.push([]);
      for (let c = 0; c < values[r].length; c++) {
        this.sheet.data[destino][this.col - 1 + c] = values[r][c];
      }
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
}

class MockSheet {
  constructor(name) { this.name = name; this.data = []; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getMaxRows() { return Math.max(this.data.length, 1000); }
  getRange(row, col, numRows, numCols) {
    return new MockRange(this, row, col, numRows, numCols);
  }
  setFrozenRows() {}
}

class MockSpreadsheet {
  constructor(name) {
    this.name = name;
    this.id = 'mock-' + crypto.randomUUID();
    this.sheets = new Map();
  }
  getId() { return this.id; }
  getUrl() { return 'https://mock.local/' + this.id; }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets.set(name, s);
    return s;
  }
  getSheets() { return Array.from(this.sheets.values()); }
  deleteSheet(sheet) { this.sheets.delete(sheet.getName()); }
}

const spreadsheets = new Map();
const scriptProperties = {};
const cacheStore = {};

// ------------------- Mocks de servicios de Apps Script ---------------------
const context = {
  SpreadsheetApp: {
    create: (name) => {
      const ss = new MockSpreadsheet(name);
      spreadsheets.set(ss.getId(), ss);
      return ss;
    },
    openById: (id) => {
      const ss = spreadsheets.get(id);
      if (!ss) throw new Error('Spreadsheet no encontrado: ' + id);
      return ss;
    }
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in scriptProperties ? scriptProperties[k] : null),
      setProperty: (k, v) => { scriptProperties[k] = String(v); }
    })
  },
  LockService: {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
  },
  CacheService: {
    getScriptCache: () => ({
      put: (k, v) => { cacheStore[k] = String(v); },
      get: (k) => (k in cacheStore ? cacheStore[k] : null),
      remove: (k) => { delete cacheStore[k]; }
    })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (_alg, input) => {
      const buf = crypto.createHash('sha256').update(String(input), 'utf8').digest();
      return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
    },
    formatDate: (date) => date.toISOString().replace('T', ' ').slice(0, 19)
  },
  Logger: { log: (m) => console.log(m) },
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
  // 1. Pruebas puras y de fundación.
  const reporte1 = vm.runInContext('runFoundationTests()', context);

  // 2. Base simulada + pruebas de movimientos (Casos 1, 2, 3 y 5).
  vm.runInContext(
    "setupDatabase(); dbSetConfigValue_('entorno', 'TEST');", context);
  const reporte2 = vm.runInContext('runMovimientoTests()', context);

  console.log('\nPRUEBAS LOCALES OK');
  console.log(reporte1);
  console.log(reporte2);
} catch (err) {
  console.error('\nPRUEBAS LOCALES FALLIDAS\n' + err.message);
  process.exit(1);
}
