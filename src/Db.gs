/**
 * Db.gs — Capa de acceso a datos sobre Google Sheets.
 *
 * Único módulo autorizado a leer y escribir en las hojas. El resto del
 * sistema opera con objetos JavaScript cuyas claves son los nombres de
 * columna definidos en CONFIG.SHEETS.
 */

/** Abre el spreadsheet configurado. Falla con mensaje claro si no existe. */
function dbGetSpreadsheet_() {
  var id = PropertiesService.getScriptProperties()
    .getProperty(CONFIG.PROP_SPREADSHEET_ID);
  if (!id) {
    throw new Error(
      'No hay base de datos configurada. Ejecuta setupDatabase() una vez ' +
      'desde el editor de Apps Script.');
  }
  return SpreadsheetApp.openById(id);
}

/** Obtiene una hoja por su clave de CONFIG.SHEETS (p. ej. 'PRODUCTOS'). */
function dbGetSheet_(sheetKey) {
  var def = CONFIG.SHEETS[sheetKey];
  if (!def) throw new Error('Hoja desconocida: ' + sheetKey);
  var sheet = dbGetSpreadsheet_().getSheetByName(def.name);
  if (!sheet) {
    throw new Error(
      'La hoja "' + def.name + '" no existe. Ejecuta setupDatabase().');
  }
  return sheet;
}

/**
 * Lee todas las filas de una hoja como objetos {columna: valor}.
 * Cada objeto incluye _rowIndex (fila real en la hoja, base 1) para
 * actualizaciones posteriores. Los valores llegan como texto sin espacios
 * en los bordes.
 */
function dbReadAll_(sheetKey) {
  var def = CONFIG.SHEETS[sheetKey];
  var sheet = dbGetSheet_(sheetKey);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, def.columns.length).getValues();
  return values.map(function (row, i) {
    var obj = { _rowIndex: i + 2 };
    def.columns.forEach(function (col, j) {
      obj[col] = utilTrim(row[j]);
    });
    return obj;
  });
}

/** Devuelve la primera fila cuyo idColumn coincide, o null. */
function dbFindById_(sheetKey, idValue) {
  var def = CONFIG.SHEETS[sheetKey];
  return dbFindOne_(sheetKey, function (row) {
    return row[def.idColumn] === utilTrim(idValue);
  });
}

/** Devuelve la primera fila que cumple el predicado, o null. */
function dbFindOne_(sheetKey, predicate) {
  var rows = dbReadAll_(sheetKey);
  for (var i = 0; i < rows.length; i++) {
    if (predicate(rows[i])) return rows[i];
  }
  return null;
}

/** Devuelve todas las filas que cumplen el predicado. */
function dbFindWhere_(sheetKey, predicate) {
  return dbReadAll_(sheetKey).filter(predicate);
}

/**
 * Agrega una fila al final de la hoja a partir de un objeto.
 * Las columnas no presentes en el objeto quedan vacías.
 */
function dbAppendRow_(sheetKey, obj) {
  dbAppendRows_(sheetKey, [obj]);
}

/** Agrega varias filas en una sola escritura (más eficiente que una a una). */
function dbAppendRows_(sheetKey, objs) {
  if (!objs || objs.length === 0) return;
  var def = CONFIG.SHEETS[sheetKey];
  var sheet = dbGetSheet_(sheetKey);
  var values = objs.map(function (obj) {
    return def.columns.map(function (col) {
      return obj[col] === undefined || obj[col] === null ? '' : obj[col];
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, def.columns.length)
    .setValues(values);
}

/**
 * Reescribe TODAS las filas de datos de una hoja en una sola llamada
 * (una operación de red en vez de una por celda modificada). `rows` debe
 * ser el array devuelto por dbReadAll_ para esa misma hoja, en el mismo
 * orden, con los campos que se quieran cambiar ya modificados en memoria.
 * Usado por operaciones masivas (p. ej. importación de catálogo) para
 * evitar cientos de llamadas individuales de escritura.
 */
function dbWriteAllRows_(sheetKey, rows) {
  if (!rows || rows.length === 0) return;
  var def = CONFIG.SHEETS[sheetKey];
  var sheet = dbGetSheet_(sheetKey);
  var values = rows.map(function (obj) {
    return def.columns.map(function (col) {
      return obj[col] === undefined || obj[col] === null ? '' : obj[col];
    });
  });
  sheet.getRange(2, 1, values.length, def.columns.length).setValues(values);
}

/**
 * Actualiza campos de la fila identificada por idColumn === idValue.
 * Solo modifica las columnas presentes en patch. Lanza error si no existe.
 */
function dbUpdateById_(sheetKey, idValue, patch) {
  var def = CONFIG.SHEETS[sheetKey];
  var row = dbFindById_(sheetKey, idValue);
  if (!row) {
    throw new Error(
      'No existe registro con ' + def.idColumn + ' = "' + idValue +
      '" en la hoja ' + def.name + '.');
  }
  dbUpdateRowByIndex_(sheetKey, row._rowIndex, patch);
  return row._rowIndex;
}

/** Actualiza columnas de una fila concreta (fila real de la hoja, base 1). */
function dbUpdateRowByIndex_(sheetKey, rowIndex, patch) {
  var def = CONFIG.SHEETS[sheetKey];
  var sheet = dbGetSheet_(sheetKey);
  Object.keys(patch).forEach(function (col) {
    var colIndex = def.columns.indexOf(col);
    if (colIndex === -1) {
      throw new Error('Columna desconocida "' + col + '" en hoja ' + def.name);
    }
    sheet.getRange(rowIndex, colIndex + 1).setValue(patch[col]);
  });
}

/** Lee un valor de la hoja Configuracion. Devuelve defaultValue si no existe. */
function dbGetConfigValue_(clave, defaultValue) {
  var row = dbFindById_('CONFIGURACION', clave);
  return row ? row.valor : (defaultValue === undefined ? null : defaultValue);
}

/** Escribe (crea o actualiza) un valor en la hoja Configuracion. */
function dbSetConfigValue_(clave, valor) {
  var row = dbFindById_('CONFIGURACION', clave);
  if (row) {
    dbUpdateRowByIndex_('CONFIGURACION', row._rowIndex, { valor: String(valor) });
  } else {
    dbAppendRow_('CONFIGURACION', { clave: clave, valor: String(valor) });
  }
}
