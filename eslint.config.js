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
  dbWriteAllRows_: 'readonly',
  dbDeleteRowByIndex_: 'readonly',
  dbCeldaATexto_: 'readonly',
  dbFormatearRangoTexto_: 'readonly',
  dbConLock_: 'readonly',
  // Ids.gs
  idNext_: 'readonly',
  idNextBatch_: 'readonly',
  // Parametros.gs
  parametrosObtener_: 'readonly',
  parametrosGuardar_: 'readonly',
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
  catalogoCambiarEstadoLoteProductos_: 'readonly',
  catalogoEliminarFormato_: 'readonly',
  catalogoEliminarProducto_: 'readonly',
  catalogoEliminarLoteProductos_: 'readonly',
  catalogoAdvertenciaDesactivacion_: 'readonly',
  catalogoValidarCodigoBarrasUnico_: 'readonly',
  catalogoBuscarPorCodigoBarras_: 'readonly',
  catalogoListarOffline_: 'readonly',
  catalogoExportarCsv_: 'readonly',
  // Importacion.gs
  importacionPlantillaCsv_: 'readonly',
  importacionInstrucciones_: 'readonly',
  importacionPrevisualizar_: 'readonly',
  importacionAplicar_: 'readonly',
  importacionListar_: 'readonly',
  importacionLeerFila_: 'readonly',
  importacionExpandirFila_: 'readonly',
  importacionNormalizarEntero_: 'readonly',
  importacionValidarFila_: 'readonly',
  importacionDetectarCambios_: 'readonly',
  importacionAplicarEnLote_: 'readonly',
  importacionResultadoVacio_: 'readonly',
  // Inventario.gs
  invGetStock_: 'readonly',
  invListar_: 'readonly',
  // Movimientos.gs
  movConfirmar_: 'readonly',
  movBuscarPorClave_: 'readonly',
  movBuscarCodigo_: 'readonly',
  movResolverItem_: 'readonly',
  movListar_: 'readonly',
  movObtenerDetalle_: 'readonly',
  movTrazabilidadProducto_: 'readonly',
  movPendientesAntiguos_: 'readonly',
  // Panel.gs
  panelDashboard_: 'readonly',
  panelMetricas_: 'readonly',
  // Auth.gs
  authLogin_: 'readonly',
  authLogout_: 'readonly',
  authValidar_: 'readonly',
  authGuardarSesion_: 'readonly',
  authResolverUsuarioId_: 'readonly',
  authLimpiarSesionesExpiradas_: 'readonly',
  authVerificarBloqueo_: 'readonly',
  authRegistrarFallo_: 'readonly',
  // Usuarios.gs
  usuariosListar_: 'readonly',
  usuarioCrear_: 'readonly',
  usuarioCambiarEstado_: 'readonly',
  usuarioCambiarRol_: 'readonly',
  usuarioResetPin_: 'readonly',
  usuarioEditar_: 'readonly',
  usuarioEliminar_: 'readonly',
  usuarioIdentificadorEnUso_: 'readonly',
  // Api.gs (capa pública; referenciada por Http.gs y las pruebas)
  apiLogin: 'readonly',
  apiLogout: 'readonly',
  apiSesionInfo: 'readonly',
  apiBuscarCodigo: 'readonly',
  apiCatalogoOffline: 'readonly',
  apiRetiroConfirmar: 'readonly',
  apiMisMovimientos: 'readonly',
  apiIngresoConfirmar: 'readonly',
  apiAjusteConfirmar: 'readonly',
  apiPanelDashboard: 'readonly',
  apiPanelMetricas: 'readonly',
  apiPanelInicial: 'readonly',
  apiInvListar: 'readonly',
  apiMovListar: 'readonly',
  apiMovObtenerDetalle: 'readonly',
  apiMovTrazabilidad: 'readonly',
  apiCatalogoListar: 'readonly',
  apiCatalogoCrearProducto: 'readonly',
  apiCatalogoEditarProducto: 'readonly',
  apiCatalogoCrearFormato: 'readonly',
  apiCatalogoEditarFormato: 'readonly',
  apiCatalogoCambiarEstado: 'readonly',
  apiCatalogoExportar: 'readonly',
  apiImportPlantilla: 'readonly',
  apiImportInstrucciones: 'readonly',
  apiImportPrevisualizar: 'readonly',
  apiImportAplicar: 'readonly',
  apiImportListar: 'readonly',
  apiHistorialListar: 'readonly',
  apiUsuariosListar: 'readonly',
  apiUsuarioCrear: 'readonly',
  apiUsuarioCambiarEstado: 'readonly',
  apiUsuarioCambiarRol: 'readonly',
  apiUsuarioResetPin: 'readonly',
  apiUsuarioEditar: 'readonly',
  apiUsuarioEliminar: 'readonly',
  apiCatalogoEstadoLote: 'readonly',
  apiCatalogoEliminarFormato: 'readonly',
  apiCatalogoEliminarProducto: 'readonly',
  apiCatalogoEliminarLote: 'readonly',
  apiConfigObtener: 'readonly',
  apiConfigGuardar: 'readonly',
  // Http.gs
  httpFunciones_: 'readonly',
  doPost: 'readonly',
  // Backup.gs
  backupNombreArchivo_: 'readonly',
  backupVencidos_: 'readonly',
  backupEjecutar_: 'readonly',
  backupObtenerCarpeta_: 'readonly',
  setupInstalarRespaldoDiario: 'readonly',
  // Setup.gs
  setupDatabase: 'readonly',
  setupCrearUsuarioJefatura: 'readonly',
  // SelfTest.gs
  assert_: 'readonly',
  runMovimientoTests: 'readonly',
  testBackupLogicaPura_: 'readonly'
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
  },
  {
    // Frontend estático servido por GitHub Pages.
    files: ['web/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        console: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        setTimeout: 'readonly',
        AbortController: 'readonly',
        API_URL: 'readonly',
        Sesion: 'readonly',
        Ui: 'readonly',
        uuid: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-var': 'off',
      eqeqeq: ['error', 'smart']
    }
  }
];
