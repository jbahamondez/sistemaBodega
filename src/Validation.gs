/**
 * Validation.gs — Validaciones base reutilizables.
 *
 * Convención: las funciones valRequire* lanzan Error con mensaje claro para
 * el usuario; las funciones valIs* devuelven boolean para flujos que
 * acumulan errores (p. ej. previsualización de importaciones).
 */

/** Lanza error si el valor está vacío. */
function valRequireNonEmpty(value, fieldLabel) {
  if (utilTrim(value) === '') {
    throw new Error('El campo "' + fieldLabel + '" es obligatorio.');
  }
  return utilTrim(value);
}

/** Lanza error si el valor no es un entero mayor que cero. */
function valRequirePositiveInt(value, fieldLabel) {
  var n = utilToInt(value);
  if (n === null || n <= 0) {
    throw new Error(
      'El campo "' + fieldLabel + '" debe ser un número entero mayor que 0.');
  }
  return n;
}

/** Lanza error si el valor no es un entero mayor o igual a cero. */
function valRequireNonNegativeInt(value, fieldLabel) {
  var n = utilToInt(value);
  if (n === null || n < 0) {
    throw new Error(
      'El campo "' + fieldLabel + '" debe ser un número entero mayor o igual a 0.');
  }
  return n;
}

/** true si el valor es un entero mayor que cero. */
function valIsPositiveInt(value) {
  var n = utilToInt(value);
  return n !== null && n > 0;
}

/** true si el tipo de empaque es uno de los definidos en CONFIG. */
function valIsTipoEmpaque(value) {
  return Object.keys(CONFIG.TIPOS_EMPAQUE)
    .indexOf(utilTrim(value).toUpperCase()) !== -1;
}

/** true si el rol es uno de los definidos en CONFIG. */
function valIsRol(value) {
  return Object.keys(CONFIG.ROLES)
    .indexOf(utilTrim(value).toUpperCase()) !== -1;
}

/** true si el tipo de movimiento es uno de los definidos en CONFIG. */
function valIsTipoMovimiento(value) {
  return Object.keys(CONFIG.TIPOS_MOVIMIENTO)
    .indexOf(utilTrim(value).toUpperCase()) !== -1;
}

/**
 * Valida un código de barras normalizado: no vacío y compuesto solo por
 * caracteres imprimibles sin espacios internos (los lectores HID y de cámara
 * no entregan espacios).
 */
function valIsCodigoBarras(value) {
  var s = utilNormalizeBarcode(value);
  return s !== '' && /^[!-~]+$/.test(s);
}
