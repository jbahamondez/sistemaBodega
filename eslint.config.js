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
  dbGetSpreadsheet_: 'readonly',
  dbGetSheet_: 'readonly',
  dbReadAll_: 'readonly',
  dbFindById_: 'readonly',
  dbFindOne_: 'readonly',
  dbFindWhere_: 'readonly',
  dbAppendRow_: 'readonly',
  dbAppendRows_: 'readonly',
  dbUpdateById_: 'readonly',
  dbUpdateRowByIndex_: 'readonly',
  dbGetConfigValue_: 'readonly',
  dbSetConfigValue_: 'readonly',
  // Ids.gs
  idNext_: 'readonly',
  idNextBatch_: 'readonly',
  // Historial.gs
  histRegistrar_: 'readonly',
  histRegistrarCambios_: 'readonly',
  histListar_: 'readonly',
  // Catalogo.gs
  catalogoListar_: 'readonly',
  catalogoCrearProducto_: 'readonly',
  catalogoEditarProducto_: 'readonly',
  catalogoCrearFormato_: 'readonly',
  catalogoEditarFormato_: 'readonly',
  catalogoCambiarEstado_: 'readonly',
  catalogoAdvertenciaDesactivacion_: 'readonly',
  catalogoValidarCodigoBarrasUnico_: 'readonly',
  catalogoBuscarPorCodigoBarras_: 'readonly',
  catalogoExportarCsv_: 'readonly',
  // Importacion.gs
  importacionPlantillaCsv_: 'readonly',
  importacionInstrucciones_: 'readonly',
  importacionPrevisualizar_: 'readonly',
  importacionAplicar_: 'readonly',
  importacionListar_: 'readonly',
  importacionLeerFila_: 'readonly',
  importacionValidarFila_: 'readonly',
  importacionDetectarCambios_: 'readonly',
  importacionAplicarNuevo_: 'readonly',
  importacionAplicarActualizacion_: 'readonly',
  importacionResultadoVacio_: 'readonly',
  // Inventario.gs
  invGetStock_: 'readonly',
  invListar_: 'readonly',
  invActualizarStock_: 'readonly',
  // Movimientos.gs
  movConfirmar_: 'readonly',
  movBuscarCodigo_: 'readonly',
  movResolverItem_: 'readonly',
  movListar_: 'readonly',
  movObtenerDetalle_: 'readonly',
  movTrazabilidadProducto_: 'readonly',
  // Panel.gs
  panelDashboard_: 'readonly',
  // Auth.gs
  authLogin_: 'readonly',
  authLogout_: 'readonly',
  authValidar_: 'readonly',
  // Usuarios.gs
  usuariosListar_: 'readonly',
  usuarioCrear_: 'readonly',
  usuarioCambiarEstado_: 'readonly',
  usuarioCambiarRol_: 'readonly',
  usuarioResetPin_: 'readonly',
  // Api.gs (capa pública; referenciada también desde las pruebas)
  apiLogin: 'readonly',
  apiLogout: 'readonly',
  apiSesionInfo: 'readonly',
  apiBuscarCodigo: 'readonly',
  apiRetiroConfirmar: 'readonly',
  apiMisMovimientos: 'readonly',
  apiIngresoConfirmar: 'readonly',
  apiAjusteConfirmar: 'readonly',
  apiPanelDashboard: 'readonly',
  apiUsuariosListar: 'readonly',
  apiUsuarioCambiarEstado: 'readonly',
  // Setup.gs
  setupDatabase: 'readonly',
  // SelfTest.gs
  assert_: 'readonly',
  runMovimientoTests: 'readonly'
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
