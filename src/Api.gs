/**
 * Api.gs — ÚNICA capa invocable desde el cliente (google.script.run).
 *
 * Toda la lógica de negocio vive en funciones con sufijo "_", que Apps
 * Script NO permite invocar desde el cliente. Cada función de esta capa
 * valida la sesión (token) y el rol EN EL SERVIDOR antes de operar (§24).
 *
 * Matriz de permisos (§12.4):
 *   - RETIRO y búsqueda por código: TRABAJADOR y JEFATURA.
 *   - Todo lo demás (ingresos, ajustes, catálogo, importación, panel,
 *     usuarios): solo JEFATURA.
 */

// ------------------------------- sesión ------------------------------------

function apiLogin(identificador, pin) {
  return authLogin_(identificador, pin);
}

function apiLogout(token) {
  authLogout_(token);
  return { ok: true };
}

/** Info de la sesión vigente (para restaurarla al recargar la página). */
function apiSesionInfo(token) {
  var u = authValidar_(token);
  return { usuario_id: u.usuario_id, nombre: u.nombre, rol: u.rol };
}

// --------------------- operaciones de ambos roles --------------------------

function apiBuscarCodigo(token, codigoBarras) {
  authValidar_(token);
  return movBuscarCodigo_(codigoBarras);
}

/** Confirma un retiro. El responsable es SIEMPRE el usuario de la sesión. */
function apiRetiroConfirmar(token, datos) {
  var u = authValidar_(token);
  return movConfirmar_({
    tipo: CONFIG.TIPOS_MOVIMIENTO.RETIRO,
    usuarioId: u.usuario_id,
    usuarioNombre: u.nombre,
    origen: 'BODEGA',
    destino: 'TIENDA',
    observacion: datos && datos.observacion,
    claveIdempotencia: datos && datos.claveIdempotencia,
    items: datos && datos.items
  });
}

/**
 * Retiros recientes del usuario autenticado (§21 "Mis movimientos").
 * Solo RETIROS: las entradas o ajustes que el mismo usuario registre con
 * otro rol no pertenecen a esta lista.
 */
function apiMisMovimientos(token) {
  var u = authValidar_(token);
  return movListar_({
    usuarioId: u.usuario_id,
    tipo: CONFIG.TIPOS_MOVIMIENTO.RETIRO
  }).slice(0, 20);
}

// ----------------------- operaciones de jefatura ---------------------------

/** Confirma un ingreso (ENTRADA). Solo jefatura (§12.4). */
function apiIngresoConfirmar(token, datos) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  return movConfirmar_({
    tipo: CONFIG.TIPOS_MOVIMIENTO.ENTRADA,
    usuarioId: u.usuario_id,
    usuarioNombre: u.nombre,
    origen: 'PROVEEDOR',
    destino: 'BODEGA',
    observacion: datos && datos.observacion,
    claveIdempotencia: datos && datos.claveIdempotencia,
    items: datos && datos.items
  });
}

/** Ajustes y reversas auditados. Solo jefatura, con motivo obligatorio (§17). */
function apiAjusteConfirmar(token, datos) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  var tipo = utilTrim(datos && datos.tipo).toUpperCase();
  if (tipo !== CONFIG.TIPOS_MOVIMIENTO.AJUSTE &&
      tipo !== CONFIG.TIPOS_MOVIMIENTO.REVERSA) {
    throw new Error('Tipo inválido: solo AJUSTE o REVERSA.');
  }
  valRequireNonEmpty(datos.observacion, 'motivo del ajuste');
  return movConfirmar_({
    tipo: tipo,
    usuarioId: u.usuario_id,
    usuarioNombre: u.nombre,
    origen: 'BODEGA',
    destino: 'BODEGA',
    observacion: datos.observacion,
    items: datos.items
  });
}

function apiPanelDashboard(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return panelDashboard_();
}

/**
 * Carga inicial del panel en UNA llamada (rendimiento): dashboard e
 * inventario juntos, reutilizando la misma lectura de inventario.
 */
function apiPanelInicial(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  var inventario = invListar_();
  return {
    dashboard: panelDashboard_(inventario),
    inventario: inventario
  };
}

function apiInvListar(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return invListar_();
}

function apiMovListar(token, filtros) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return movListar_(filtros);
}

function apiMovObtenerDetalle(token, movimientoId) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return movObtenerDetalle_(movimientoId);
}

function apiMovTrazabilidad(token, productoId) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return movTrazabilidadProducto_(productoId);
}

// Catálogo e importación (solo jefatura, §12.4)

function apiCatalogoListar(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return catalogoListar_();
}

function apiCatalogoCrearProducto(token, datos) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  return catalogoCrearProducto_(datos, CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL, u.usuario_id);
}

function apiCatalogoEditarProducto(token, productoId, patch) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  return catalogoEditarProducto_(productoId, patch,
    CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL, u.usuario_id);
}

function apiCatalogoCrearFormato(token, datos) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  return catalogoCrearFormato_(datos, CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL, u.usuario_id);
}

function apiCatalogoEditarFormato(token, formatoId, patch) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  return catalogoEditarFormato_(formatoId, patch,
    CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL, u.usuario_id);
}

function apiCatalogoCambiarEstado(token, entidad, id, activar, forzar) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  return catalogoCambiarEstado_(entidad, id, activar, forzar,
    CONFIG.ORIGENES_CAMBIO.EDICION_MANUAL, u.usuario_id);
}

/** Activa/desactiva varios productos de una vez (solo jefatura). */
function apiCatalogoEstadoLote(token, productoIds, activar) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  return catalogoCambiarEstadoLoteProductos_(productoIds, activar, u.usuario_id);
}

function apiCatalogoExportar(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return catalogoExportarCsv_();
}

function apiImportPlantilla(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return importacionPlantillaCsv_();
}

function apiImportInstrucciones(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return importacionInstrucciones_();
}

function apiImportPrevisualizar(token, csvText, modo) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return importacionPrevisualizar_(csvText, modo);
}

function apiImportAplicar(token, csvText, modo, nombreArchivo) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  return importacionAplicar_(csvText, modo, nombreArchivo, u.usuario_id);
}

function apiImportListar(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return importacionListar_(20);
}

function apiHistorialListar(token, limite) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return histListar_(limite);
}

// Usuarios (solo jefatura)

function apiUsuariosListar(token) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return usuariosListar_();
}

function apiUsuarioCrear(token, datos) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return usuarioCrear_(datos);
}

function apiUsuarioCambiarEstado(token, usuarioId, activar) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  if (u.usuario_id === utilTrim(usuarioId) && !activar) {
    throw new Error('No puedes desactivar tu propia cuenta.');
  }
  return usuarioCambiarEstado_(usuarioId, activar);
}

function apiUsuarioCambiarRol(token, usuarioId, rol) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  if (u.usuario_id === utilTrim(usuarioId)) {
    throw new Error('No puedes cambiar tu propio rol.');
  }
  return usuarioCambiarRol_(usuarioId, rol);
}

function apiUsuarioResetPin(token, usuarioId, nuevoPin) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return usuarioResetPin_(usuarioId, nuevoPin);
}

function apiUsuarioEditar(token, usuarioId, patch) {
  authValidar_(token, CONFIG.ROLES.JEFATURA);
  return usuarioEditar_(usuarioId, patch);
}

function apiUsuarioEliminar(token, usuarioId) {
  var u = authValidar_(token, CONFIG.ROLES.JEFATURA);
  if (u.usuario_id === utilTrim(usuarioId)) {
    throw new Error('No puedes eliminar tu propia cuenta.');
  }
  return usuarioEliminar_(usuarioId);
}
