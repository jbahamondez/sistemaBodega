# Decisiones técnicas

Registro de decisiones tomadas durante la implementación, con su
justificación. Las reglas de negocio provienen del prompt maestro y del PDF
funcional; aquí solo se documenta cómo se resolvieron ambigüedades menores.

## D-001 — Zona horaria: `America/Santiago`

Los ejemplos del documento usan formato de fecha chileno y el proyecto opera
en una sola bodega física. Toda marca de tiempo se genera en el servidor con
`utilNow()` usando esta zona, nunca con la hora del dispositivo cliente.

## D-002 — IDs legibles y secuenciales (`PROD-0001`, `MOV-000001`)

El PDF muestra identificadores del estilo `I-0048` / `R-0124`. Se usan
prefijos por entidad + contador secuencial almacenado en la hoja
`Configuracion`, incrementado bajo `LockService` (`Ids.gs`). Ventajas frente a
UUID: legibles en auditoría, ordenables y fáciles de citar verbalmente.
El padding es solo estético: al superarlo, el número sigue creciendo sin
colisiones.

## D-003 — Booleanos como `SI` / `NO` en las hojas

Jefatura revisará las hojas visualmente (solo lectura). `SI`/`NO` es más claro
que `TRUE`/`FALSE` para usuarios no técnicos. La conversión a boolean vive en
`utilToBool` / `utilBoolToSheet`.

## D-004 — Columnas de códigos formateadas como texto (`@`)

Requisito explícito (prompt §8.5, Caso 11): conservar ceros iniciales y
evitar notación científica. `Setup.gs` aplica formato de texto plano a todas
las columnas listadas en `textColumns` de cada hoja, y `Db.gs` lee siempre
con normalización a string.

## D-005 — Estado `EN_PROCESO` → `CONFIRMADO` en movimientos

Google Sheets no ofrece transacciones reales. Para aproximar la confirmación
atómica (PDF §12.1), el orden de escritura será: cabecera en estado
`EN_PROCESO` → detalles → actualización de inventario → cabecera a
`CONFIRMADO`. Un fallo intermedio deja un movimiento `EN_PROCESO` detectable
que no cuenta como confirmado, en lugar de corromper stock silenciosamente.
(Se implementa en Fases 3–5; el enum queda definido desde la Fase 1.)

## D-006 — Hoja `Inventario` sin columna `ubicacion`

El PDF (§9.1) menciona stock por producto y ubicación; el prompt maestro
(§18, prioridad 1) define `Inventario` solo con `producto_id`,
`stock_unidades`, `updated_at`, `updated_by`, y el MVP controla una única
bodega. Se sigue el prompt. Si en Etapa 3 se agregan ubicaciones, la capa
`Db.gs` permite extender el esquema sin reescribir la lógica.

## D-007 — PIN con hash SHA-256 + salt por usuario

El prompt exige no guardar PIN en texto plano. Apps Script no incluye bcrypt
nativo y las alternativas gratuitas implicarían dependencias externas; se usa
`Utilities.computeDigest` (SHA-256) con salt aleatorio por usuario
(`utilHashPin`), con comparación en tiempo constante. Adecuado para el nivel
de riesgo del MVP (PINs de acceso operativo, no credenciales financieras).

## D-008 — Columnas `pin_hash` y `pin_salt` en `Usuarios`

El prompt define los campos mínimos de `Usuarios` y aparte exige hash+salt si
se usa PIN. Se agregan ambas columnas al esquema desde el inicio para no
migrar la hoja después.

## D-009 — Acceso web `ANYONE_ANONYMOUS` + autenticación propia

Los trabajadores usarán celulares personales posiblemente sin sesión de
Google de la empresa. La web app se publica accesible por URL y la identidad
se controla con el login propio del sistema (identificador + PIN, validado en
servidor en cada operación — Fase 7). Alternativa descartada: exigir cuentas
Google por usuario, que complica el onboarding sin aportar al MVP.

## D-010 — `setupDatabase()` idempotente y no destructivo

La inicialización crea solo lo que falta y **falla explícitamente** si una
hoja existente tiene encabezados que no coinciden con el esquema, en lugar de
"repararla" automáticamente. Nunca borra datos (prompt §27: no sobrescribir
una app estable).

## D-011 — Usuario placeholder `PENDIENTE-AUTH` hasta Fase 7

La autenticación llega en la Fase 7 (según orden del prompt §28). Mientras
tanto, las operaciones del catálogo registran `PENDIENTE-AUTH` como usuario
responsable: el dato es honesto (indica que no había login) y no bloquea el
desarrollo de fases previas. Las firmas ya aceptan `usuarioId`, por lo que
integrar la sesión real no requerirá cambiar la lógica.

## D-012 — CSV con delimitador autodetectado y BOM

Excel en español (es-CL) exporta CSV con punto y coma; otras fuentes usan
coma. `utilParseCsv` detecta el delimitador por frecuencia en la primera
línea, respeta comillas dobles y elimina el BOM. `utilToCsv` genera con coma,
CRLF y BOM inicial para que Excel abra acentos correctamente. Los códigos de
barras viajan siempre como texto (Caso 11: `001234567890` se preserva).

## D-013 — Identidad de registros en la importación

Según §8.7: los **formatos** se identifican por `codigo_barras` (clave
principal de matching). Los **productos** se identifican por
`codigo_producto` cuando existe y, como fallback, por nombre normalizado
(minúsculas, sin espacios en los bordes). El fallback por nombre es
inevitable mientras la planilla no traiga códigos de producto; por eso la
plantilla y las instrucciones recomiendan usar `codigo_producto`.

## D-014 — Mapeo de planilla concentrado en `CONFIG.IMPORT_PLANILLA`

La planilla definitiva de la chocolatería aún no existe (confirmado por el
usuario, 2026-07-09). Todo lo que la importación sabe de la estructura de la
planilla (encabezados, obligatoriedad, filas de ejemplo de la plantilla) vive
en `CONFIG.IMPORT_PLANILLA`. Cuando la planilla real se defina, el ajuste es
solo de configuración. El parser además tolera columnas extra y en cualquier
orden, para que un catálogo exportado y editado sea reimportable.

## D-015 — Pruebas ejecutables local y remotamente

`SelfTest.gs` corre en el editor de Apps Script (`runFoundationTests()`) y
también localmente con `npm test`: `scripts/run-tests.js` carga todos los
`.gs` en un contexto V8 compartido (igual que Apps Script) con mocks mínimos
de `Utilities`, `PropertiesService`, `LockService` y `Logger`. Las pruebas de
integración que requieren la BD real se omiten solas fuera de Apps Script.

## D-016 — Toda variación de stock pasa por `movConfirmar`

`Movimientos.gs` expone un único camino transaccional para ENTRADA, RETIRO,
AJUSTE y REVERSA: bloqueo → releer catálogo y stock vigentes → validar el
movimiento completo (si un ítem falla, no se escribe nada) → cabecera
`EN_PROCESO` → detalles con snapshots y stock anterior/posterior →
inventario → cabecera `CONFIRMADO`. `invActualizarStock_` es interna y solo
se invoca dentro de esa transacción. AJUSTE y REVERSA aceptan cantidades
negativas (correcciones en ambos sentidos, §17); ENTRADA y RETIRO solo
positivas.

## D-017 — Pruebas de movimientos protegidas con `entorno=TEST`

`runMovimientoTests()` escribe datos de prueba, así que se niega a correr
salvo que la hoja Configuracion tenga `entorno=TEST`. El runner local usa
una simulación en memoria de Sheets (clases MockSheet/MockSpreadsheet en
`scripts/run-tests.js`) y activa la clave automáticamente; contra la BD real
habría que fijarla a propósito. La concurrencia real (Caso 4) no es
simulable localmente: el diseño la cubre con `LockService` + relectura bajo
bloqueo, y debe verificarse manualmente en la Fase 8 con dos dispositivos.

## D-018 — Escaneo con cámara en tres niveles

El prompt (§12) pide ZXing "o una alternativa técnicamente equivalente".
Se implementó en cascada: (1) `BarcodeDetector`, API nativa de Chrome
Android — sin dependencias, más rápida; (2) si no existe, ZXing open source
cargado desde CDN gratuito (jsDelivr) solo en ese momento; (3) entrada
manual del código siempre disponible (cámara dañada, sin permiso, código
ilegible). Riesgo conocido: `getUserMedia` puede fallar dentro del iframe de
Apps Script en algunos navegadores; el mitigador es abrir la URL de la app
directamente en Chrome. Verificación real en dispositivo: Fase 8.

## D-019 — "Mis retiros" locales al dispositivo hasta la Fase 7

Sin autenticación aún no se puede filtrar movimientos por usuario en el
servidor. La pantalla del trabajador guarda los retiros confirmados desde
ese teléfono en localStorage (máx. 20) y los muestra como "Mis retiros
recientes (este teléfono)" — el texto es honesto sobre el alcance. En la
Fase 7 se reemplaza por el filtro por usuario autenticado (movListar ya lo
soporta).
