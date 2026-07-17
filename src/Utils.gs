/**
 * Utils.gs — Utilidades generales sin lógica de negocio.
 */

/** Fecha y hora actual formateada en la zona horaria operativa. */
function utilNow() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

/** Limpia espacios al inicio y final. Devuelve '' para null/undefined. */
function utilTrim(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Normaliza un código de barras: siempre texto, sin espacios en los bordes.
 * Nunca convertir a número: se perderían ceros iniciales y códigos largos
 * pasarían a notación científica.
 *
 * Además limpia el "ruido" que algunos lectores (cámara Android / GS1-128)
 * anteponen o agregan al dato real:
 *  - Identificador de simbología AIM al inicio, p. ej. "]C1" (que a veces
 *    llega como "[C1") en códigos GS1-128. Es 3 caracteres: corchete +
 *    letra + dígito.
 *  - Corchetes o paréntesis sueltos al inicio o al final (no forman parte
 *    del código impreso; el lector los agrega alrededor del dato).
 * Se aplica igual al importar y al escanear, así el código guardado y el
 * leído quedan idénticos y coinciden. Los códigos normales (EAN-13, etc.)
 * no se ven afectados: no empiezan con corchete ni terminan en paréntesis.
 */
function utilNormalizeBarcode(value) {
  var s = utilTrim(value);
  s = s.replace(/^[[\]][A-Za-z][0-9]/, '');       // identificador de simbología AIM
  s = s.replace(/^[[\](){}]+/, '').replace(/[[\](){}]+$/, ''); // corchetes/paréntesis sueltos
  return s;
}

/**
 * Convierte a entero estricto. Devuelve null si el valor no es un entero
 * válido (no redondea decimales ni acepta texto parcialmente numérico).
 */
function utilToInt(value) {
  var s = utilTrim(value);
  if (s === '' || !/^-?\d+$/.test(s)) return null;
  var n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

/** Normaliza un booleano de hoja ('SI'/'NO', true/false) a boolean. */
function utilToBool(value) {
  var s = utilTrim(value).toUpperCase();
  return s === CONFIG.BOOL.SI || s === 'TRUE' || s === '1';
}

/** Convierte boolean a la representación usada en las hojas. */
function utilBoolToSheet(value) {
  return value ? CONFIG.BOOL.SI : CONFIG.BOOL.NO;
}

/** Genera un salt aleatorio para hashing de PIN. */
function utilGenerateSalt() {
  return Utilities.getUuid().replace(/-/g, '');
}

/**
 * Hash SHA-256 de un PIN con salt. Nunca se almacena ni se expone el PIN
 * original.
 */
function utilHashPin(pin, salt) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + utilTrim(pin),
    Utilities.Charset.UTF_8
  );
  return raw.map(function (b) {
    var h = (b < 0 ? b + 256 : b).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
}

/** Compara en tiempo aproximadamente constante dos hashes hex. */
function utilSafeEquals(a, b) {
  a = utilTrim(a);
  b = utilTrim(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Rellena un número con ceros a la izquierda hasta el largo indicado. */
function utilPadNumber(n, padding) {
  var s = String(n);
  while (s.length < padding) s = '0' + s;
  return s;
}

/**
 * Parsea texto CSV respetando comillas dobles (campos con delimitador o
 * saltos de línea internos). Detecta automáticamente el delimitador (',' o
 * ';' — Excel en español exporta con ';'). Elimina BOM y filas vacías.
 * Devuelve { delimiter, rows } donde rows es una matriz de strings.
 */
function utilParseCsv(text) {
  var BOM = String.fromCharCode(0xFEFF);
  text = String(text || '');
  if (text.charAt(0) === BOM) text = text.slice(1);
  var firstLine = text.split(/\r?\n/, 1)[0] || '';
  var delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;

  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (inQuotes) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text.charAt(i + 1) === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }

  rows = rows.filter(function (r) {
    return r.some(function (v) { return utilTrim(v) !== ''; });
  });
  return { delimiter: delimiter, rows: rows };
}

/**
 * Genera texto CSV a partir de una matriz de valores. Usa coma, CRLF y BOM
 * inicial para que Excel lo abra correctamente con acentos.
 */
function utilToCsv(rows) {
  var lines = rows.map(function (row) {
    return row.map(function (value) {
      var s = value === null || value === undefined ? '' : String(value);
      if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(',');
  });
  return String.fromCharCode(0xFEFF) + lines.join('\r\n') + '\r\n';
}
