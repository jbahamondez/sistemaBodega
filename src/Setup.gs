/**
 * Setup.gs — Inicialización de la base de datos en Google Sheets.
 *
 * setupDatabase() se ejecuta manualmente una vez desde el editor de Apps
 * Script. Es idempotente: si el spreadsheet u hojas ya existen, solo crea lo
 * que falte y nunca borra datos.
 */

/**
 * Crea (o completa) el spreadsheet con todas las hojas del modelo de datos,
 * formatea las columnas de códigos como texto y siembra la configuración
 * inicial. Devuelve un resumen con la URL del archivo.
 */
function setupDatabase() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(CONFIG.PROP_SPREADSHEET_ID);
  var ss;

  if (spreadsheetId) {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } else {
    ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
    props.setProperty(CONFIG.PROP_SPREADSHEET_ID, ss.getId());
  }

  var created = [];
  Object.keys(CONFIG.SHEETS).forEach(function (sheetKey) {
    if (setupEnsureSheet_(ss, sheetKey)) created.push(CONFIG.SHEETS[sheetKey].name);
  });

  setupRemoveDefaultSheet_(ss);
  setupSeedConfig_();

  var summary = {
    spreadsheetId: ss.getId(),
    url: ss.getUrl(),
    hojasCreadas: created,
    mensaje: created.length
      ? 'Base de datos inicializada. Hojas creadas: ' + created.join(', ')
      : 'Base de datos ya estaba completa. No se modificó nada.'
  };
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

/**
 * Crea una hoja con sus encabezados si no existe. Si existe, valida que los
 * encabezados coincidan con el esquema y falla con mensaje claro si no.
 * Devuelve true si la hoja fue creada.
 */
function setupEnsureSheet_(ss, sheetKey) {
  var def = CONFIG.SHEETS[sheetKey];
  var sheet = ss.getSheetByName(def.name);

  if (sheet) {
    var existing = sheet.getRange(1, 1, 1, def.columns.length).getValues()[0]
      .map(function (v) { return utilTrim(v); });
    def.columns.forEach(function (col, i) {
      if (existing[i] !== col) {
        throw new Error(
          'La hoja "' + def.name + '" existe pero su columna ' + (i + 1) +
          ' es "' + existing[i] + '" y el esquema espera "' + col +
          '". Corrige la hoja manualmente antes de continuar (no se ' +
          'modifican hojas con datos de forma automática).');
      }
    });
    return false;
  }

  sheet = ss.insertSheet(def.name);
  sheet.getRange(1, 1, 1, def.columns.length)
    .setValues([def.columns])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Las columnas de códigos/IDs se formatean como texto plano para que
  // Sheets nunca convierta '001234567890' en 1234567890 ni use notación
  // científica con códigos largos.
  def.textColumns.forEach(function (col) {
    var colIndex = def.columns.indexOf(col) + 1;
    sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  });

  return true;
}

/** Elimina la hoja vacía por defecto ('Hoja 1' / 'Sheet1') si aún existe. */
function setupRemoveDefaultSheet_(ss) {
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });
}

/** Siembra contadores de IDs y parámetros operativos si no existen. */
function setupSeedConfig_() {
  Object.keys(CONFIG.IDS).forEach(function (entityKey) {
    var counterKey = CONFIG.IDS[entityKey].counterKey;
    if (dbGetConfigValue_(counterKey) === null) {
      dbSetConfigValue_(counterKey, 0);
    }
  });
  Object.keys(CONFIG.DEFAULTS).forEach(function (clave) {
    if (dbGetConfigValue_(clave) === null) {
      dbSetConfigValue_(clave, CONFIG.DEFAULTS[clave]);
    }
  });
}

/**
 * Crea el primer usuario con rol JEFATURA. Ejecutar manualmente una vez
 * desde el editor, editando los tres valores de ejemplo. Falla si ya existe
 * un usuario con el mismo identificador de acceso.
 *
 * El PIN se almacena solo como hash con salt; el original no queda guardado.
 */
function setupCrearUsuarioJefatura(nombre, identificadorAcceso, pin) {
  // GUARDIA DE SEGURIDAD: esta función no termina en "_" para poder
  // ejecutarse desde el editor, lo que también la deja invocable vía
  // google.script.run. Solo funciona como bootstrap: si ya existe un
  // usuario JEFATURA activo, se niega — los demás usuarios se crean desde
  // el panel con sesión validada (Api.gs).
  var yaHayJefatura = dbFindOne_('USUARIOS', function (u) {
    return u.rol === CONFIG.ROLES.JEFATURA && utilToBool(u.activo);
  });
  if (yaHayJefatura) {
    throw new Error(
      'Ya existe un usuario de jefatura activo. Crea los demás usuarios ' +
      'desde el panel (pestaña Usuarios), con sesión iniciada.');
  }

  // Valores de ejemplo para ejecución directa desde el editor:
  nombre = nombre || 'Jefatura';
  identificadorAcceso = utilTrim(identificadorAcceso || 'jefatura');
  pin = utilTrim(pin || '');

  valRequireNonEmpty(nombre, 'nombre');
  valRequireNonEmpty(identificadorAcceso, 'identificador de acceso');
  if (pin.length < 6) {
    throw new Error('El PIN debe tener al menos 6 dígitos.');
  }

  var existente = dbFindOne_('USUARIOS', function (u) {
    return u.identificador_acceso === identificadorAcceso;
  });
  if (existente) {
    throw new Error(
      'Ya existe un usuario con identificador "' + identificadorAcceso + '".');
  }

  var salt = utilGenerateSalt();
  var now = utilNow();
  var usuario = {
    usuario_id: idNext_('USUARIO'),
    nombre: utilTrim(nombre),
    identificador_acceso: identificadorAcceso,
    rol: CONFIG.ROLES.JEFATURA,
    pin_hash: utilHashPin(pin, salt),
    pin_salt: salt,
    activo: CONFIG.BOOL.SI,
    created_at: now,
    updated_at: now
  };
  dbAppendRow_('USUARIOS', usuario);

  Logger.log('Usuario de jefatura creado: ' + usuario.usuario_id);
  return usuario.usuario_id;
}

/**
 * Reinicio para ENTREGA: deja la base como recién instalada pero SIN datos
 * de prueba — vacía todas las hojas de datos (productos, formatos,
 * inventario, movimientos, detalle, historial, importaciones y USUARIOS),
 * recrea sus encabezados actualizados y pone los contadores de ID en cero.
 * La hoja Configuracion se conserva y sus parámetros operativos vuelven a
 * los valores por defecto. Ejecutar UNA vez desde el editor antes de
 * entregar el sistema al cliente; luego crear su cuenta con
 * setupCrearUsuarioJefatura().
 *
 * DESTRUCTIVO E IRREVERSIBLE. Por seguridad exige la palabra de
 * confirmación exacta, así que el botón "Ejecutar" del editor (que no pasa
 * argumentos) NO la dispara por accidente: hay que llamarla explícitamente
 * con setupReiniciarParaEntrega('BORRAR TODO'). No está en la whitelist
 * HTTP (Http.gs), por lo que tampoco es invocable desde la web.
 */
function setupReiniciarParaEntrega(confirmacion) {
  if (confirmacion !== 'BORRAR TODO') {
    throw new Error(
      'Operación DESTRUCTIVA: borra todos los datos (incluidos usuarios). ' +
      'Para confirmar, ejecútala así: setupReiniciarParaEntrega("BORRAR TODO").');
  }

  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(CONFIG.PROP_SPREADSHEET_ID);
  if (!spreadsheetId) {
    throw new Error('No hay base de datos configurada. Ejecuta setupDatabase() primero.');
  }
  var ss = SpreadsheetApp.openById(spreadsheetId);

  // Borra todas las hojas de datos (todo menos Configuracion). Al eliminarlas
  // y recrearlas con setupDatabase(), los encabezados quedan exactamente
  // según el esquema vigente — incluido clave_idempotencia en Movimientos.
  var borradas = [];
  Object.keys(CONFIG.SHEETS).forEach(function (sheetKey) {
    if (sheetKey === 'CONFIGURACION') return;
    var sheet = ss.getSheetByName(CONFIG.SHEETS[sheetKey].name);
    if (sheet) { ss.deleteSheet(sheet); borradas.push(CONFIG.SHEETS[sheetKey].name); }
  });

  // Recrea las hojas vacías con sus encabezados.
  setupDatabase();

  // Contadores de ID a cero: los primeros registros del cliente parten en
  // PROD-0001, MOV-000001, etc. (setupSeedConfig_ no los reinicia porque ya
  // existían, por eso se fuerzan aquí).
  Object.keys(CONFIG.IDS).forEach(function (entityKey) {
    dbSetConfigValue_(CONFIG.IDS[entityKey].counterKey, 0);
  });

  // Parámetros de Panel → Configuración de vuelta a fábrica (el cliente los
  // ajusta luego). Se reutiliza parametrosGuardar_ para cubrir los tres,
  // incluidos los que no viven en CONFIG.DEFAULTS (retención, tope).
  parametrosGuardar_({
    stock_minimo: PARAM_STOCK_MINIMO_DEFECTO,
    backup_retencion_dias: PARAM_BACKUP_RETENCION_DEFECTO,
    mov_limite: PARAM_MOV_LIMITE_DEFECTO
  });

  var resumen = {
    ok: true,
    hojasReiniciadas: borradas,
    mensaje: 'Base reiniciada para entrega. Ahora crea la cuenta del cliente ' +
      'con setupCrearUsuarioJefatura("Nombre", "identificador", "PIN 6+ dígitos").'
  };
  Logger.log(JSON.stringify(resumen, null, 2));
  return resumen;
}
