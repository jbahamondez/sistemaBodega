/**
 * entorno-gas.js — Entorno simulado de Google Apps Script para Node.
 *
 * Crea un contexto V8 con mocks en memoria (Sheets, Properties, Lock,
 * Cache, Utilities, ContentService) y carga todos los .gs de src/ en un
 * ámbito global compartido, igual que Apps Script. Lo usan el runner de
 * pruebas y las herramientas de línea de comandos.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

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
  deleteRow(rowIndex) { this.data.splice(rowIndex - 1, 1); }
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

// --------------------- Mock mínimo de Drive (para Backup.gs) ---------------
class MockDriveFile {
  constructor(name, id) {
    this.name = name;
    this.id = id || 'drivefile-' + crypto.randomUUID();
    this.trashed = false;
    this.created = new Date(); // mutable: los tests pueden "envejecer" un archivo
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getDateCreated() { return this.created; }
  setTrashed(v) { this.trashed = v; return this; }
  makeCopy(nombre, carpeta) {
    const copia = new MockDriveFile(nombre);
    if (carpeta) carpeta.agregarArchivo(copia);
    return copia;
  }
}
class MockDriveFolder {
  constructor(name) { this.name = name; this.archivos = []; }
  getName() { return this.name; }
  agregarArchivo(f) { this.archivos.push(f); }
  getFiles() {
    const vivos = this.archivos.filter((f) => !f.trashed);
    let i = 0;
    return { hasNext: () => i < vivos.length, next: () => vivos[i++] };
  }
}

/** Crea el contexto con mocks y todos los .gs cargados. */
module.exports = function crearEntornoGas(opciones) {
  opciones = opciones || {};
  const spreadsheets = new Map();
  const scriptProperties = {};
  const cacheStore = {};
  const driveFilesById = new Map();
  const driveFolders = new Map();
  const triggers = [];

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
        setProperty: (k, v) => { scriptProperties[k] = String(v); },
        deleteProperty: (k) => { delete scriptProperties[k]; },
        getProperties: () => Object.assign({}, scriptProperties)
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
    Logger: { log: opciones.silencioso ? () => {} : (m) => console.log(m) },
    HtmlService: {},
    DriveApp: {
      getFileById: (id) => {
        if (!driveFilesById.has(id)) driveFilesById.set(id, new MockDriveFile('archivo-' + id, id));
        return driveFilesById.get(id);
      },
      getFoldersByName: (nombre) => {
        const encontrada = driveFolders.has(nombre) ? [driveFolders.get(nombre)] : [];
        let i = 0;
        return { hasNext: () => i < encontrada.length, next: () => encontrada[i++] };
      },
      createFolder: (nombre) => {
        const carpeta = new MockDriveFolder(nombre);
        driveFolders.set(nombre, carpeta);
        return carpeta;
      }
    },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      newTrigger: (fn) => {
        const builder = {
          _fn: fn,
          timeBased: () => builder,
          everyDays: () => builder,
          atHour: () => builder,
          create: () => {
            const t = { getHandlerFunction: () => fn };
            triggers.push(t);
            return t;
          }
        };
        return builder;
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (s) => ({
        _contenido: s,
        setMimeType() { return this; },
        getContent() { return this._contenido; }
      })
    },
    console
  };
  vm.createContext(context);

  const srcDir = path.join(__dirname, '..', 'src');
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.gs')).sort();
  for (const file of files) {
    const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  context.ejecutar = (codigo) => vm.runInContext(codigo, context);
  return context;
};
