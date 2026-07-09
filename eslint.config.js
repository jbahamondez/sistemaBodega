/**
 * Configuración de ESLint para Google Apps Script.
 *
 * Particularidades de Apps Script que esta configuración refleja:
 * - Todos los archivos .gs comparten un único ámbito global: las funciones
 *   definidas en un archivo se usan desde otros. Por eso los símbolos
 *   propios del proyecto se declaran como globals (mantener la lista al
 *   agregar módulos nuevos).
 * - Los servicios de Google (SpreadsheetApp, etc.) son globals del runtime.
 * - Las funciones de nivel superior son puntos de entrada invocables desde
 *   el editor o por triggers, por lo que no se marcan como "sin uso"
 *   (vars: 'local').
 */

const gasServices = {
  SpreadsheetApp: 'readonly',
  PropertiesService: 'readonly',
  LockService: 'readonly',
  Utilities: 'readonly',
  Logger: 'readonly',
  HtmlService: 'readonly',
  ContentService: 'readonly',
  DriveApp: 'readonly',
  Session: 'readonly',
  CacheService: 'readonly',
  ScriptApp: 'readonly'
};

// Símbolos propios definidos en src/*.gs y usados entre archivos.
// Actualizar al crear módulos nuevos (el lint falla con no-undef si falta).
const projectGlobals = {
  CONFIG: 'readonly',
  // Utils.gs
  utilNow: 'readonly',
  utilTrim: 'readonly',
  utilNormalizeBarcode: 'readonly',
  utilToInt: 'readonly',
  utilToBool: 'readonly',
  utilBoolToSheet: 'readonly',
  utilGenerateSalt: 'readonly',
  utilHashPin: 'readonly',
  utilSafeEquals: 'readonly',
  utilPadNumber: 'readonly',
  utilParseCsv: 'readonly',
  utilToCsv: 'readonly',
  // Validation.gs
  valRequireNonEmpty: 'readonly',
  valRequirePositiveInt: 'readonly',
  valRequireNonNegativeInt: 'readonly',
  valIsPositiveInt: 'readonly',
  valIsTipoEmpaque: 'readonly',
  valIsRol: 'readonly',
  valIsTipoMovimiento: 'readonly',
  valIsCodigoBarras: 'readonly',
  // Db.gs
  dbGetSpreadsheet: 'readonly',
  dbGetSheet: 'readonly',
  dbReadAll: 'readonly',
  dbFindById: 'readonly',
  dbFindOne: 'readonly',
  dbFindWhere: 'readonly',
  dbAppendRow: 'readonly',
  dbAppendRows: 'readonly',
  dbUpdateById: 'readonly',
  dbUpdateRowByIndex: 'readonly',
  dbGetConfigValue: 'readonly',
  dbSetConfigValue: 'readonly',
  // Ids.gs
  idNext: 'readonly',
  idNextBatch: 'readonly',
  // Historial.gs
  histRegistrar: 'readonly',
  histRegistrarCambios: 'readonly',
  histListar: 'readonly',
  // Catalogo.gs
  catalogoListar: 'readonly',
  catalogoCrearProducto: 'readonly',
  catalogoEditarProducto: 'readonly',
  catalogoCrearFormato: 'readonly',
  catalogoEditarFormato: 'readonly',
  catalogoCambiarEstado: 'readonly',
  catalogoAdvertenciaDesactivacion_: 'readonly',
  catalogoValidarCodigoBarrasUnico_: 'readonly',
  catalogoBuscarPorCodigoBarras: 'readonly',
  catalogoExportarCsv: 'readonly',
  // Importacion.gs
  importacionPlantillaCsv: 'readonly',
  importacionInstrucciones: 'readonly',
  importacionPrevisualizar: 'readonly',
  importacionAplicar: 'readonly',
  importacionListar: 'readonly',
  importacionLeerFila_: 'readonly',
  importacionValidarFila_: 'readonly',
  importacionDetectarCambios_: 'readonly',
  importacionAplicarNuevo_: 'readonly',
  importacionAplicarActualizacion_: 'readonly',
  importacionResultadoVacio_: 'readonly',
  // SelfTest.gs
  assert_: 'readonly'
};

module.exports = [
  {
    files: ['src/**/*.gs'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: Object.assign({}, gasServices, projectGlobals)
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      // builtinGlobals: false — los símbolos del proyecto se declaran como
      // globals arriba Y se definen en su archivo; eso no es una redeclaración.
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-var': 'off',
      eqeqeq: ['error', 'smart'],
      'no-implicit-globals': 'off'
    }
  }
];
