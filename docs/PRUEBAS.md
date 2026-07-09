# Plan de pruebas — Fase 8 (Calidad)

## 1. Cobertura automatizada

`npm run check` ejecuta lint + sintaxis + 14 pruebas contra una simulación en
memoria de Google Sheets. En el editor de Apps Script, las mismas pruebas
corren con `runFoundationTests()` y `runMovimientoTests()` (esta última exige
`entorno=TEST` en la hoja Configuracion para no escribir en la base real).

| Caso obligatorio (§29) | Prueba | Estado |
|---|---|---|
| 1 — Entrada suma (100 + 2×15 = 130) | `testMovimientosCasos_` | ✅ Automatizado |
| 2 — Retiro resta (130 − 2×15 = 100) | `testMovimientosCasos_` | ✅ Automatizado |
| 3 — Stock insuficiente: no confirma, no modifica, informa | `testMovimientosCasos_` | ✅ Automatizado |
| 4 — Retiros simultáneos (100 − 30 − 20 = 50) | Diseño: LockService + relectura | ⚠️ Manual (ver 2.4) |
| 5 — Formato 15→18: históricos conservan 15 | `testMovimientosCasos_` | ✅ Automatizado |
| 6 — Error confirmado: no borrar, corregir con ajuste | `testCorreccionCaso6_` | ✅ Automatizado |
| 7 — Primera carga del catálogo | `testImportacionCasos_` | ✅ Automatizado |
| 8 — Actualización por planilla (15→18, diff, snapshots) | `testImportacionCasos_` | ✅ Automatizado |
| 9 — Código duplicado en archivo: no importar, mostrar conflicto | `testImportacionCasos_` | ✅ Automatizado |
| 10 — Cambio de formato con stock: stock e historial intactos | `testMovimientosCasos_` + `testImportacionCasos_` | ✅ Automatizado |
| 11 — Ceros iniciales (`001234567890` exacto) | `testBarcodePreservesLeadingZeros_` + `testParseCsv_` | ✅ Automatizado |
| 12 — Registro ausente en nueva planilla: sin cambios | `testImportacionCasos_` | ✅ Automatizado |

Además: matriz de permisos (§12.4) en `testAuthYPermisos_` — trabajador
bloqueado de panel/entradas/usuarios, responsable tomado de la sesión,
token inválido y usuario desactivado rechazados.

## 2. Checklist manual (requiere dispositivos reales)

Ejecutar tras desplegar la web app (README → Puesta en marcha). Marcar cada
ítem al completarlo.

### 2.1 Despliegue y arranque
- [ ] `clasp push` (o copia manual) sin errores en el editor de Apps Script.
- [ ] `setupDatabase()` crea el archivo en Drive con las 9 hojas y encabezados.
- [ ] `setupCrearUsuarioJefatura(...)` crea el primer usuario administrador.
- [ ] `runFoundationTests()` pasa en el editor.
- [ ] La URL de la web app muestra la página de estado con los 4 enlaces.
- [ ] Login funciona; PIN incorrecto muestra "Usuario o PIN incorrecto".

### 2.2 Pistola escaneadora (PC, `?page=ingreso`)
- [ ] La pistola en modo HID escribe el código y el Enter lo procesa.
- [ ] El foco vuelve solo al campo tras cada lectura (escaneo continuo sin mouse).
- [ ] Escanear 5 veces la misma caja acumula 5 empaques (sin duplicados fantasma).
- [ ] Código inexistente → "Código no registrado" con enlace al catálogo.
- [ ] Confirmar ingreso aumenta el stock y aparece en Movimientos del panel.
- [ ] Cerrar la pestaña con carro a medias y reabrir → el borrador se restaura.

### 2.3 Cámara Android (celular, `?page=retiro`)
- [ ] Chrome pide permiso de cámara y la vista previa abre con cámara trasera.
      Si no abre dentro del marco de Apps Script, abrir la URL directa en
      Chrome (D-018) y anotar el resultado.
- [ ] Escanear un display real: flash verde + vibración + producto detectado
      con stock disponible.
- [ ] La misma etiqueta no se registra dos veces por un solo escaneo (debounce).
- [ ] Código inexistente → "Producto no registrado, avisa a jefatura" (sin crear).
- [ ] Confirmar retiro descuenta stock; "Mis retiros" muestra el movimiento.
- [ ] Retiro con stock insuficiente → error claro y el carro se conserva.
- [ ] Probar en el celular Android más antiguo disponible (fallback ZXing).

### 2.4 Concurrencia — Caso 4 (§29), dos dispositivos
1. Dejar un producto con stock exactamente 100.
2. En el teléfono A armar un retiro de 30; en el teléfono B uno de 20.
3. Confirmar ambos con la menor diferencia de tiempo posible (dos personas).
- [ ] Stock final = 50 exacto (nunca 70 ni 80).
- [ ] Existen DOS movimientos confirmados con stock_anterior/posterior coherentes
      y encadenados (100→70→50 o 100→80→50).

### 2.5 Roles y sesión
- [ ] Con cuenta TRABAJADOR, abrir `?page=panel` → pantalla de login exige
      rol JEFATURA (y aunque se manipule el cliente, el servidor rechaza).
- [ ] Desactivar un trabajador desde el panel → su sesión activa deja de operar.
- [ ] Tras 6+ horas, la sesión expira y pide PIN nuevamente.

### 2.6 Importación con planilla real
- [ ] Descargar plantilla, abrirla en Excel es-CL, guardar como CSV (con `;`)
      y reimportar → el delimitador se detecta solo.
- [ ] Un código con ceros iniciales sobrevive el viaje Excel → CSV → sistema
      (escribir la celda como texto en Excel).
- [ ] Exportar catálogo, editar una celda y reimportar → el diff aparece en
      la previsualización.

## 3. Criterios de aceptación del MVP (§30)

Todos los criterios de software están implementados y con prueba automatizada
o ítem manual arriba. Los tres que solo se validan con hardware real:
reconocimiento con pistola física (2.2), escaneo con cámara física (2.3) y
concurrencia entre dispositivos (2.4).
