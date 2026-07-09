/**
 * Code.gs — Punto de entrada de la aplicación web.
 *
 * En la Fase 1 sirve una página de estado que confirma que la fundación está
 * operativa. Las interfaces de jefatura (PC) y trabajador (Android) se
 * agregan en las fases 4 a 6.
 */

function doGet(e) {
  var page = e && e.parameter && e.parameter.page;
  if (page === 'catalogo') {
    return HtmlService.createHtmlOutputFromFile('CatalogoUi')
      .setTitle('Catálogo — Sistema Bodega')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (page === 'ingreso') {
    return HtmlService.createHtmlOutputFromFile('IngresoUi')
      .setTitle('Ingreso — Sistema Bodega')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (page === 'retiro') {
    return HtmlService.createHtmlOutputFromFile('RetiroUi')
      .setTitle('Retiro — Sistema Bodega')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=no');
  }

  var estado = codeEstadoFundacion_();
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Sistema Bodega</title></head>' +
    '<body style="font-family:sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem">' +
    '<h1>Sistema de Control y Trazabilidad de Bodega</h1>' +
    '<p><strong>Estado:</strong> Fase 1 (fundación) desplegada.</p>' +
    '<ul>' +
    '<li>Base de datos configurada: ' + (estado.baseDatosConfigurada ? 'Sí' : 'No — ejecutar setupDatabase()') + '</li>' +
    '<li>Hojas del modelo: ' + estado.hojasExistentes + ' de ' + estado.hojasEsperadas + '</li>' +
    '<li>Usuarios registrados: ' + estado.usuarios + '</li>' +
    '</ul>' +
    '<p><a href="?page=catalogo">→ Administración del catálogo</a><br>' +
    '<a href="?page=ingreso">→ Ingreso de mercadería (pistola)</a><br>' +
    '<a href="?page=retiro">→ Retiro para reponer tienda (celular)</a></p>' +
    '<p>Las pantallas de ingreso, retiro y consulta se habilitan en las próximas fases.</p>' +
    '</body></html>'
  );
  html.setTitle('Sistema Bodega');
  return html;
}

/** Estado interno de la fundación, tolerante a base de datos no configurada. */
function codeEstadoFundacion_() {
  var estado = {
    baseDatosConfigurada: false,
    hojasEsperadas: Object.keys(CONFIG.SHEETS).length,
    hojasExistentes: 0,
    usuarios: 0
  };
  try {
    var ss = dbGetSpreadsheet();
    estado.baseDatosConfigurada = true;
    Object.keys(CONFIG.SHEETS).forEach(function (key) {
      if (ss.getSheetByName(CONFIG.SHEETS[key].name)) estado.hojasExistentes++;
    });
    estado.usuarios = dbReadAll('USUARIOS').length;
  } catch (err) {
    // Sin configurar: la página de estado lo informa.
  }
  return estado;
}
