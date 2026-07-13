/**
 * SelfTest.gs — Pruebas de la fundación (Fase 1).
 *
 * Ejecutar runFoundationTests() desde el editor de Apps Script. Las pruebas
 * puras no tocan la base de datos; las de integración requieren haber
 * ejecutado setupDatabase() y escriben solo en contadores de Configuracion.
 */

function runFoundationTests() {
  var results = [];
  var tests = [
    testUtilTrim_,
    testUtilToInt_,
    testBarcodePreservesLeadingZeros_,
    testUtilBool_,
    testHashPin_,
    testValidators_,
    testParseCsv_,
    testToCsv_,
    testPlantillaImportacion_,
    testBackupLogicaPura_,
    testCeldaFecha_,
    testIdGenerationIntegration_
  ];

  tests.forEach(function (t) {
    try {
      t();
      results.push('OK    ' + t.name);
    } catch (err) {
      results.push('FALLO ' + t.name + ' → ' + err.message);
    }
  });

  var report = results.join('\n');
  Logger.log(report);
  if (report.indexOf('FALLO') !== -1) {
    throw new Error('Hay pruebas fallidas:\n' + report);
  }
  return report;
}

function assert_(condition, message) {
  if (!condition) throw new Error(message);
}

function testUtilTrim_() {
  assert_(utilTrim('  hola  ') === 'hola', 'trim básico');
  assert_(utilTrim(null) === '', 'null → vacío');
  assert_(utilTrim(undefined) === '', 'undefined → vacío');
  assert_(utilTrim(15) === '15', 'número → texto');
}

function testUtilToInt_() {
  assert_(utilToInt('15') === 15, 'entero válido');
  assert_(utilToInt(' 20 ') === 20, 'entero con espacios');
  assert_(utilToInt('15.5') === null, 'decimal rechazado');
  assert_(utilToInt('abc') === null, 'texto rechazado');
  assert_(utilToInt('') === null, 'vacío rechazado');
  assert_(utilToInt('-3') === -3, 'negativo válido como entero');
}

function testBarcodePreservesLeadingZeros_() {
  var codigo = utilNormalizeBarcode(' 001234567890 ');
  assert_(codigo === '001234567890',
    'el código debe conservar ceros iniciales exactamente (Caso 11)');
  assert_(valIsCodigoBarras(codigo), 'código con ceros iniciales es válido');
  assert_(!valIsCodigoBarras(''), 'código vacío es inválido');
  assert_(!valIsCodigoBarras('12 34'), 'código con espacio interno es inválido');
}

function testUtilBool_() {
  assert_(utilToBool('SI') === true, 'SI → true');
  assert_(utilToBool('NO') === false, 'NO → false');
  assert_(utilToBool('') === false, 'vacío → false');
  assert_(utilBoolToSheet(true) === 'SI', 'true → SI');
  assert_(utilBoolToSheet(false) === 'NO', 'false → NO');
}

function testHashPin_() {
  var salt = utilGenerateSalt();
  var hash = utilHashPin('1234', salt);
  assert_(hash.length === 64, 'hash SHA-256 hex de 64 caracteres');
  assert_(hash !== '1234', 'el PIN nunca queda en claro');
  assert_(utilHashPin('1234', salt) === hash, 'hash determinista con mismo salt');
  assert_(utilHashPin('1234', utilGenerateSalt()) !== hash, 'salt distinto → hash distinto');
  assert_(utilSafeEquals(hash, utilHashPin('1234', salt)), 'comparación segura');
  assert_(!utilSafeEquals(hash, utilHashPin('9999', salt)), 'PIN incorrecto no coincide');
}

function testValidators_() {
  assert_(valIsPositiveInt('15'), '15 es positivo');
  assert_(!valIsPositiveInt('0'), '0 no es positivo (unidades_por_empaque > 0)');
  assert_(!valIsPositiveInt('-5'), 'negativo no es positivo');
  assert_(valIsTipoEmpaque('DISPLAY') && valIsTipoEmpaque('caja'),
    'tipos de empaque válidos, sin distinguir mayúsculas');
  assert_(!valIsTipoEmpaque('BOLSA'), 'tipo de empaque desconocido rechazado');
  assert_(valIsRol('JEFATURA') && valIsRol('TRABAJADOR'), 'roles válidos');
  assert_(!valIsRol('ADMIN'), 'rol desconocido rechazado');
  assert_(valIsTipoMovimiento('ENTRADA') && valIsTipoMovimiento('RETIRO') &&
          valIsTipoMovimiento('AJUSTE') && valIsTipoMovimiento('REVERSA'),
    'tipos de movimiento válidos');

  var lanzo = false;
  try { valRequirePositiveInt('0', 'unidades'); } catch (e) { lanzo = true; }
  assert_(lanzo, 'valRequirePositiveInt lanza con 0');
}

function testParseCsv_() {
  // Delimitador coma, comillas y ceros iniciales (Caso 11).
  var r = utilParseCsv('codigo,nombre\n"001234567890","Choco, Bitter"\n780111,Leche\n');
  assert_(r.delimiter === ',', 'delimitador coma detectado');
  assert_(r.rows.length === 3, 'tres filas parseadas');
  assert_(r.rows[1][0] === '001234567890', 'ceros iniciales intactos en CSV');
  assert_(r.rows[1][1] === 'Choco, Bitter', 'coma interna respetada por comillas');

  // Delimitador punto y coma (Excel en español).
  var r2 = utilParseCsv('codigo;nombre\n780222;Bombon\n');
  assert_(r2.delimiter === ';', 'delimitador punto y coma detectado');
  assert_(r2.rows[1][1] === 'Bombon', 'valores con ; correctos');

  // BOM inicial y comilla escapada.
  var r3 = utilParseCsv(String.fromCharCode(0xFEFF) + 'a,b\n"x""y",z');
  assert_(r3.rows[0][0] === 'a', 'BOM eliminado del primer encabezado');
  assert_(r3.rows[1][0] === 'x"y', 'comilla doble escapada');

  // Filas vacías ignoradas.
  var r4 = utilParseCsv('a,b\n\n1,2\n\n');
  assert_(r4.rows.length === 2, 'filas vacías descartadas');
}

function testToCsv_() {
  var csv = utilToCsv([['a', 'b,c'], ['00123', 'con "comillas"']]);
  assert_(csv.charCodeAt(0) === 0xFEFF, 'CSV generado inicia con BOM');
  assert_(csv.indexOf('"b,c"') !== -1, 'campo con coma queda entre comillas');
  assert_(csv.indexOf('"con ""comillas"""') !== -1, 'comillas internas escapadas');
  // Round-trip: lo generado debe parsearse de vuelta idéntico.
  var vuelta = utilParseCsv(csv);
  assert_(vuelta.rows[0][1] === 'b,c' && vuelta.rows[1][0] === '00123',
    'round-trip CSV sin pérdida');
}

function testPlantillaImportacion_() {
  var csv = importacionPlantillaCsv_();
  var parsed = utilParseCsv(csv);
  var headers = parsed.rows[0];
  CONFIG.IMPORT_PLANILLA.columns.forEach(function (col, i) {
    assert_(headers[i] === col.header,
      'plantilla: columna ' + (i + 1) + ' debe ser ' + col.header);
  });
  assert_(parsed.rows.length === 1 + CONFIG.IMPORT_PLANILLA.exampleRows.length,
    'plantilla incluye las filas de ejemplo');
}

/**
 * Pruebas de movimientos e inventario (Casos obligatorios 1, 2, 3 y 5 del
 * prompt §29). ESCRIBEN datos de prueba, por lo que SOLO corren si la hoja
 * Configuracion tiene la clave entorno=TEST. El runner local (npm test) usa
 * una base simulada en memoria y activa esa clave automáticamente; en el
 * editor de Apps Script hay que fijarla a propósito sobre una BD de prueba.
 */
function runMovimientoTests() {
  if (dbGetConfigValue_('entorno') !== 'TEST') {
    throw new Error(
      'runMovimientoTests escribe datos de prueba. Solo se ejecuta si la ' +
      'hoja Configuracion tiene la clave "entorno" con valor "TEST" ' +
      '(usar una base de datos de prueba, nunca la real).');
  }

  var resultados = [];
  var tests = [testMovimientosCasos_, testAuthYPermisos_,
    testCorreccionCaso6_, testImportacionCasos_, testHttpRouter_,
    testPlanillaRealChocolateria_, testGestionUsuarios_, testEstadoLote_,
    testIdempotencia_, testFormulaInjection_,
    testAjusteReversa_, testMovLimite_, testPendientesAntiguos_,
    testEliminarCatalogo_];
  tests.forEach(function (t) {
    try {
      t();
      resultados.push('OK    ' + t.name);
    } catch (err) {
      resultados.push('FALLO ' + t.name + ' → ' + err.message);
    }
  });
  var reporte = resultados.join('\n');
  Logger.log(reporte);
  if (reporte.indexOf('FALLO') !== -1) {
    throw new Error('Hay pruebas fallidas:\n' + reporte);
  }
  return reporte;
}

function testMovimientosCasos_() {
  // Preparación: producto de prueba con formato unitario y display de 15.
  var producto = catalogoCrearProducto_({
    nombre: 'TEST Chocolate Bitter', codigo_producto: 'TEST-001',
    categoria: 'Test'
  });
  catalogoCrearFormato_({
    producto_id: producto.producto_id, codigo_barras: 'TEST-UNI-001',
    nombre_formato: 'Unidad', tipo_empaque: 'UNIDAD', unidades_por_empaque: 1
  });
  var display = catalogoCrearFormato_({
    producto_id: producto.producto_id, codigo_barras: 'TEST-DSP-001',
    nombre_formato: 'Display 15', tipo_empaque: 'DISPLAY', unidades_por_empaque: 15
  });

  // Stock inicial 100 mediante AJUSTE (todo cambio de stock es un movimiento).
  movConfirmar_({
    tipo: 'AJUSTE', usuarioNombre: 'Test', observacion: 'stock inicial de prueba',
    items: [{ codigo_barras: 'TEST-UNI-001', cantidad_empaques: 100 }]
  });
  assert_(invGetStock_(producto.producto_id) === 100, 'stock inicial 100');

  // Caso 1: ENTRADA de 2 displays × 15 sobre 100 → 130.
  var entrada = movConfirmar_({
    tipo: 'ENTRADA', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 2 }]
  });
  assert_(invGetStock_(producto.producto_id) === 130, 'Caso 1: 100 + 30 = 130');
  var detalleEntrada = movObtenerDetalle_(entrada.movimiento_id);
  assert_(detalleEntrada.cabecera.estado === 'CONFIRMADO', 'entrada CONFIRMADA');
  assert_(utilToInt(detalleEntrada.detalles[0].stock_anterior) === 100 &&
          utilToInt(detalleEntrada.detalles[0].stock_posterior) === 130,
    'detalle registra stock anterior 100 y posterior 130');

  // Caso 2: RETIRO de 2 displays × 15 sobre 130 → 100.
  movConfirmar_({
    tipo: 'RETIRO', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 2 }]
  });
  assert_(invGetStock_(producto.producto_id) === 100, 'Caso 2: 130 - 30 = 100');

  // Caso 3: RETIRO de 8 displays (120) sobre 100 → rechazado, nada cambia.
  var movimientosAntes = movListar_({}).length;
  var lanzo = false;
  try {
    movConfirmar_({
      tipo: 'RETIRO', usuarioNombre: 'Test',
      items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 8 }]
    });
  } catch (e) {
    lanzo = true;
    assert_(e.message.indexOf('Stock insuficiente') !== -1,
      'Caso 3: error informa stock insuficiente');
  }
  assert_(lanzo, 'Caso 3: el retiro excedido lanza error');
  assert_(invGetStock_(producto.producto_id) === 100, 'Caso 3: stock intacto en 100');
  assert_(movListar_({}).length === movimientosAntes,
    'Caso 3: no se registró ningún movimiento confirmado');

  // Atomicidad multi-ítem: si un ítem del carro no tiene stock, no se aplica nada.
  lanzo = false;
  try {
    movConfirmar_({
      tipo: 'RETIRO', usuarioNombre: 'Test',
      items: [
        { codigo_barras: 'TEST-UNI-001', cantidad_empaques: 10 },
        { codigo_barras: 'TEST-DSP-001', cantidad_empaques: 99 }
      ]
    });
  } catch (e) { lanzo = true; }
  assert_(lanzo && invGetStock_(producto.producto_id) === 100,
    'carro con un ítem sin stock: no se confirma parcialmente');

  // Caso 5: cambiar el formato 15 → 18 no toca stock ni históricos.
  catalogoEditarFormato_(display.formato_id, { unidades_por_empaque: 18 });
  assert_(invGetStock_(producto.producto_id) === 100,
    'Caso 5/10: editar el catálogo no recalcula stock');
  var historicos = movTrazabilidadProducto_(producto.producto_id);
  var conDisplay = historicos.filter(function (h) { return h.formato === 'Display 15'; });
  assert_(conDisplay.length > 0 && conDisplay.every(function (h) {
    return h.unidades_por_empaque === 15;
  }), 'Caso 5: los movimientos históricos conservan el snapshot de 15');

  // Y un movimiento nuevo usa la equivalencia vigente (18).
  movConfirmar_({
    tipo: 'ENTRADA', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 1 }]
  });
  assert_(invGetStock_(producto.producto_id) === 118,
    'Caso 5: el movimiento nuevo usa 18 unidades por display (100 + 18)');

  // Lookup de escaneo: devuelve producto, formato vigente y stock actual.
  var lookup = movBuscarCodigo_('TEST-DSP-001');
  assert_(lookup.encontrado && lookup.producto_nombre === 'TEST Chocolate Bitter' &&
          lookup.unidades_por_empaque === 18 && lookup.stock_unidades === 118,
    'movBuscarCodigo_ entrega formato vigente (18) y stock actual (118)');
  assert_(movBuscarCodigo_('NO-EXISTE-999').encontrado === false,
    'movBuscarCodigo_ indica código no registrado');

  // Panel: dashboard agrega totales y el filtro por producto funciona.
  var dash = panelDashboard_();
  assert_(dash.total_productos >= 1 && dash.stock_total_unidades >= 118,
    'dashboard suma productos y unidades');
  assert_(dash.ultimos_movimientos.length > 0 &&
          dash.ultimos_movimientos[0].estado === 'CONFIRMADO',
    'dashboard lista últimos movimientos confirmados');
  var movsProducto = movListar_({ productoId: producto.producto_id });
  assert_(movsProducto.length >= 4, 'movListar_ filtra por producto');
  assert_(movListar_({ productoId: 'PROD-INEXISTENTE' }).length === 0,
    'movListar_ con producto inexistente devuelve vacío');
  var traz = movTrazabilidadProducto_(producto.producto_id);
  assert_(traz[traz.length - 1].stock_posterior === 118,
    'la trazabilidad reconstruye el stock final (118)');

  // Código no registrado se rechaza con mensaje claro (§22).
  lanzo = false;
  try {
    movConfirmar_({ tipo: 'RETIRO', usuarioNombre: 'Test',
      items: [{ codigo_barras: 'NO-EXISTE-999', cantidad_empaques: 1 }] });
  } catch (e) {
    lanzo = e.message.indexOf('Código no registrado') !== -1;
  }
  assert_(lanzo, 'código desconocido rechazado con mensaje claro');
}

/**
 * Autenticación y matriz de permisos (§12.4, §24). Depende de los datos
 * creados por testMovimientosCasos_ (formato TEST-DSP-001 con stock 118).
 */
function testAuthYPermisos_() {
  usuarioCrear_({ nombre: 'Jefa Test', identificador_acceso: 'jefa.test',
    rol: 'JEFATURA', pin: '123456' });
  var trabCreado = usuarioCrear_({ nombre: 'Trabajador Test',
    identificador_acceso: 'trab.test', rol: 'TRABAJADOR', pin: '567890' });

  // PIN mínimo de 6 dígitos (C1).
  var lanzoPinCorto = false;
  try {
    usuarioCrear_({ nombre: 'Corto', identificador_acceso: 'corto', rol: 'TRABAJADOR', pin: '123' });
  } catch (e) { lanzoPinCorto = e.message.indexOf('al menos 6') !== -1; }
  assert_(lanzoPinCorto, 'usuarioCrear_ exige PIN de al menos 6 dígitos');

  // PIN incorrecto rechazado sin revelar si el usuario existe.
  var lanzo = false;
  try { apiLogin('jefa.test', '000000'); }
  catch (e) { lanzo = e.message.indexOf('incorrecto') !== -1; }
  assert_(lanzo, 'PIN incorrecto rechazado');

  var sesionJefa = apiLogin('jefa.test', '123456');
  assert_(sesionJefa.token && sesionJefa.rol === 'JEFATURA', 'login de jefatura entrega token y rol');
  var sesionTrab = apiLogin('trab.test', '567890');
  assert_(apiSesionInfo(sesionTrab.token).usuario_id === trabCreado.usuario_id,
    'apiSesionInfo restaura la sesión');

  // El trabajador NO accede a operaciones de jefatura (validación en servidor).
  lanzo = false;
  try { apiPanelDashboard(sesionTrab.token); }
  catch (e) { lanzo = e.message.indexOf('No autorizado') !== -1; }
  assert_(lanzo, 'trabajador bloqueado del panel de jefatura');
  lanzo = false;
  try {
    apiIngresoConfirmar(sesionTrab.token,
      { items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 1 }] });
  } catch (e) { lanzo = e.message.indexOf('No autorizado') !== -1; }
  assert_(lanzo, 'trabajador no puede registrar entradas');
  lanzo = false;
  try { apiUsuariosListar(sesionTrab.token); }
  catch (e) { lanzo = e.message.indexOf('No autorizado') !== -1; }
  assert_(lanzo, 'trabajador no administra usuarios');

  // El trabajador SÍ retira, y queda como responsable del movimiento.
  var retiro = apiRetiroConfirmar(sesionTrab.token,
    { items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 1 }] });
  var detalle = movObtenerDetalle_(retiro.movimiento_id);
  assert_(detalle.cabecera.usuario_id === trabCreado.usuario_id &&
          detalle.cabecera.usuario_nombre_snapshot === 'Trabajador Test',
    'el retiro registra al usuario autenticado como responsable');

  // "Mis movimientos" filtra por el usuario de la sesión.
  var mios = apiMisMovimientos(sesionTrab.token);
  assert_(mios.length === 1 && mios[0].movimiento_id === retiro.movimiento_id,
    'apiMisMovimientos devuelve solo los movimientos propios');

  // Carga combinada del panel (rendimiento): una llamada trae dashboard e
  // inventario coherentes entre sí.
  var inicial = apiPanelInicial(sesionJefa.token);
  assert_(inicial.dashboard && inicial.inventario &&
          inicial.dashboard.total_productos === inicial.inventario.length,
    'apiPanelInicial entrega dashboard e inventario coherentes');

  // Y solo RETIROS: una ENTRADA hecha por el mismo usuario no aparece en
  // "Mis retiros recientes" (reportado por el usuario en producción).
  apiIngresoConfirmar(sesionJefa.token,
    { items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 1 }] });
  var retirosJefa = apiMisMovimientos(sesionJefa.token);
  assert_(retirosJefa.every(function (m) { return m.tipo === 'RETIRO'; }),
    'apiMisMovimientos excluye entradas y ajustes del propio usuario');

  // Token inválido rechazado.
  lanzo = false;
  try { apiSesionInfo('token-invalido'); }
  catch (e) { lanzo = e.message.indexOf('Sesión expirada') !== -1; }
  assert_(lanzo, 'token inválido rechazado');

  // Resiliencia D-025: si CacheService purga la sesión, el respaldo durable
  // en PropertiesService la restaura sin desloguear al usuario.
  CacheService.getScriptCache().remove('sesion_' + sesionJefa.token);
  var restaurada = apiSesionInfo(sesionJefa.token);
  assert_(restaurada.rol === 'JEFATURA',
    'la sesión sobrevive una purga de caché (respaldo durable)');

  // El logout elimina la sesión de ambos almacenes.
  apiLogout(sesionJefa.token);
  lanzo = false;
  try { apiSesionInfo(sesionJefa.token); }
  catch (e) { lanzo = e.message.indexOf('Sesión expirada') !== -1; }
  assert_(lanzo, 'tras logout la sesión no se restaura desde el respaldo');
  sesionJefa = apiLogin('jefa.test', '123456'); // re-login para pruebas siguientes

  // Un usuario desactivado no puede operar aunque conserve su token.
  usuarioCambiarEstado_(trabCreado.usuario_id, false);
  lanzo = false;
  try {
    apiRetiroConfirmar(sesionTrab.token,
      { items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 1 }] });
  } catch (e) { lanzo = e.message.indexOf('inactivo') !== -1; }
  assert_(lanzo, 'usuario desactivado bloqueado aunque tenga token vigente');

  // Jefatura no puede desactivarse a sí misma.
  lanzo = false;
  try { apiUsuarioCambiarEstado(sesionJefa.token, sesionJefa.usuario_id, false); }
  catch (e) { lanzo = e.message.indexOf('propia cuenta') !== -1; }
  assert_(lanzo, 'jefatura no puede desactivar su propia cuenta');

  // La función de bootstrap se bloquea cuando ya existe jefatura activa
  // (es invocable vía google.script.run por no terminar en "_").
  lanzo = false;
  try { setupCrearUsuarioJefatura('Intruso', 'intruso', '999999'); }
  catch (e) { lanzo = e.message.indexOf('Ya existe un usuario de jefatura') !== -1; }
  assert_(lanzo, 'setupCrearUsuarioJefatura solo funciona como bootstrap');

  // Lockout anti fuerza bruta (C1): tras AUTH_MAX_INTENTOS fallos, el
  // identificador queda bloqueado aunque luego se use el PIN correcto.
  usuarioCrear_({ nombre: 'Cerrojo', identificador_acceso: 'cerrojo',
    rol: 'TRABAJADOR', pin: '654321' });
  for (var k = 0; k < 5; k++) {
    try { apiLogin('cerrojo', 'malmal'); } catch (e) { /* fallo esperado */ }
  }
  var bloqueado = false;
  try { apiLogin('cerrojo', '654321'); } // PIN correcto, pero ya bloqueado
  catch (e) { bloqueado = e.message.indexOf('Demasiados intentos') !== -1; }
  assert_(bloqueado, 'C1: 5 fallos bloquean el login aunque el PIN sea correcto');
  // Limpieza del contador para no afectar otras pruebas.
  PropertiesService.getScriptProperties().deleteProperty('intentos_cerrojo');
}

/**
 * Caso 6 (§29): un retiro confirmado por error NO se borra; se registra un
 * AJUSTE compensatorio y la auditoría muestra ambos movimientos.
 */
function testCorreccionCaso6_() {
  var encontrado = catalogoBuscarPorCodigoBarras_('TEST-UNI-001');
  var productoId = encontrado.producto.producto_id;
  var stockInicial = invGetStock_(productoId);

  // Retiro "erróneo" de 30 unidades.
  var retiroErroneo = movConfirmar_({
    tipo: 'RETIRO', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'TEST-UNI-001', cantidad_empaques: 30 }]
  });
  assert_(invGetStock_(productoId) === stockInicial - 30, 'retiro erróneo descontó 30');

  // Corrección auditada: AJUSTE +30 con motivo, sin tocar el original.
  var correccion = movConfirmar_({
    tipo: 'AJUSTE', usuarioNombre: 'Test',
    observacion: 'Corrección de retiro erróneo ' + retiroErroneo.movimiento_id,
    items: [{ codigo_barras: 'TEST-UNI-001', cantidad_empaques: 30 }]
  });
  assert_(invGetStock_(productoId) === stockInicial,
    'Caso 6: el ajuste compensatorio restaura el stock');

  var original = movObtenerDetalle_(retiroErroneo.movimiento_id);
  assert_(original.cabecera.estado === 'CONFIRMADO',
    'Caso 6: el movimiento original NO se borró ni modificó');
  var traza = movTrazabilidadProducto_(productoId);
  var ids = traza.map(function (t) { return t.movimiento_id; });
  assert_(ids.indexOf(retiroErroneo.movimiento_id) !== -1 &&
          ids.indexOf(correccion.movimiento_id) !== -1,
    'Caso 6: la trazabilidad muestra el error y su corrección');
}

/**
 * Casos 7, 8, 9 y 12 (§29): flujo completo de importación de catálogo por
 * planilla — primera carga, actualización con diff, código duplicado y
 * registros ausentes que no se tocan.
 */
function testImportacionCasos_() {
  var cab = 'codigo_producto,nombre_producto,categoria,codigo_barras,' +
    'nombre_formato,tipo_empaque,unidades_por_empaque,activo\n';

  // Caso 7: primera carga con dos productos nuevos.
  var csv1 = cab +
    'IMP-001,Choco Import,Chocolates,IMP780111,Display 10,DISPLAY,10,SI\n' +
    'IMP-002,Bombon Import,Bombones,IMP780222,Caja 24,CAJA,24,SI\n';
  var prev1 = importacionPrevisualizar_(csv1, 'AGREGAR_Y_ACTUALIZAR');
  assert_(prev1.ok && prev1.resumen.NUEVO === 2 && prev1.resumen.ERROR === 0,
    'Caso 7: previsualización clasifica 2 filas nuevas sin errores');
  var res1 = importacionAplicar_(csv1, 'AGREGAR_Y_ACTUALIZAR', 'primera_carga.csv');
  assert_(res1.detalle.productosCreados === 2 && res1.detalle.formatosCreados === 2,
    'Caso 7: la importación crea productos y formatos');
  assert_(movBuscarCodigo_('IMP780111').encontrado,
    'Caso 7: el catálogo queda disponible para escanear');

  // Dar stock al producto importado para verificar Caso 8/10.
  movConfirmar_({ tipo: 'ENTRADA', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'IMP780111', cantidad_empaques: 1 }] });
  var productoImp = catalogoBuscarPorCodigoBarras_('IMP780111').producto;
  assert_(invGetStock_(productoImp.producto_id) === 10, 'stock importado = 10');

  // Caso 8: nueva planilla actualiza 10 → 12; el diff se muestra antes.
  var csv2 = cab +
    'IMP-001,Choco Import,Chocolates,IMP780111,Display 10,DISPLAY,12,SI\n';
  var prev2 = importacionPrevisualizar_(csv2, 'AGREGAR_Y_ACTUALIZAR');
  var fila = prev2.filas[0];
  var diffUnidades = fila.cambios.filter(function (c) {
    return c.campo === 'unidades_por_empaque';
  })[0];
  assert_(fila.estado === 'ACTUALIZAR' && diffUnidades &&
          diffUnidades.anterior === '10' && diffUnidades.nuevo === '12',
    'Caso 8: la previsualización muestra 10 → 12');
  importacionAplicar_(csv2, 'AGREGAR_Y_ACTUALIZAR', 'actualizacion.csv');
  assert_(movBuscarCodigo_('IMP780111').unidades_por_empaque === 12,
    'Caso 8: los movimientos nuevos usarán 12');
  assert_(invGetStock_(productoImp.producto_id) === 10,
    'Caso 8/10: el stock NO cambió por actualizar el catálogo');
  var trazaImp = movTrazabilidadProducto_(productoImp.producto_id);
  assert_(trazaImp[0].unidades_por_empaque === 10,
    'Caso 8: el movimiento histórico conserva el snapshot de 10');

  // Caso 12: IMP-002 no venía en csv2 → permanece intacto y activo.
  var ausente = movBuscarCodigo_('IMP780222');
  assert_(ausente.encontrado && ausente.unidades_por_empaque === 24,
    'Caso 12: el registro ausente de la planilla no se elimina ni desactiva');

  // Caso 9: código duplicado dentro del mismo archivo → error, no importar.
  var csv3 = cab +
    'IMP-003,Trufa Import,Chocolates,DUP780999,Display 6,DISPLAY,6,SI\n' +
    'IMP-004,Trufa Blanca,Chocolates,DUP780999,Display 8,DISPLAY,8,SI\n';
  var prev3 = importacionPrevisualizar_(csv3, 'AGREGAR_Y_ACTUALIZAR');
  assert_(prev3.resumen.ERROR === 1 && prev3.resumen.NUEVO === 1,
    'Caso 9: el duplicado queda marcado como error');
  var res3 = importacionAplicar_(csv3, 'AGREGAR_Y_ACTUALIZAR', 'duplicados.csv');
  assert_(res3.filasConError.length === 1,
    'Caso 9: la fila duplicada se omite e informa');
  assert_(!movBuscarCodigo_('DUP780999').encontrado ||
          movBuscarCodigo_('DUP780999').unidades_por_empaque === 6,
    'Caso 9: nunca quedan dos formatos activos con el mismo código');

  // Modo AGREGAR no debe actualizar existentes (§8.6).
  var csv4 = cab +
    'IMP-001,Choco Import,Chocolates,IMP780111,Display 10,DISPLAY,99,SI\n';
  var prev4 = importacionPrevisualizar_(csv4, 'AGREGAR');
  assert_(prev4.resumen.OMITIDO_POR_MODO === 1,
    'modo AGREGAR omite actualizaciones');
}

/**
 * Router HTTP (Http.gs): el frontend de GitHub Pages llama por POST/JSON.
 * Depende del usuario 'jefa.test' creado en testAuthYPermisos_.
 */
function testHttpRouter_() {
  function post(cuerpo) {
    var r = doPost({ postData: { contents: JSON.stringify(cuerpo) } });
    return JSON.parse(r.getContent());
  }

  // Login válido a través del router.
  var login = post({ fn: 'apiLogin', args: ['jefa.test', '123456'] });
  assert_(login.ok && login.data.token && login.data.rol === 'JEFATURA',
    'router: login entrega token');

  // Operación autenticada a través del router.
  var dash = post({ fn: 'apiPanelDashboard', args: [login.data.token] });
  assert_(dash.ok && dash.data.total_productos >= 1,
    'router: operación autenticada funciona');

  // Errores de negocio viajan como ok:false (nunca excepción sin formato).
  var malPin = post({ fn: 'apiLogin', args: ['jefa.test', '000000'] });
  assert_(malPin.ok === false && malPin.error.indexOf('incorrecto') !== -1,
    'router: error de negocio devuelto como ok:false');

  // Solo la whitelist es invocable: nada de funciones internas.
  var interna = post({ fn: 'dbSetConfigValue_', args: ['x', 'y'] });
  assert_(interna.ok === false && interna.error.indexOf('desconocida') !== -1,
    'router: función fuera de la whitelist rechazada');
  var setup = post({ fn: 'setupCrearUsuarioJefatura', args: ['X', 'x', '999999'] });
  assert_(setup.ok === false, 'router: funciones de setup no expuestas');

  // Petición malformada responde JSON de error, no excepción.
  var vacia = doPost({});
  assert_(JSON.parse(vacia.getContent()).ok === false,
    'router: petición vacía manejada');
  var rota = doPost({ postData: { contents: 'esto no es json' } });
  assert_(JSON.parse(rota.getContent()).ok === false,
    'router: JSON inválido manejado');
}

/**
 * Planilla real de la chocolatería (D-023): encabezados con alias
 * (Cod producto / Descripcion del producto (Nombre) / EAN / Cantidad),
 * decimales de Excel ("8.0") y derivación de formato desde las unidades.
 */
function testPlanillaRealChocolateria_() {
  var csv = 'Cod producto,Descripcion del producto (Nombre),EAN,Nombre de tienda,Cantidad\n' +
    '100355,CORNET NUXOR MILK 150G,8003340807409,Costanera Center,8.0\n' +
    '100042,LINDOR BALL HAZELNUT (12.5G) 10KG,7610400276429,Costanera Center,1.0\n';

  var prev = importacionPrevisualizar_(csv, 'AGREGAR_Y_ACTUALIZAR');
  assert_(prev.ok, 'planilla real: estructura aceptada vía alias');
  assert_(prev.resumen.NUEVO === 2 && prev.resumen.ERROR === 0,
    'planilla real: 2 filas nuevas sin errores');

  var cornet = prev.filas[0].datos;
  assert_(cornet.codigo_producto === '100355' &&
          cornet.nombre_producto === 'CORNET NUXOR MILK 150G' &&
          cornet.codigo_barras === '8003340807409',
    'planilla real: alias mapean código, nombre y EAN');
  assert_(cornet.unidades_por_empaque === '8',
    'planilla real: "8.0" de Excel normalizado a 8');
  assert_(cornet.nombre_formato === 'Caja x 8' && cornet.tipo_empaque === 'CAJA',
    'planilla real: formato derivado Caja x 8 / CAJA');

  var lindor = prev.filas[1].datos;
  assert_(lindor.nombre_formato === 'Unidad' && lindor.tipo_empaque === 'UNIDAD',
    'planilla real: cantidad 1 deriva Unidad/UNIDAD');

  var res = importacionAplicar_(csv, 'AGREGAR_Y_ACTUALIZAR', 'cruce_real.csv');
  assert_(res.detalle.productosCreados === 2 && res.detalle.formatosCreados === 2,
    'planilla real: importación aplicada');
  var buscado = movBuscarCodigo_('8003340807409');
  assert_(buscado.encontrado && buscado.unidades_por_empaque === 8,
    'planilla real: el EAN queda escaneable con 8 unidades por caja');

  // La plantilla oficial sigue funcionando igual (los alias no la rompen).
  var prevOficial = importacionPrevisualizar_(
    'codigo_producto,nombre_producto,categoria,codigo_barras,nombre_formato,' +
    'tipo_empaque,unidades_por_empaque,activo\n' +
    'OF-1,Producto Oficial,Cat,780555000111,Display 5,DISPLAY,5,SI\n',
    'AGREGAR_Y_ACTUALIZAR');
  assert_(prevOficial.ok && prevOficial.filas[0].datos.tipo_empaque === 'DISPLAY',
    'plantilla oficial: sin cambios de comportamiento');
}

/**
 * Backup.gs — solo la lógica PURA (sin tocar Drive), segura de ejecutar en
 * cualquier entorno, incluida la base real: backupEjecutar_ en sí crea
 * archivos reales en Drive y por eso NO se prueba aquí (ver run-tests.js,
 * que la ensaya contra el mock local, nunca contra Apps Script real).
 */
function testBackupLogicaPura_() {
  assert_(backupNombreArchivo_('2026-07-10') ===
    CONFIG.SPREADSHEET_NAME + ' — respaldo 2026-07-10',
    'nombre de archivo de respaldo incluye la fecha');

  var ahora = new Date('2026-07-10T12:00:00');
  var archivos = [
    { nombre: 'hoy', creadoEn: new Date('2026-07-10T03:00:00') },
    { nombre: 'ayer', creadoEn: new Date('2026-07-09T03:00:00') },
    { nombre: 'hace 15 dias', creadoEn: new Date('2026-06-25T03:00:00') },
    { nombre: 'hace 20 dias', creadoEn: new Date('2026-06-20T03:00:00') }
  ];
  var vencidos = backupVencidos_(archivos, ahora, 14);
  assert_(vencidos.length === 2, 'backupVencidos_ detecta exactamente los 2 fuera de retención');
  assert_(vencidos.every(function (v) { return v.nombre.indexOf('dias') !== -1; }),
    'backupVencidos_ solo marca lo que supera los 14 días');
  assert_(!vencidos.some(function (v) { return v.nombre === 'hoy' || v.nombre === 'ayer'; }),
    'backupVencidos_ no marca como vencido lo reciente');
}

/** Fechas: Sheets devuelve Date en celdas de fecha; deben salir en formato propio. */
function testCeldaFecha_() {
  var resultado = dbCeldaATexto_(new Date(2026, 6, 10, 11, 58, 35));
  assert_(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(resultado),
    'una celda Date se normaliza a yyyy-MM-dd HH:mm:ss (no inglés): ' + resultado);
  assert_(dbCeldaATexto_(' texto ') === 'texto', 'los textos solo se recortan');
  assert_(dbCeldaATexto_(15) === '15', 'los números pasan a texto');
}

/** Gestión de usuarios: editar y eliminar con protecciones de trazabilidad. */
function testGestionUsuarios_() {
  var temporal = usuarioCrear_({ nombre: 'Temporal Error', identificador_acceso:
    'temporal.error', rol: 'TRABAJADOR', pin: '111111' });

  // Editar nombre e identificador CONSERVANDO mayúsculas (reportado: "fran"
  // editado a "Fran" quedaba en minúsculas).
  usuarioEditar_(temporal.usuario_id,
    { nombre: 'Temporal Corregido', identificador_acceso: 'Temporal.OK' });
  var editado = dbFindById_('USUARIOS', temporal.usuario_id);
  assert_(editado.nombre === 'Temporal Corregido' &&
          editado.identificador_acceso === 'Temporal.OK',
    'usuarioEditar_ conserva las mayúsculas del identificador');

  // El login no distingue mayúsculas en el identificador.
  var sesionMayusculas = apiLogin('TEMPORAL.ok', '111111');
  assert_(sesionMayusculas.usuario_id === temporal.usuario_id,
    'el login acepta el identificador sin distinguir mayúsculas');

  // Identificador duplicado rechazado, también con mayúsculas distintas.
  var lanzo = false;
  try { usuarioEditar_(temporal.usuario_id, { identificador_acceso: 'JEFA.TEST' }); }
  catch (e) { lanzo = e.message.indexOf('Ya existe') !== -1; }
  assert_(lanzo, 'usuarioEditar_ rechaza duplicado sin distinguir mayúsculas');

  // Eliminar: el usuario temporal nunca operó → se borra físicamente.
  usuarioEliminar_(temporal.usuario_id);
  assert_(dbFindById_('USUARIOS', temporal.usuario_id) === null,
    'usuario sin movimientos se elimina físicamente');

  // Un usuario CON movimientos no puede eliminarse (trazabilidad §16).
  var trab = dbFindOne_('USUARIOS', function (u) {
    return u.identificador_acceso === 'trab.test';
  });
  lanzo = false;
  try { usuarioEliminar_(trab.usuario_id); }
  catch (e) { lanzo = e.message.indexOf('movimientos registrados') !== -1; }
  assert_(lanzo, 'usuario con movimientos no se puede eliminar; se sugiere desactivar');

  // Nadie puede eliminarse a sí mismo vía API.
  var sesion = apiLogin('jefa.test', '123456');
  lanzo = false;
  try { apiUsuarioEliminar(sesion.token, sesion.usuario_id); }
  catch (e) { lanzo = e.message.indexOf('propia cuenta') !== -1; }
  assert_(lanzo, 'apiUsuarioEliminar bloquea la autoeliminación');
}

/** Cambio de estado en lote: N productos en una sola operación. */
function testEstadoLote_() {
  var p1 = catalogoCrearProducto_({ nombre: 'LOTE Uno', codigo_producto: 'LOTE-1' });
  var p2 = catalogoCrearProducto_({ nombre: 'LOTE Dos', codigo_producto: 'LOTE-2' });
  var sesion = apiLogin('jefa.test', '123456');

  var r = apiCatalogoEstadoLote(sesion.token, [p1.producto_id, p2.producto_id], false);
  assert_(r.cambiados === 2, 'lote desactiva los 2 productos en una operación');
  assert_(dbFindById_('PRODUCTOS', p1.producto_id).activo === 'NO' &&
          dbFindById_('PRODUCTOS', p2.producto_id).activo === 'NO',
    'ambos productos quedaron inactivos');
  var enHistorial = dbFindWhere_('HISTORIAL_CATALOGO', function (h) {
    return (h.entidad_id === p1.producto_id || h.entidad_id === p2.producto_id) &&
           h.campo === 'activo';
  });
  assert_(enHistorial.length === 2, 'el historial registra cada producto del lote');

  // Reactivar: uno ya activo no cuenta como cambiado.
  apiCatalogoEstadoLote(sesion.token, [p1.producto_id], true);
  var r2 = apiCatalogoEstadoLote(sesion.token, [p1.producto_id, p2.producto_id], true);
  assert_(r2.cambiados === 1 && r2.sin_cambio === 1,
    'el lote informa cambiados vs sin cambio');
}

/**
 * Idempotencia de confirmación (C2): reenviar la misma operación con la
 * misma clave no crea un segundo movimiento ni descuenta stock de nuevo.
 */
function testIdempotencia_() {
  var producto = catalogoCrearProducto_({ nombre: 'IDEM Producto', codigo_producto: 'IDEM-1' });
  catalogoCrearFormato_({ producto_id: producto.producto_id, codigo_barras: 'IDEM-CB-1',
    nombre_formato: 'Caja', tipo_empaque: 'CAJA', unidades_por_empaque: 10 });
  // Stock inicial 100 por AJUSTE.
  movConfirmar_({ tipo: 'AJUSTE', usuarioNombre: 'Test', observacion: 'stock inicial',
    items: [{ codigo_barras: 'IDEM-CB-1', cantidad_empaques: 10 }] });
  assert_(invGetStock_(producto.producto_id) === 100, 'idem: stock inicial 100');

  var clave = 'clave-fija-de-prueba-123';
  var primero = movConfirmar_({ tipo: 'RETIRO', usuarioNombre: 'Test',
    claveIdempotencia: clave,
    items: [{ codigo_barras: 'IDEM-CB-1', cantidad_empaques: 3 }] });
  assert_(invGetStock_(producto.producto_id) === 70, 'idem: primer retiro descuenta a 70');
  assert_(!primero.reintento, 'idem: el primer envío no es reintento');

  var movimientosAntes = movListar_({ productoId: producto.producto_id }).length;

  // Reenvío con la MISMA clave (simula reintento tras corte de red).
  var segundo = movConfirmar_({ tipo: 'RETIRO', usuarioNombre: 'Test',
    claveIdempotencia: clave,
    items: [{ codigo_barras: 'IDEM-CB-1', cantidad_empaques: 3 }] });
  assert_(segundo.movimiento_id === primero.movimiento_id,
    'C2: el reintento devuelve el MISMO movimiento');
  assert_(segundo.reintento === true, 'C2: el reintento viene marcado');
  assert_(invGetStock_(producto.producto_id) === 70,
    'C2: el reintento NO vuelve a descontar stock');
  assert_(movListar_({ productoId: producto.producto_id }).length === movimientosAntes,
    'C2: el reintento no crea un segundo movimiento');
}

/**
 * Anti formula injection (A1): un nombre que empieza con "=" se escribe en
 * una celda formateada como texto, así Sheets no lo evalúa como fórmula y el
 * valor se lee de vuelta idéntico (sin recalcular ni transformar).
 */
function testFormulaInjection_() {
  var maligno = catalogoCrearProducto_({
    nombre: '=IMPORTRANGE("x","y")', codigo_producto: 'INJ-1' });
  var fila = dbFindById_('PRODUCTOS', maligno.producto_id);
  assert_(fila.nombre === '=IMPORTRANGE("x","y")',
    'A1: el nombre con "=" se guarda y lee como texto literal, sin evaluarse');
}

/**
 * A4: ajuste manual y reversa a través de la capa Api. El ajuste suma/resta
 * stock con motivo obligatorio; la reversa deshace un movimiento con las
 * cantidades opuestas, sin tocar el original.
 */
function testAjusteReversa_() {
  var sesion = apiLogin('jefa.test', '123456');
  var producto = catalogoCrearProducto_({ nombre: 'AJU Producto', codigo_producto: 'AJU-1' });
  catalogoCrearFormato_({ producto_id: producto.producto_id, codigo_barras: 'AJU-CB-1',
    nombre_formato: 'Caja', tipo_empaque: 'CAJA', unidades_por_empaque: 12 });

  // Ajuste +5 cajas = +60 unidades.
  apiAjusteConfirmar(sesion.token, { tipo: 'AJUSTE', observacion: 'conteo inicial',
    claveIdempotencia: 'aju-1', items: [{ codigo_barras: 'AJU-CB-1', cantidad_empaques: 5 }] });
  assert_(invGetStock_(producto.producto_id) === 60, 'A4: ajuste +5 cajas → 60 unidades');

  // El motivo es obligatorio.
  var sinMotivo = false;
  try {
    apiAjusteConfirmar(sesion.token, { tipo: 'AJUSTE', observacion: '',
      items: [{ codigo_barras: 'AJU-CB-1', cantidad_empaques: 1 }] });
  } catch (e) { sinMotivo = e.message.indexOf('motivo') !== -1; }
  assert_(sinMotivo, 'A4: el ajuste exige motivo');

  // Reversa de un retiro: retirar 2 cajas (−24), luego revertir SUMANDO 24.
  // El panel calcula la cantidad opuesta a las unidades guardadas; como el
  // retiro guarda −24, la reversa envía +2 cajas (delta +24).
  var retiro = movConfirmar_({ tipo: 'RETIRO', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'AJU-CB-1', cantidad_empaques: 2 }] });
  assert_(invGetStock_(producto.producto_id) === 36, 'A4: retiro deja 36');
  apiAjusteConfirmar(sesion.token, { tipo: 'REVERSA',
    observacion: 'Reversa de ' + retiro.movimiento_id,
    claveIdempotencia: 'rev-1',
    items: [{ codigo_barras: 'AJU-CB-1', cantidad_empaques: 2 }] });
  assert_(invGetStock_(producto.producto_id) === 60,
    'A4: la reversa devuelve el stock a 60 sin tocar el retiro original');
  assert_(movObtenerDetalle_(retiro.movimiento_id).cabecera.estado === 'CONFIRMADO',
    'A4: el movimiento original permanece intacto');
}

/** A6: movListar_ respeta el límite (no devuelve todo el historial). */
function testMovLimite_() {
  var producto = catalogoCrearProducto_({ nombre: 'LIM Producto', codigo_producto: 'LIM-1' });
  catalogoCrearFormato_({ producto_id: producto.producto_id, codigo_barras: 'LIM-CB-1',
    nombre_formato: 'U', tipo_empaque: 'UNIDAD', unidades_por_empaque: 1 });
  for (var i = 0; i < 6; i++) {
    movConfirmar_({ tipo: 'ENTRADA', usuarioNombre: 'Test',
      items: [{ codigo_barras: 'LIM-CB-1', cantidad_empaques: 1 }] });
  }
  var acotado = movListar_({ productoId: producto.producto_id, limite: 3 });
  assert_(acotado.length === 3, 'A6: movListar_ respeta el límite explícito');
  var todos = movListar_({ productoId: producto.producto_id });
  assert_(todos.length === 6, 'A6: sin límite explícito trae los 6 (bajo el tope de 200)');
}

/**
 * M3: movPendientesAntiguos_ detecta cabeceras EN_PROCESO viejas (fallo
 * parcial) y no confunde a las CONFIRMADAS.
 */
function testPendientesAntiguos_() {
  // Cabecera EN_PROCESO simulada con fecha antigua, escrita directo.
  dbAppendRow_('MOVIMIENTOS', {
    movimiento_id: 'MOV-HUERFANO-1', tipo: 'RETIRO', estado: 'EN_PROCESO',
    usuario_id: 'USR-X', usuario_nombre_snapshot: 'X', fecha_hora: '2000-01-01 00:00:00',
    origen: 'BODEGA', destino: 'TIENDA', observacion: '', total_formatos: 0,
    total_empaques: 0, total_unidades: 0, clave_idempotencia: '' });
  var pendientes = movPendientesAntiguos_(10);
  var ids = pendientes.map(function (m) { return m.movimiento_id; });
  assert_(ids.indexOf('MOV-HUERFANO-1') !== -1,
    'M3: detecta el EN_PROCESO antiguo');
  assert_(pendientes.every(function (m) { return m.estado === 'EN_PROCESO'; }),
    'M3: solo reporta EN_PROCESO, nunca CONFIRMADO');
}

/**
 * Eliminar catálogo: solo procede sin stock ni movimientos; si los tiene,
 * bloquea (nunca borra historial). El borrado de un producto elimina en
 * cascada sus formatos (seguro: sin movimientos por producto_id, tampoco
 * puede haberlos por formato_id — misma fila de detalle).
 */
function testEliminarCatalogo_() {
  // Caso 1: formato sin movimientos se elimina sin problema.
  var libre = catalogoCrearProducto_({ nombre: 'ELIM Libre', codigo_producto: 'ELIM-1' });
  var formatoLibre = catalogoCrearFormato_({ producto_id: libre.producto_id,
    codigo_barras: 'ELIM-CB-1', nombre_formato: 'Caja', tipo_empaque: 'CAJA',
    unidades_por_empaque: 6 });
  var rf = catalogoEliminarFormato_(formatoLibre.formato_id);
  assert_(rf.eliminado === true, 'elimina formato sin movimientos');
  assert_(!dbFindById_('FORMATOS_EMPAQUE', formatoLibre.formato_id),
    'el formato ya no existe en la hoja');

  // Caso 2: producto sin formatos, stock ni movimientos se elimina completo.
  var r2 = catalogoEliminarProducto_(libre.producto_id);
  assert_(r2.eliminado === true && r2.formatos_eliminados === 0,
    'elimina producto sin formatos restantes');
  assert_(!dbFindById_('PRODUCTOS', libre.producto_id), 'el producto ya no existe');

  // Caso 3: producto CON movimientos (y stock) no puede eliminarse.
  var usado = catalogoCrearProducto_({ nombre: 'ELIM Usado', codigo_producto: 'ELIM-2' });
  catalogoCrearFormato_({ producto_id: usado.producto_id, codigo_barras: 'ELIM-CB-2',
    nombre_formato: 'Caja', tipo_empaque: 'CAJA', unidades_por_empaque: 10 });
  movConfirmar_({ tipo: 'AJUSTE', usuarioNombre: 'Test', observacion: 'stock inicial',
    items: [{ codigo_barras: 'ELIM-CB-2', cantidad_empaques: 2 }] });
  var bloqueadoPorStock = false;
  try { catalogoEliminarProducto_(usado.producto_id); }
  catch (e) { bloqueadoPorStock = /stock/.test(e.message); }
  assert_(bloqueadoPorStock, 'bloquea eliminar producto con stock');
  assert_(dbFindById_('PRODUCTOS', usado.producto_id), 'el producto sigue existiendo');

  // Retirar todo el stock: ahora bloquea por MOVIMIENTOS (no por stock).
  movConfirmar_({ tipo: 'RETIRO', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'ELIM-CB-2', cantidad_empaques: 2 }] });
  assert_(invGetStock_(usado.producto_id) === 0, 'stock en 0 tras retirar todo');
  var bloqueadoPorMovimientos = false;
  try { catalogoEliminarProducto_(usado.producto_id); }
  catch (e) { bloqueadoPorMovimientos = /movimientos históricos/.test(e.message); }
  assert_(bloqueadoPorMovimientos, 'bloquea eliminar producto con movimientos históricos');

  // El mismo formato usado tampoco puede eliminarse solo.
  var formatoUsado = dbFindOne_('FORMATOS_EMPAQUE', function (f) {
    return f.codigo_barras === 'ELIM-CB-2';
  });
  var bloqueadoFormato = false;
  try { catalogoEliminarFormato_(formatoUsado.formato_id); }
  catch (e) { bloqueadoFormato = /movimientos históricos/.test(e.message); }
  assert_(bloqueadoFormato, 'bloquea eliminar formato con movimientos históricos');

  // Caso 4: producto con formato (sin movimientos) elimina ambos en cascada.
  var conFormato = catalogoCrearProducto_({ nombre: 'ELIM Cascada', codigo_producto: 'ELIM-3' });
  var formatoCascada = catalogoCrearFormato_({ producto_id: conFormato.producto_id,
    codigo_barras: 'ELIM-CB-3', nombre_formato: 'Display', tipo_empaque: 'DISPLAY',
    unidades_por_empaque: 4 });
  var r4 = catalogoEliminarProducto_(conFormato.producto_id);
  assert_(r4.formatos_eliminados === 1, 'elimina el producto y su único formato en cascada');
  assert_(!dbFindById_('FORMATOS_EMPAQUE', formatoCascada.formato_id),
    'el formato en cascada ya no existe');

  // Caso 5: lote informa eliminados vs bloqueados, cada uno con su motivo.
  var loteA = catalogoCrearProducto_({ nombre: 'ELIM Lote A', codigo_producto: 'ELIM-4' });
  var rLote = catalogoEliminarLoteProductos_([loteA.producto_id, usado.producto_id]);
  assert_(rLote.eliminados === 1, 'lote elimina el que sí se puede');
  assert_(rLote.bloqueados.length === 1 && rLote.bloqueados[0].producto_id === usado.producto_id,
    'lote informa el bloqueado con su motivo');
}

/** Integración: requiere setupDatabase() ejecutado. Se omite si no lo está. */
function testIdGenerationIntegration_() {
  try {
    dbGetSpreadsheet_();
  } catch (e) {
    Logger.log('testIdGenerationIntegration_ omitido: base de datos no configurada.');
    return;
  }
  var a = idNext_('PRODUCTO');
  var b = idNext_('PRODUCTO');
  assert_(/^PROD-\d{4,}$/.test(a), 'formato de ID de producto: ' + a);
  assert_(a !== b, 'IDs consecutivos distintos');
  var lote = idNextBatch_('DETALLE', 3);
  assert_(lote.length === 3 && lote[0] !== lote[2], 'lote de IDs consecutivos');
}
