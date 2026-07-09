/**
 * Http.gs — API JSON para el frontend alojado en GitHub Pages (D-022).
 *
 * El cliente hace POST al /exec con Content-Type text/plain (petición
 * "simple": el navegador no exige preflight CORS y Apps Script responde con
 * Access-Control-Allow-Origin) y body JSON: { fn: 'apiLogin', args: [...] }.
 *
 * Solo las funciones registradas en httpFunciones_() son invocables: la
 * whitelist es la misma superficie pública de Api.gs, que valida token de
 * sesión y rol en el servidor en cada operación.
 */

/** Mapa explícito de funciones expuestas por HTTP. */
function httpFunciones_() {
  return {
    apiLogin: apiLogin,
    apiLogout: apiLogout,
    apiSesionInfo: apiSesionInfo,
    apiBuscarCodigo: apiBuscarCodigo,
    apiRetiroConfirmar: apiRetiroConfirmar,
    apiMisMovimientos: apiMisMovimientos,
    apiIngresoConfirmar: apiIngresoConfirmar,
    apiAjusteConfirmar: apiAjusteConfirmar,
    apiPanelDashboard: apiPanelDashboard,
    apiInvListar: apiInvListar,
    apiMovListar: apiMovListar,
    apiMovObtenerDetalle: apiMovObtenerDetalle,
    apiMovTrazabilidad: apiMovTrazabilidad,
    apiCatalogoListar: apiCatalogoListar,
    apiCatalogoCrearProducto: apiCatalogoCrearProducto,
    apiCatalogoEditarProducto: apiCatalogoEditarProducto,
    apiCatalogoCrearFormato: apiCatalogoCrearFormato,
    apiCatalogoEditarFormato: apiCatalogoEditarFormato,
    apiCatalogoCambiarEstado: apiCatalogoCambiarEstado,
    apiCatalogoExportar: apiCatalogoExportar,
    apiImportPlantilla: apiImportPlantilla,
    apiImportInstrucciones: apiImportInstrucciones,
    apiImportPrevisualizar: apiImportPrevisualizar,
    apiImportAplicar: apiImportAplicar,
    apiImportListar: apiImportListar,
    apiHistorialListar: apiHistorialListar,
    apiUsuariosListar: apiUsuariosListar,
    apiUsuarioCrear: apiUsuarioCrear,
    apiUsuarioCambiarEstado: apiUsuarioCambiarEstado,
    apiUsuarioCambiarRol: apiUsuarioCambiarRol,
    apiUsuarioResetPin: apiUsuarioResetPin
  };
}

/** Punto de entrada HTTP del frontend. Siempre responde JSON. */
function doPost(e) {
  var salida;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Petición vacía.');
    }
    var req = JSON.parse(e.postData.contents);
    var funciones = httpFunciones_();
    var nombre = utilTrim(req.fn);
    if (!Object.prototype.hasOwnProperty.call(funciones, nombre)) {
      throw new Error('Función desconocida: "' + nombre + '".');
    }
    var args = Array.isArray(req.args) ? req.args : [];
    salida = { ok: true, data: funciones[nombre].apply(null, args) };
  } catch (err) {
    salida = { ok: false, error: err.message || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(salida))
    .setMimeType(ContentService.MimeType.JSON);
}
