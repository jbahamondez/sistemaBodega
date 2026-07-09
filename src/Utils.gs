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
 */
function utilNormalizeBarcode(value) {
  return utilTrim(value);
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
