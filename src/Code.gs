/**
 * Code.gs — Punto de entrada GET: página de estado del backend.
 *
 * Desde la migración a GitHub Pages (D-022), las pantallas viven en el
 * frontend estático (carpeta web/ del repositorio) y este servicio actúa
 * solo como API JSON (Http.gs). doGet queda como verificación rápida de
 * salud del backend.
 */

function doGet() {
  var estado = codeEstadoFundacion_();
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Sistema Bodega — API</title></head>' +
    '<body style="font-family:sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem">' +
    '<h1>Sistema Bodega — Backend</h1>' +
    '<p>Este servicio es la API del sistema. Las pantallas están en el ' +
    'sitio del frontend (GitHub Pages).</p>' +
    '<ul>' +
    '<li>Base de datos configurada: ' + (estado.baseDatosConfigurada ? 'Sí' : 'No — ejecutar setupDatabase()') + '</li>' +
    '<li>Hojas del modelo: ' + estado.hojasExistentes + ' de ' + estado.hojasEsperadas + '</li>' +
    '<li>Usuarios registrados: ' + estado.usuarios + '</li>' +
    '</ul>' +
    '</body></html>'
  );
  html.setTitle('Sistema Bodega — API');
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
    var ss = dbGetSpreadsheet_();
    estado.baseDatosConfigurada = true;
    Object.keys(CONFIG.SHEETS).forEach(function (key) {
      if (ss.getSheetByName(CONFIG.SHEETS[key].name)) estado.hojasExistentes++;
    });
    estado.usuarios = dbReadAll_('USUARIOS').length;
  } catch (err) {
    // Sin configurar: la página de estado lo informa.
  }
  return estado;
}
