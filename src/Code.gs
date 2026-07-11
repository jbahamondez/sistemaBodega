/**
 * Code.gs — Punto de entrada GET del backend.
 *
 * Desde la migración a GitHub Pages (D-022), las pantallas viven en el
 * frontend estático (carpeta web/) y este servicio actúa solo como API JSON
 * (Http.gs). doGet devuelve una página NEUTRA: el endpoint es público y
 * anónimo, así que no debe divulgar estado interno ni conteos (auditoría
 * M8). La verificación de salud real se hace desde el editor de Apps Script
 * (menú Ejecuciones) o ejecutando codeEstadoFundacion_ manualmente.
 */

function doGet() {
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Sistema Bodega</title></head>' +
    '<body style="font-family:sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem">' +
    '<h1>Sistema Bodega</h1>' +
    '<p>Servicio en funcionamiento. Accede al sistema desde la aplicación web.</p>' +
    '</body></html>'
  );
  html.setTitle('Sistema Bodega');
  return html;
}

/**
 * Estado interno de la fundación (para diagnóstico manual desde el editor,
 * NO expuesto por HTTP). Tolerante a base de datos no configurada.
 */
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
    // Sin configurar: el diagnóstico manual lo informa.
  }
  Logger.log(JSON.stringify(estado, null, 2));
  return estado;
}
