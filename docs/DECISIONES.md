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

## D-020 — Autorización real: sufijo `_` + capa Api.gs con token

`google.script.run` puede invocar CUALQUIER función global del proyecto, así
que ocultar botones no protege nada (§24). Apps Script no permite invocar
desde el cliente funciones cuyo nombre termina en `_`: por eso TODA la
lógica de negocio y el acceso a datos usan ese sufijo, y la única superficie
pública es `Api.gs`, donde cada función valida el token de sesión y el rol
en el servidor antes de operar. Las sesiones viven en CacheService (6 h,
su TTL máximo); expirada la caché, el usuario vuelve a ingresar su PIN. El
responsable de cada movimiento es SIEMPRE el usuario de la sesión validada,
nunca un dato enviado por el cliente.

## D-021 — Reglas defensivas en administración de usuarios

Jefatura no puede desactivar su propia cuenta ni cambiar su propio rol (se
evita dejar el sistema sin administradores por accidente). Los usuarios se
desactivan, nunca se eliminan, y el login responde "Usuario o PIN
incorrecto" sin revelar si el identificador existe.

## D-022 — Frontend en GitHub Pages + Apps Script como API JSON

Confirmado en dispositivo real (2026-07-09): la cámara Android no abre
dentro del iframe sandbox con que Apps Script sirve sus páginas (riesgo
anticipado en D-018). Solución: el frontend completo (carpeta `web/`) se
publica en GitHub Pages como páginas de primer nivel — ahí `getUserMedia`
funciona — y Apps Script queda solo como API JSON (`Http.gs`): POST al
/exec con Content-Type `text/plain` (petición "simple", sin preflight CORS,
que Apps Script no atiende) y body `{fn, args}`. Solo la whitelist de
`httpFunciones_()` es invocable, que es exactamente la superficie de
`Api.gs` con su validación de token y rol. `web/comun.js` reimplementa la
interfaz `Sesion` sobre fetch, por lo que la lógica de las páginas no
cambió. La URL de la API vive únicamente en `web/config.js`; el backend se
actualiza con `clasp push` + `clasp update-deployment <id>` para conservar
la misma URL.

## D-023 — Adaptación a la planilla real "Cruce_Productos_SKU_Final_con_EAN"

La planilla definitiva llegó el 2026-07-09 con columnas: Cod producto,
Descripcion del producto (Nombre), EAN, Nombre de tienda, Cantidad. Decisiones
confirmadas con el usuario: "Cantidad" son las unidades por empaque (múltiplo
IC); "Nombre de tienda" se ignora (el MVP controla una sola bodega); y el
formato se deriva automáticamente cuando la planilla no lo trae (1 → "Unidad"
tipo UNIDAD; N>1 → "Caja x N" tipo CAJA). Implementación: `aliases` por
columna en CONFIG.IMPORT_PLANILLA (la lógica de importación no cambió),
normalización de decimales de Excel ("8.0" → 8) y derivación solo cuando los
campos vienen vacíos — la plantilla oficial sigue funcionando igual.
Herramientas nuevas: scripts/leer-xlsx.ps1 (leer Excel sin Excel instalado) y
scripts/previsualizar-csv.js (ensayo de importación con el motor real sobre
base simulada). El ensayo con los 128 productos reales dio 0 errores.

## D-024 — Importación masiva reescrita en lotes (bug real detectado en producción)

Al importar la planilla real de 128 productos, la página quedó "colgada": la
importación original hacía una llamada de red separada a Sheets/LockService
por cada micro-operación (buscar duplicados, generar ID bajo bloqueo,
escribir la fila, escribir su historial) DENTRO de un bucle por fila —
llamando a `catalogoCrearProducto_`/`catalogoCrearFormato_`/`histRegistrar_`
una vez por cada producto y formato. Para 128 filas esto generaba más de
2.000 llamadas secuenciales, con riesgo real de superar el límite de
ejecución de Apps Script (6 min) y dejar el import a medio terminar.

Se reescribió `importacionAplicar_` (ahora delega en
`importacionAplicarEnLote_`) para operar en memoria y escribir en lotes:
todos los IDs necesarios se generan de una vez con `idNextBatch_`, las filas
nuevas se agregan con un único `dbAppendRows_` por hoja, y las
actualizaciones se aplican reescribiendo la hoja completa en memoria y
subiéndola con una sola llamada (`dbWriteAllRows_`, nuevo helper en
`Db.gs`). Medido con `scripts/medir-import.js` sobre la planilla real: **16
llamadas a Sheets y 5 candados para 128 productos** (antes, más de 2.000).
Los 16 tests existentes siguen pasando sin cambios de comportamiento
observable (mismos contadores, mismo historial, misma semántica de §8.6/8.9).

Nota de seguridad para reintentos: como la identificación de productos y
formatos es por `codigo_producto`/`EAN` (no por posición), reintentar una
importación que quedó a medias por el bug anterior es seguro — las filas ya
escritas se reclasifican como SIN_CAMBIOS o ACTUALIZAR, nunca se duplican.

## D-025 — Sesiones durables (fix de deslogueos involuntarios)

Reportado por el usuario: al navegar entre pantallas, el sistema pedía
login de nuevo. Dos causas corregidas:

1. **Backend**: las sesiones vivían solo en CacheService, que Google
   documenta como almacenamiento no garantizado (puede purgar entradas en
   cualquier momento). Ahora cada sesión se guarda además en
   PropertiesService (durable): si la caché pierde la entrada,
   `authResolverUsuarioId_` la restaura desde el respaldo y rellena la
   caché con el TTL restante. El logout borra ambos almacenes y al iniciar
   sesión se limpian los respaldos vencidos.
2. **Cliente** (`web/comun.js`): borraba la sesión guardada ante CUALQUIER
   fallo de verificación — incluidos errores transitorios de red — y
   también cuando el usuario abría una pantalla de otro rol. Ahora la
   sesión solo se descarta cuando el servidor confirma que es inválida
   ("Sesión expirada" / usuario inactivo); los errores de red muestran un
   aviso para reintentar sin perder la sesión, y el desajuste de rol ofrece
   volver al inicio o entrar con otra cuenta, conservando la sesión.

Con prueba de resiliencia: purgar la caché manualmente y validar que la
sesión se restaura; y que tras logout NO se restaura.

## D-026 — Rendimiento: sesión optimista y carga del panel en una llamada

Reportado por el usuario: pantallas y datos lentos. Cada llamada a Apps
Script tiene ~1-3 s de latencia base (realidad del plan gratuito), y cada
página hacía 2-3 llamadas SECUENCIALES: verificación de sesión bloqueante +
una o dos de datos. Cambios:

1. **Sesión optimista** (`web/comun.js`): la página se pinta de inmediato
   con la sesión de localStorage, sin esperar al servidor. La seguridad no
   depende de eso: cada operación de datos valida el token en el servidor
   de todos modos; si la sesión murió, la primera llamada devuelve "Sesión
   expirada" y aparece el login. La revalidación explícita ocurre en
   segundo plano y como máximo cada 10 minutos.
2. **apiPanelInicial**: dashboard + inventario en una sola llamada,
   reutilizando la misma lectura de inventario en el servidor (antes se
   leía dos veces).
3. **Instrucciones de importación embebidas** en catalogo.html (eran
   estáticas; viajaban por API sin necesidad).

Resultado: abrir una pantalla pasó de 2-3 viajes secuenciales (~4-8 s
percibidos) a 0 viajes bloqueantes + 1 de datos (~1-3 s), con la interfaz
visible al instante. El piso de ~1-3 s por llamada es inherente a Apps
Script; para bajar de ahí la ruta es migrar la capa de datos (Etapa 3 del
PDF: PostgreSQL/Supabase).

## D-027 — Se descarta el flujo QA obligatorio: main directo + respaldo diario

El usuario prefirió trabajar directo en `main` con rollback de código en
vez de mantener una rama `develop` + entorno QA obligatorio para cada
cambio. Análisis que sustentó la decisión: rollback de código (git revert +
redeploy) y de frontend (Pages redeploya solo) son rápidos y confiables;
Apps Script además versiona cada despliegue, permitiendo apuntar la URL a
una versión anterior sin tocar git. El hueco real es que un rollback de
código NO deshace escrituras ya hechas en los DATOS (Sheets) antes de
notar y revertir un bug — eso llevó a priorizar D-028 (respaldo diario)
como mitigación real, en vez de una gate de QA que solo protege código.

Queda un proyecto Apps Script QA + planilla propia ya creados (aislados,
sin datos), disponibles para probar cambios riesgosos puntualmente sin
mantenerlos como parte del flujo habitual. `scripts/deploy.js` soporta
ambos entornos (`node scripts/deploy.js qa|prod "descripción"`), reutiliza
siempre el mismo deploymentId por entorno (la URL /exec no cambia entre
despliegues) y persiste el deploymentId la primera vez que lo crea.

## D-028 — Respaldo diario de la planilla a Drive, con rotación

Complementa —no reemplaza— el historial de versiones nativo de Google
Sheets: protege contra el hueco identificado en D-027 (escrituras de datos
que un rollback de código no deshace). `Backup.gs`: `backupEjecutar_`
copia la planilla activa a la carpeta "Respaldos - Sistema Bodega" en
Drive con el nombre fechado, y elimina (papelera) los respaldos con más de
`BACKUP_RETENCION_DIAS` (14) días. `setupInstalarRespaldoDiario()` instala
un disparador diario (~03:00) de forma idempotente — se ejecuta una vez
desde el editor, igual que `setupDatabase()`.

La lógica de retención (`backupVencidos_`) es una función pura, probada en
`SelfTest.gs` (segura de correr en cualquier entorno, incluida la base
real). La ejecución con efectos reales (`backupEjecutar_`, creación de
archivos/carpetas) NUNCA se prueba ahí — solo contra el mock de Drive
agregado a `scripts/entorno-gas.js`, exclusivamente desde
`scripts/run-tests.js` — para que `runFoundationTests()`/
`runMovimientoTests()` sigan siendo 100% seguras de ejecutar contra
producción sin crear ni borrar archivos reales por accidente.
