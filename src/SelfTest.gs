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
  var csv = importacionPlantillaCsv();
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
  if (dbGetConfigValue('entorno') !== 'TEST') {
    throw new Error(
      'runMovimientoTests escribe datos de prueba. Solo se ejecuta si la ' +
      'hoja Configuracion tiene la clave "entorno" con valor "TEST" ' +
      '(usar una base de datos de prueba, nunca la real).');
  }

  var resultados = [];
  var tests = [testMovimientosCasos_];
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
  var producto = catalogoCrearProducto({
    nombre: 'TEST Chocolate Bitter', codigo_producto: 'TEST-001',
    categoria: 'Test'
  });
  catalogoCrearFormato({
    producto_id: producto.producto_id, codigo_barras: 'TEST-UNI-001',
    nombre_formato: 'Unidad', tipo_empaque: 'UNIDAD', unidades_por_empaque: 1
  });
  var display = catalogoCrearFormato({
    producto_id: producto.producto_id, codigo_barras: 'TEST-DSP-001',
    nombre_formato: 'Display 15', tipo_empaque: 'DISPLAY', unidades_por_empaque: 15
  });

  // Stock inicial 100 mediante AJUSTE (todo cambio de stock es un movimiento).
  movConfirmar({
    tipo: 'AJUSTE', usuarioNombre: 'Test', observacion: 'stock inicial de prueba',
    items: [{ codigo_barras: 'TEST-UNI-001', cantidad_empaques: 100 }]
  });
  assert_(invGetStock(producto.producto_id) === 100, 'stock inicial 100');

  // Caso 1: ENTRADA de 2 displays × 15 sobre 100 → 130.
  var entrada = movConfirmar({
    tipo: 'ENTRADA', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 2 }]
  });
  assert_(invGetStock(producto.producto_id) === 130, 'Caso 1: 100 + 30 = 130');
  var detalleEntrada = movObtenerDetalle(entrada.movimiento_id);
  assert_(detalleEntrada.cabecera.estado === 'CONFIRMADO', 'entrada CONFIRMADA');
  assert_(utilToInt(detalleEntrada.detalles[0].stock_anterior) === 100 &&
          utilToInt(detalleEntrada.detalles[0].stock_posterior) === 130,
    'detalle registra stock anterior 100 y posterior 130');

  // Caso 2: RETIRO de 2 displays × 15 sobre 130 → 100.
  movConfirmar({
    tipo: 'RETIRO', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 2 }]
  });
  assert_(invGetStock(producto.producto_id) === 100, 'Caso 2: 130 - 30 = 100');

  // Caso 3: RETIRO de 8 displays (120) sobre 100 → rechazado, nada cambia.
  var movimientosAntes = movListar({}).length;
  var lanzo = false;
  try {
    movConfirmar({
      tipo: 'RETIRO', usuarioNombre: 'Test',
      items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 8 }]
    });
  } catch (e) {
    lanzo = true;
    assert_(e.message.indexOf('Stock insuficiente') !== -1,
      'Caso 3: error informa stock insuficiente');
  }
  assert_(lanzo, 'Caso 3: el retiro excedido lanza error');
  assert_(invGetStock(producto.producto_id) === 100, 'Caso 3: stock intacto en 100');
  assert_(movListar({}).length === movimientosAntes,
    'Caso 3: no se registró ningún movimiento confirmado');

  // Atomicidad multi-ítem: si un ítem del carro no tiene stock, no se aplica nada.
  lanzo = false;
  try {
    movConfirmar({
      tipo: 'RETIRO', usuarioNombre: 'Test',
      items: [
        { codigo_barras: 'TEST-UNI-001', cantidad_empaques: 10 },
        { codigo_barras: 'TEST-DSP-001', cantidad_empaques: 99 }
      ]
    });
  } catch (e) { lanzo = true; }
  assert_(lanzo && invGetStock(producto.producto_id) === 100,
    'carro con un ítem sin stock: no se confirma parcialmente');

  // Caso 5: cambiar el formato 15 → 18 no toca stock ni históricos.
  catalogoEditarFormato(display.formato_id, { unidades_por_empaque: 18 });
  assert_(invGetStock(producto.producto_id) === 100,
    'Caso 5/10: editar el catálogo no recalcula stock');
  var historicos = movTrazabilidadProducto(producto.producto_id);
  var conDisplay = historicos.filter(function (h) { return h.formato === 'Display 15'; });
  assert_(conDisplay.length > 0 && conDisplay.every(function (h) {
    return h.unidades_por_empaque === 15;
  }), 'Caso 5: los movimientos históricos conservan el snapshot de 15');

  // Y un movimiento nuevo usa la equivalencia vigente (18).
  movConfirmar({
    tipo: 'ENTRADA', usuarioNombre: 'Test',
    items: [{ codigo_barras: 'TEST-DSP-001', cantidad_empaques: 1 }]
  });
  assert_(invGetStock(producto.producto_id) === 118,
    'Caso 5: el movimiento nuevo usa 18 unidades por display (100 + 18)');

  // Lookup de escaneo: devuelve producto, formato vigente y stock actual.
  var lookup = movBuscarCodigo('TEST-DSP-001');
  assert_(lookup.encontrado && lookup.producto_nombre === 'TEST Chocolate Bitter' &&
          lookup.unidades_por_empaque === 18 && lookup.stock_unidades === 118,
    'movBuscarCodigo entrega formato vigente (18) y stock actual (118)');
  assert_(movBuscarCodigo('NO-EXISTE-999').encontrado === false,
    'movBuscarCodigo indica código no registrado');

  // Panel: dashboard agrega totales y el filtro por producto funciona.
  var dash = panelDashboard();
  assert_(dash.total_productos >= 1 && dash.stock_total_unidades >= 118,
    'dashboard suma productos y unidades');
  assert_(dash.ultimos_movimientos.length > 0 &&
          dash.ultimos_movimientos[0].estado === 'CONFIRMADO',
    'dashboard lista últimos movimientos confirmados');
  var movsProducto = movListar({ productoId: producto.producto_id });
  assert_(movsProducto.length >= 4, 'movListar filtra por producto');
  assert_(movListar({ productoId: 'PROD-INEXISTENTE' }).length === 0,
    'movListar con producto inexistente devuelve vacío');
  var traz = movTrazabilidadProducto(producto.producto_id);
  assert_(traz[traz.length - 1].stock_posterior === 118,
    'la trazabilidad reconstruye el stock final (118)');

  // Código no registrado se rechaza con mensaje claro (§22).
  lanzo = false;
  try {
    movConfirmar({ tipo: 'RETIRO', usuarioNombre: 'Test',
      items: [{ codigo_barras: 'NO-EXISTE-999', cantidad_empaques: 1 }] });
  } catch (e) {
    lanzo = e.message.indexOf('Código no registrado') !== -1;
  }
  assert_(lanzo, 'código desconocido rechazado con mensaje claro');
}

/** Integración: requiere setupDatabase() ejecutado. Se omite si no lo está. */
function testIdGenerationIntegration_() {
  try {
    dbGetSpreadsheet();
  } catch (e) {
    Logger.log('testIdGenerationIntegration_ omitido: base de datos no configurada.');
    return;
  }
  var a = idNext('PRODUCTO');
  var b = idNext('PRODUCTO');
  assert_(/^PROD-\d{4,}$/.test(a), 'formato de ID de producto: ' + a);
  assert_(a !== b, 'IDs consecutivos distintos');
  var lote = idNextBatch('DETALLE', 3);
  assert_(lote.length === 3 && lote[0] !== lote[2], 'lote de IDs consecutivos');
}
