/**
 * Code.gs — Punto de entrada de la aplicación web y routing de páginas.
 *
 * Las páginas se sirven como plantillas para poder insertar el parcial de
 * sesión compartido (SesionParcial.html) con <?!= include('...'); ?>.
 * La autorización real ocurre en el servidor (Api.gs); el login del cliente
 * solo gestiona el token.
 */

/** Inserta un archivo HTML parcial dentro de una plantilla. */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

function doGet(e) {
  var page = e && e.parameter && e.parameter.page;
  var paginas = {
    catalogo: { archivo: 'CatalogoUi', titulo: 'Catálogo — Sistema Bodega' },
    ingreso: { archivo: 'IngresoUi', titulo: 'Ingreso — Sistema Bodega' },
    panel: { archivo: 'PanelUi', titulo: 'Panel — Sistema Bodega' },
    retiro: { archivo: 'RetiroUi', titulo: 'Retiro — Sistema Bodega' }
  };

  if (paginas[page]) {
    return HtmlService.createTemplateFromFile(paginas[page].archivo)
      .evaluate()
      .setTitle(paginas[page].titulo)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  var estado = codeEstadoFundacion_();
  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Sistema Bodega</title></head>' +
    '<body style="font-family:sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem">' +
    '<h1>Sistema de Control y Trazabilidad de Bodega</h1>' +
    '<ul>' +
    '<li>Base de datos configurada: ' + (estado.baseDatosConfigurada ? 'Sí' : 'No — ejecutar setupDatabase()') + '</li>' +
    '<li>Hojas del modelo: ' + estado.hojasExistentes + ' de ' + estado.hojasEsperadas + '</li>' +
    '<li>Usuarios registrados: ' + estado.usuarios + '</li>' +
    '</ul>' +
    '<p><a href="?page=panel">→ Panel de jefatura (dashboard, inventario, trazabilidad)</a><br>' +
    '<a href="?page=catalogo">→ Administración del catálogo</a><br>' +
    '<a href="?page=ingreso">→ Ingreso de mercadería (pistola)</a><br>' +
    '<a href="?page=retiro">→ Retiro para reponer tienda (celular)</a></p>' +
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
