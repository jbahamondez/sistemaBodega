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

## D-029 — Remediación de auditoría (HACER AHORA + HACER PRONTO)

Tras la auditoría integral, se implementaron los hallazgos priorizados como
"hacer ahora" y "hacer pronto":

**Seguridad**
- **C1 — Fuerza bruta:** `authLogin_` bloquea un identificador tras 5 fallos
  consecutivos por 15 min (contador en Script Properties, aplicado también a
  identificadores inexistentes para no revelar cuáles existen). PIN mínimo
  subido de 4 a 6 dígitos en creación, edición y reset.
- **A1 — Formula injection:** toda fila escrita se formatea como texto (`@`)
  con `dbFormatearRangoTexto_` antes del `setValues`, así Sheets nunca evalúa
  un valor que empiece con `=`/`+`/`-`/`@`.
- **M8 — Divulgación:** `doGet` devuelve una página neutra; el estado interno
  (conteos, hojas) solo se ve por diagnóstico manual en el editor.
- **M9 — Cadena de suministro:** el `<script>` de ZXing por CDN lleva
  `integrity` (SHA-384) + `crossorigin`.

**Integridad de datos**
- **C2 — Idempotencia:** cada carro genera una `claveIdempotencia` (UUID) que
  viaja en la confirmación y se guarda en la cabecera (columna nueva
  `clave_idempotencia`). `movConfirmar_` la verifica DENTRO del lock: un
  reintento tras corte de red devuelve el movimiento ya confirmado en vez de
  duplicarlo.
- **A3 — Formato texto en todas las filas:** el formateo `@` por rango escrito
  (no solo las ~1000 filas iniciales del grid) preserva ceros iniciales de
  códigos y snapshots sin importar cuánto crezca la hoja.
- **A5 — Carreras en creación:** `catalogoCrearProducto_`,
  `catalogoCrearFormato_` y `usuarioCrear_` corren bajo `dbConLock_`
  (verificación de unicidad + escritura atómicas).

**Funcionalidad y operación**
- **A4 — Ajustes/Reversa:** nueva pestaña "Ajustes" en el panel (ajuste
  manual con motivo obligatorio) y botón "Revertir movimiento" en el detalle;
  ambos usan `apiAjusteConfirmar` (AJUSTE/REVERSA), cerrando el ciclo de
  corrección del Caso 6 desde la interfaz.
- **A6 — Listados acotados:** `movListar_` limita a 200 por defecto; el panel
  avisa cuando el resultado llega al tope y sugiere filtrar.
- **M3 — Fallos parciales visibles:** el dashboard alerta de cabeceras
  `EN_PROCESO` con más de 10 min (`movPendientesAntiguos_`), que antes
  quedaban invisibles.
- **M5 — Timeout de red:** `llamarServidor` corta a los 30 s con
  `AbortController` y mensaje accionable, en vez de "Procesando…" eterno.
- **M6 — CI:** workflow `ci.yml` corre `npm run check` (lint + sintaxis + 32
  pruebas) en cada push y PR.
- **M7 — Restauración:** runbook en `docs/RESTAURACION.md`.

**A2** (escape de comilla simple / onclick con solo IDs) se resolvió en el
lote HACER AHORA migrando los botones de usuario a pasar únicamente el ID.

Nota de migración: la columna `clave_idempotencia` se agregó al esquema de
Movimientos. La hoja de producción existente necesita el encabezado nuevo en
la celda correspondiente (ver mensaje de despliegue); las lecturas/escrituras
son posicionales, así que la idempotencia funciona igual, pero el encabezado
debe añadirse para mantener `setupDatabase()` reejecutable.

## D-030 — M1: confirmación de movimientos en una sola pasada de lecturas

Antes, `movConfirmar_` hacía 2-3 lecturas de hoja completa POR ÍTEM dentro
del lock (resolver cada código vía `catalogoBuscarPorCodigoBarras_` + leer
stock por producto) y actualizaba el inventario con una lectura+escritura
por producto: un carro de 10 ítems generaba ~25 lecturas y alargaba la
ventana del bloqueo linealmente.

Ahora, al entrar al lock se leen FORMATOS_EMPAQUE, PRODUCTOS e INVENTARIO
UNA vez cada una; los ítems se resuelven en memoria contra esos mapas
(`movResolverItem_` recibe los mapas, ya sin lecturas propias) y el
inventario se actualiza en LOTE reutilizando la lectura inicial (una
escritura total + un append para productos nuevos). Total: 3 lecturas y
~5 escrituras fijas, sin importar el tamaño del carro.

`invActualizarStock_` quedó sin usos y se eliminó (la única escritura de
Inventario vive ahora dentro de la transacción, en lote). Comportamiento
verificado sin cambios por las 32 pruebas existentes.

## D-031 — Fin al destello de contenido restringido + menos "Verificando…"

Reportado por el usuario: navegando entre Panel/Catálogo/Ingreso veía
repetidamente "Identifícate para continuar / Verificando acceso…", y un
usuario TRABAJADOR seguía observando las opciones de Jefatura.

Causa raíz del segundo problema: esas tres páginas no ocultaban su
contenido con CSS — dependían enteramente de que el script terminara de
ejecutar y cubriera la pantalla con el overlay de verificación. En
cualquier ventana entre "el navegador pinta el HTML" y "el script corre y
muestra el overlay" (carga lenta del script, red débil, dispositivo lento),
el contenido restringido (tabs, botones, pestaña Usuarios) podía pintarse
antes de quedar tapado. La página de Inicio no tenía este problema porque
sus tarjetas de administración ya usaban `.solo-jefatura{display:none}`
(oculto por CSS desde el primer parseo, no depende del tiempo de ejecución
del script).

Fix — `body.gate-rol{visibility:hidden}` en el `<style>` de Panel, Catálogo
e Ingreso (aplicado por el navegador de forma síncrona y bloqueante al
parsear el HTML, antes de cualquier script): el contenido queda invisible
por diseño hasta que `completar()` en `comun.js` confirma el rol correcto y
recién ahí hace `document.body.classList.remove('gate-rol')`. El overlay de
sesión se declara `visibility:visible` explícito para seguir viéndose sobre
un body oculto. Cierra el hueco sin importar la velocidad de red o del
dispositivo.

Para el primer problema (nagging), `asegurarRolConfirmado` agrega una
ventana de confianza de 2 minutos: si el rol ya se confirmó con el servidor
hace menos de ese tiempo y coincide con el requerido, se revela el
contenido de inmediato sin overlay, con una revalidación en segundo plano
que solo interrumpe si el servidor de verdad invalida la sesión (nunca por
un simple corte de red, D-025). Pasada la ventana, o si el rol no coincide,
se hace la verificación completa con "Verificando acceso…" visible, como
antes.

## D-032 — Inicio: verificación de rol unificada en una sola llamada

Tras D-031, el usuario reportó que un TRABAJADOR seguía viendo las
tarjetas de administración en el inicio (aunque el acceso real a esas
páginas ya estaba correctamente bloqueado). No se pudo confirmar un bug
lógico concreto por lectura de código en el mecanismo anterior
(`Sesion.asegurar(null,...)` + `Sesion.confirmarRolPara(...)`), pero ese
patrón hacía DOS peticiones de red independientes a `apiSesionInfo` que
compartían las mismas variables internas del módulo (`datos`, `pendiente`)
sin necesidad — complejidad innecesaria y fuente de dudas al auditar.

Se reemplaza por `Sesion.asegurarConfirmado(onListo)`: una única llamada al
servidor decide todo lo que depende de la sesión en el inicio (saludo +
qué tarjetas mostrar) y llama `onListo(datosConfirmados)` una sola vez, con
el rol siempre recién confirmado. `confirmarRolPara` (el método anterior)
queda eliminado por no tener más usos.

## D-033 — Causa raíz real de las tarjetas de Jefatura visibles: especificidad CSS

D-031 y D-032 corrigieron riesgos reales (destello por timing, doble llamada
redundante) pero NO eran la causa del síntoma reportado en el inicio. Se
confirmó con evidencia directa (DevTools → Elements, con la cuenta de prueba
TRABAJADOR): `apiSesionInfo` devolvía `rol: "TRABAJADOR"` correctamente y el
script nunca agregaba `style="display:block"` a las tarjetas — es decir, el
JavaScript funcionaba bien. La regla `.solo-jefatura { display: none; }`
aparecía tachada (ignorada) en el panel de estilos: `a.tarjeta { display:
block; ... }` tiene mayor especificidad CSS (selector etiqueta+clase) que
`.solo-jefatura` (una sola clase), así que ganaba siempre sin importar el
orden en la hoja de estilos.

Fix en `web/index.html`: `a.tarjeta.solo-jefatura { display: none; }`
(etiqueta + dos clases), con especificidad mayor que `a.tarjeta`. Lección:
ante un síntoma de "el JS parece correcto pero el efecto visual no ocurre",
verificar primero si una regla CSS está siendo sobrescrita antes de asumir
un bug de lógica o de timing.

## D-034 — Cerrar sesión siempre vuelve al Inicio

Reportado por el usuario: si cerraba sesión estando dentro de una pantalla
restringida (p. ej. Panel, rol JEFATURA) y luego otro usuario con distinto
rol (TRABAJADOR) iniciaba sesión ahí mismo, `Sesion.cerrar()` hacía
`location.reload()` — recargaba la MISMA pantalla, así que el login exitoso
chocaba de inmediato con el control de acceso de esa pantalla (mensaje "no
tiene acceso") en vez de simplemente llevar al segundo usuario a donde sí
puede entrar. Fix: `cerrar()` siempre navega a `index.html` tras cerrar
sesión, sin importar desde qué pantalla se invocó.

## D-035 — Cerrar sesión no debe mostrar "La sesión expiró"

Reportado por el usuario: tras D-034, al cerrar sesión aparecía en el login
el aviso "La sesión expiró. Vuelve a entrar." — engañoso, porque no era una
expiración real sino un cierre de sesión voluntario. Causa: `cerrar()`
esperaba la respuesta de `apiLogout` antes de navegar; mientras tanto, una
revalidación en segundo plano ya en vuelo (la de `asegurar`/
`asegurarRolConfirmado` de la pantalla donde se estaba) podía responder
justo en esa ventana, viendo el token recién invalidado por el logout y
reportando "Sesión expirada" — mensaje técnicamente cierto pero fuera de
lugar para un cierre de sesión intencional.

Fix: `cerrar()` marca un flag `cerrandoSesion` (silencia esos avisos
mientras está en `true`) y navega a `index.html` de inmediato, sin esperar
la respuesta de `apiLogout` (que sigue enviándose, pero de forma
"best-effort" — invalidar el token en el servidor no requiere bloquear al
usuario).

## D-036 — Alta rápida de producto al escanear un código no registrado (solo Ingreso)

Pedido por el usuario: al escanear con la pistola (`ingreso.html`) un código
que no existe en el catálogo, además de la alerta, poder crearlo ahí mismo
sin salir a `catalogo.html`.

Se limitó a `ingreso.html` (no a `retiro.html`): esa pantalla ya es
exclusiva de JEFATURA, el mismo rol que el servidor exige para
`apiCatalogoCrearProducto`/`apiCatalogoCrearFormato` — no hay que abrir
ningún permiso nuevo. Extenderlo a Retiro (abierto también a TRABAJADOR)
habría requerido decidir si ese rol puede crear catálogo, algo que el
usuario no pidió.

Alcance del formulario: solo "producto nuevo + su primer formato" (no
selección de un producto ya existente para agregarle una variante) — cubre
el caso típico de un código de barras totalmente nuevo. Flujo: `Ui.confirmar`
pregunta si crear, `Ui.formulario` pide nombre/código/categoría/descripción
del producto y nombre/tipo/unidades del formato (el código de barras es el
ya escaneado, fijo), se llama `apiCatalogoCrearProducto` y luego
`apiCatalogoCrearFormato` en cadena, y el resultado se agrega directo al
carro (sin volver a escanear).

Se agregó soporte de campos `tipo: 'select'` al modal genérico
`Ui.formulario` (`web/comun.js`), que antes solo generaba `<input>` — el
único cambio a un componente compartido; el resto vive en `ingreso.html`.

Bug encontrado al probar: el reenfoque periódico de `#escaneo` (cada 800 ms,
necesario para que la pistola siga escribiendo ahí) no conocía los campos
del modal y le quitaba el foco constantemente, impidiendo escribir en "Nombre
del producto" y el resto. `reenfocar()` ahora también respeta cualquier
campo dentro de `#ui-modal`.

## D-037 — Eliminar (no solo desactivar) productos y formatos del catálogo

Pedido por el usuario: en Catálogo, poder eliminar productos/formatos
seleccionados (uno o varios), similar a como ya funciona "Desactivar".

Diferencia clave frente a desactivar: desactivar siempre se puede forzar
(nunca destruye datos, D-004/§8.10); eliminar es físico y definitivo, así
que el servidor lo BLOQUEA (sin opción de forzar) si el producto/formato
alguna vez tuvo stock o apareció en `MOVIMIENTO_DETALLE` — ahí la
trazabilidad debe conservarse intacta. Solo procede si nunca se usó.

`catalogoEliminarProducto_` elimina en cascada los formatos del producto sin
necesidad de revisarlos por separado: `MOVIMIENTO_DETALLE` guarda
`producto_id` Y `formato_id` en la misma fila de detalle, así que si el
producto nunca apareció ahí, ninguno de sus formatos pudo aparecer solo.
También limpia la fila de `INVENTARIO` (stock ya en 0, verificado antes).

`catalogoEliminarLoteProductos_` (para "Eliminar seleccionados") NO usa un
único lock para todo el lote, a diferencia de activar/desactivar en lote:
cada producto puede bloquearse por una razón distinta, así que se procesan
uno por uno y se informa cuáles se eliminaron y cuáles no (con motivo) —
igual que ya hace `usuarioEliminar_` para usuarios individuales.

Nuevos endpoints: `apiCatalogoEliminarProducto`, `apiCatalogoEliminarFormato`,
`apiCatalogoEliminarLote` (los tres exigen JEFATURA). En `catalogo.html`: un
botón "Eliminar" por fila (producto y formato) y "Eliminar seleccionados" en
la barra de lote existente, siguiendo el patrón ya establecido (D-029/A2) de
pasar solo IDs por `onclick`, nunca texto libre. Pruebas nuevas en
`SelfTest.gs`: `testEliminarCatalogo_` (bloqueo por stock, por movimientos,
cascada de formatos, y resumen del lote).

## D-038 — Alertas de stock del Panel como tabla ordenada

Reportado por el usuario: con muchos productos agotados o bajo mínimo, la
alerta (un párrafo con los nombres separados por coma) se volvía
desordenada e incómoda de revisar.

`panelDashboard_` ahora incluye `categoria`, `codigo_producto` y
`updated_at` en `productos_sin_stock`/`productos_bajo_minimo` (ya estaban
disponibles en `invListar_`, solo faltaba pasarlos). En `panel.html`,
`tablaAlertaStock()` reemplaza el párrafo por una tabla ordenada
alfabéticamente por nombre, con las mismas columnas que el resto de tablas
del panel (Producto, Categoría, Código, Stock si aplica, Última
actualización) — reutiliza los estilos de tabla ya existentes, sin CSS
nuevo.

## D-039 — Corregir cantidades de un RETIRO (sin editar el historial)

Pedido por el usuario: que Jefatura pueda corregir un retiro cuando el
Trabajador se equivocó en la cantidad. El sistema nunca edita un movimiento
confirmado (D-005/D-016 — la trazabilidad no se sobreescribe), así que se
evaluaron dos caminos: usar solo "Revertir movimiento" (ya existente, deshace
todo el retiro) + registrar uno nuevo con la cantidad correcta; o un
corrector guiado que pida la cantidad correcta por ítem y aplique solo la
diferencia. El usuario eligió el corrector guiado.

`corregirRetiro()` (`web/panel.html`), botón nuevo en el detalle de
movimiento visible solo para `tipo === 'RETIRO'`: muestra cada ítem con su
cantidad original (`cantidad_empaques`, siempre positiva en un RETIRO — el
signo negativo vive en `total_unidades`) y un campo editable con la cantidad
real. Al aplicar, por cada ítem calcula `diferencia = original - corregido`
y arma un único `AJUSTE` con esos deltas (mismo mecanismo que ya usa
Revertir vía `apiAjusteConfirmar`, sin endpoint nuevo). Ejemplo: se
registraron 5 cajas pero en realidad fueron 3 → diferencia +2 (repone 2
cajas); si en realidad fueron 7 → diferencia −2 (retira 2 cajas más). Los
ítems sin diferencia se omiten (evita el error "cantidad inválida" que
`movResolverItem_` lanza ante cantidad 0). El retiro original queda intacto
y visible; el ajuste queda enlazado por texto en la observación
("Corrección de RET-000123: …"). Sin cambios de backend — reutiliza
`apiAjusteConfirmar`, ya existente y con permiso de JEFATURA.

## D-040 — Pantalla "Configuración": parámetros del sistema editables

Pedido por el usuario: subir el umbral de "bajo mínimo" de 10 a 30 sin
editar la planilla a mano, e ideas de qué más convendría poder ajustar.

Se creó `src/Parametros.gs` (`parametrosObtener_`/`parametrosGuardar_`),
respaldado en la hoja Configuracion (mismo mecanismo clave/valor que ya
usan los contadores de ID) — no una hoja nueva. Se movieron ahí tres
valores que antes eran constantes fijas en el código: `stock_minimo_default`
(ya vivía en Configuracion, solo faltaba una forma de escribirlo),
`backup_retencion_dias` (antes `BACKUP_RETENCION_DIAS = 14` en Backup.gs) y
`mov_limite_default` (antes `MOV_LIMITE_DEFAULT = 200` en Movimientos.gs).
`mov_limite` tiene un tope duro de 1000 (no editable) para no reabrir el
hueco de A6 (listados sin límite real).

Se descartó a propósito exponer parámetros de seguridad (intentos máximos
de login, mínimo de dígitos del PIN): quedan fijos en el código para que
nadie los debilite sin querer desde una pantalla.

Nueva pestaña **"Configuración"** en el Panel (`web/panel.html`) — nombre
elegido para no chocar con la pestaña ya existente "Ajustes" (corrección de
cantidades de stock, un concepto distinto). El límite de movimientos del
propio Panel (antes una constante `MOV_LIMITE_PANEL = 200` fija en el
cliente) ahora se sincroniza con el valor real vía `apiConfigObtener` al
cargar la página, para que el aviso de "mostrando los N más recientes" no
quede desincronizado si alguien cambia el tope. Nuevos endpoints
`apiConfigObtener`/`apiConfigGuardar` (JEFATURA). Pruebas nuevas:
`testParametros_` (valores por defecto, guardado, validaciones y tope
duro).

## D-041 — Bug real: funciones nuevas de Api.gs no registradas en la whitelist HTTP

Reportado por el usuario al probar Configuración: "Error: Función
desconocida: 'apiConfigObtener'". Causa: `Http.gs` mantiene una lista blanca
explícita (`httpFunciones_()`) de qué funciones de `Api.gs` son invocables
desde el cliente (D-020); agregar una función nueva a `Api.gs` sin sumarla
también ahí la deja inalcanzable, y nada lo detectaba automáticamente.
Revisando, el mismo olvido ya había pasado con `apiCatalogoEliminarProducto`/
`apiCatalogoEliminarFormato`/`apiCatalogoEliminarLote` (D-037) — es probable
que el "no se pudo eliminar" que el usuario vio en esa prueba fuera este
mismo error, no el bloqueo por stock/movimientos que se asumió en su
momento sin confirmar el texto exacto del aviso.

Fix inmediato: las 5 funciones faltantes agregadas a `httpFunciones_()`.
Fix estructural: `scripts/check-whitelist.js` (nuevo, corre en
`npm run check`) escanea `Api.gs` en busca de toda función `apiXxx` y falla
si alguna no aparece en la whitelist de `Http.gs` — para que este bug ya no
pueda pasar desapercibido.

## D-042 — Toast de confirmación: snackbar inferior centrado

Pedido por el usuario: mover el aviso verde (`Ui.toast`) de arriba a la
derecha hacia abajo. Se descartó "abajo a la derecha" tal cual porque ahí
ya vive `#sesion-chip` (la píldora "Nombre (Rol) · Salir") y quedarían
superpuestos. El usuario eligió, entre varias alternativas con vista
previa, un snackbar inferior centrado (estilo Material Design).

`#ui-toast` en `web/comun.js`: de `top:.9rem;right:.9rem` a
`bottom:4.5rem;left:50%;transform:translateX(-50%)` — el offset de 4.5rem
(en vez de uno más ajustado) es a propósito para no acercarse nunca a
`#sesion-chip`, sin importar el ancho de pantalla. Sin cambios de
comportamiento (mismo `Ui.toast(mensaje, tipo)`, misma animación), solo
posición.

## D-043 — Panel: auto-actualización del Dashboard (sin tiempo real verdadero)

Pedido por el usuario: ver los últimos movimientos y alertas de stock
"en vivo". Apps Script no soporta conexiones persistentes (WebSockets/SSE),
así que tiempo real verdadero no es viable sin cambiar de backend — se
implementó en su lugar polling cada 30s (`AUTO_REFRESCO_MS`) más un
refresco inmediato al volver a la pestaña (`visibilitychange`), que cubre
el caso más común ("la dejé minimizada, vuelvo a mirar") sin esperar el
siguiente tick. Costo irrelevante: unos pocos miles de llamadas por jornada
completa, muy por debajo de cualquier cuota de Apps Script.

`web/panel.html`: barra nueva sobre el Dashboard con "Actualizado hace N s/min"
(se recalcula cada segundo localmente, sin pedir datos — `renderUltimaActualizacion`),
botón **"🔄 Actualizar todo"** (llama `cargarInicial()` directo, el mismo
código que ya usaban el auto-refresco y varias acciones existentes) y
**"⏸ Pausar auto-actualización"** (detiene el temporizador Y el refresco por
visibilidad; un segundo clic los reanuda). `cargarInicial()` ahora también
registra el momento de la última carga, así que CUALQUIER acción que ya la
invocaba (guardar Configuración, confirmar un ajuste, etc.) también
actualiza el indicador, sin duplicar lógica.

Ajuste de ubicación (mismo día, feedback directo del usuario): la barra
arriba a la izquierda del Dashboard se veía poco profesional, y el botón
"Pausar auto-actualización" no encajaba ahí porque el auto-refresco no es
exclusivo del Dashboard (también refresca Inventario, vía el mismo
`apiPanelInicial`). Cambios: "Actualizado hace…" + "Actualizar" pasan a la
derecha de la barra de pestañas (`.tabs-bar`, patrón pestañas-izquierda/
controles-derecha), sin emoji en el botón; "Pausar auto-actualización" se
mueve a la pestaña Configuración, junto a los demás parámetros del Panel.

## D-044 — Gráficos y métricas en el Dashboard

Pedido por el usuario: "ideas profesionales" de gráficos para el Dashboard.
Se usó la guía interna de dataviz (paleta categórica validada contra
daltonismo con `scripts/validate_palette.js` antes de usarla — ΔE adyacente
73.6, muy por sobre el mínimo de 12). Tras dos rondas de ideas, se eligieron
cinco vistas: Movimientos por día (Entrada vs Retiro, línea de 30 días),
Top 10 productos con más rotación (barras), Evolución del stock total
(línea), Actividad por usuario (barras) y Comparación semana actual vs.
anterior (tarjeta KPI con flecha, sin connotación de "bueno/malo" — más
retiro no es necesariamente positivo ni negativo). Se descartó a propósito
un gráfico de torta por tipo de movimiento (4 categorías: las tarjetas KPI
ya existentes comunican lo mismo mejor).

Backend: `panelMetricas_(dias)` en `Panel.gs` (nuevo), expuesto vía
`apiPanelMetricas` — con **dos bugs reales corregidos durante las pruebas
locales, antes de llegar a producción**:

1. `MOVIMIENTOS.total_unidades` (cabecera) es una **magnitud absoluta**
   (`Math.abs` de cada ítem sumado, ver `movConfirmar_`) — un RETIRO
   también lo guarda positivo. El signo real para reconstruir un saldo
   acumulado vive en `MOVIMIENTO_DETALLE.total_unidades` por ítem (D-039 ya
   lo había documentado para la reversa, pero no se aplicó aquí a la
   primera). La evolución de stock ahora se calcula sumando los detalles
   (`deltaSignadoPorMovimiento`), no la cabecera — si no, el stock
   reconstruido solo podía subir, nunca bajar.
2. El mock local de pruebas (`scripts/entorno-gas.js`) **ignora el formato
   pedido** en `Utilities.formatDate` y siempre devuelve fecha+hora
   completa — con formato `'yyyy-MM-dd'` las fechas traían la hora pegada y
   nunca calzaban con los buckets diarios. Fix: pedir el formato largo y
   recortar con `.slice(0,10)`, igual que ya se hace en el resto del
   archivo — funciona contra la API real y contra el mock por igual.

Ambos se encontraron con `testPanelMetricas_` (datos reales vía
`movConfirmar_`) más un script de depuración puntual que imprimió los
valores intermedios — no se detectaron por inspección de código.

Frontend: gráficos SVG hechos a mano en `web/panel.html` (sin librerías
externas) — líneas con leyenda, etiqueta al final, tooltip tipo
"crosshair"; barras horizontales con tooltip por fila. Un solo
`#grafico-tooltip` compartido por todos los gráficos. Se agregan a
`cargarInicial()`, así que el auto-refresco (D-043) también los mantiene al
día.

## D-045 — Acordeón para plegar/desplegar cada gráfico del Dashboard

Pedido por el usuario: poder ocultar los gráficos que no le interesan.
Se plantearon dos caminos: casillas en la pestaña Configuración (control
centralizado, pero requiere salir del Dashboard para cambiarlo y el
gráfico desaparece del todo hasta acordarse de reactivarlo ahí), o un
acordeón directo en el Dashboard (clic en el título pliega/despliega ahí
mismo). El usuario eligió el acordeón.

Se guarda en `localStorage` (clave `panel_grafico_colapsado_<id>`), no en
Configuración/la base de datos: es una preferencia personal de
visualización (qué quiero ver YO en mi pantalla), no una regla de negocio
como el stock mínimo — cada quien arma su Dashboard sin afectar a los
demás usuarios de Jefatura. El título de cada gráfico (con una flechita que
rota) siempre queda visible aunque esté plegado, para no "perder" el
gráfico de vista — solo se oculta el contenido (`.grafico-bloque.colapsado
> .grafico` / `> .stat-tile`). Cubre las 5 vistas de D-044, incluida la
tarjeta de comparación semanal (que ahora también lleva su propio título).

Ajuste el mismo día (feedback directo, capturas de pantalla): dos problemas
de orden visual. (1) La tarjeta de comparación semanal usaba `.stat-tile`
como contenedor `flex` con dos `<div>` hijos — al ser ambos ítems flex con
`align-items:baseline`, el texto del delta terminaba alineado junto a la
etiqueta en vez de bajo el número grande. Se cambió a `flex-direction:
column` (etiqueta arriba, una fila interna con valor+delta abajo). (2) "Top
10 rotación" y "Actividad por usuario" vivían en una grilla de 2 columnas
(`.graficos-dos-col`) mientras el resto era una sola columna — al plegar
todo, el orden se veía asimétrico. Se unificó todo en una sola columna con
estilo de lista (borde inferior fino entre filas), y se movió el panel
"Alertas de stock" ANTES de "Métricas y tendencias" en el Dashboard (pedido
explícito: alertas primero, gráficos después).

## D-046 — Botón "Volver al retiro" del escáner renombrado y despintado de rojo

Reportado por el usuario: en la vista de escaneo de Retiro, el botón que
cierra la cámara y muestra el carro ("Volver al retiro") se sentía como
"retrocediste, te equivocaste" — y además estaba pintado en rojo (clase
`peligro`, la misma que "Cancelar retiro"), reforzando esa sensación pese a
ser una acción normal y frecuente (terminar de escanear para ir a revisar
el carro). Cambiado a **"Terminar de escanear"** con estilo `principal`
(relleno, color marca) en vez de `peligro` — visualmente ahora es la
acción principal para avanzar, no una alerta.

## D-047 — Mitigar falta de señal al escanear un retiro

Pedido por el usuario: una bodega (paredes de concreto, estanterías
metálicas) es justo el lugar donde la señal falla, y hoy un escaneo sin
conexión simplemente fracasa sin alternativa. Se plantearon cuatro ideas;
el usuario eligió dos: precargar el catálogo completo y un aviso visible de
"sin conexión" (dejó fuera, por ahora, el reintento automático al
confirmar — ya existe un mensaje claro + reintento manual seguro gracias a
la clave de idempotencia, C2).

**Catálogo offline** (`apiCatalogoOffline` → `catalogoListarOffline_` en
Catalogo.gs): SOLO identidad (código de barras → producto/formato/
unidades), **nunca stock** — el stock sigue validándose siempre en el
servidor al confirmar (`movConfirmar_` relee todo bajo lock), así que esto
es una comodidad de identificación, no un hueco de integridad. Solo incluye
productos/formatos activos. En `retiro.html`, se guarda en `localStorage` y
se refresca sola cada vez que hay conexión (`cargarCatalogoOffline`, al
abrir la página y al recuperar la señal).

Cuando `apiBuscarCodigo` falla, `procesarCodigo` distingue un problema de
RED real (mensajes "conexión"/"tardó demasiado" que arma `llamarServidor`
en comun.js) de un error de negocio genuino (p. ej. "Usuario inactivo") —
solo ante un problema de red se usa el catálogo local; un error real se
muestra tal cual, sin ocultarlo. Un ítem agregado así queda marcado
(`sinVerificar`, con un ícono 📡 en el carro) hasta que se confirme el
retiro, donde el servidor valida todo de verdad.

**Aviso de conexión**: banner naranja bajo el header ("📡 Sin conexión…"),
controlado tanto por los eventos `online`/`offline` del navegador como por
llamadas reales fallidas — `navigator.onLine` solo indica que el
dispositivo tiene una interfaz de red activa, no que haya internet real
(puede estar "conectado" a un WiFi sin salida, típico de bodegas), así que
una llamada que falla por red también enciende el aviso aunque el
navegador diga que está online.

Bug real encontrado al probar (mensaje visto: "Failed to fetch" crudo del
navegador, sin la palabra "conexión"): `llamarServidor` en `comun.js`
decía "si el error del navegador tiene mensaje, muéstralo tal cual" —
y un `fetch()` rechazado por falta de red SIEMPRE trae mensaje propio
(`"Failed to fetch"` en Chrome, `"NetworkError when attempting to fetch
resource"` en Firefox, `"Load failed"` en Safari), así que el texto
amigable "Sin conexión con el servidor" nunca se usaba en la práctica. Esto
rompía la detección de `retiro.html` (D-047), que busca la palabra
"conexión" para decidir si ofrecer el catálogo offline. Fix: el bloque
`catch()` de `llamarServidor` ahora SIEMPRE arma su propio mensaje
reconocible ("Sin conexión con el servidor…" / "El servidor tardó
demasiado…"), descartando el texto crudo del navegador — todo lo que cae
ahí es, por diseño, un problema de red (los errores de negocio ya se
resuelven antes, en el `.then()`).

## D-048 — Columna "EAN CAJA" en la planilla: dos códigos escaneables por empaque

Pedido por el usuario: la planilla real ahora trae una segunda columna
"EAN CAJA" además del "EAN", y un producto escaneado debe reconocerse por
cualquiera de los dos códigos. Confirmado con el usuario: ambos códigos
identifican el MISMO empaque con la misma Cantidad (no son empaques
distintos con cantidades diferentes).

Diseño elegido: el modelo de datos ya soporta esto sin cambios (un
producto, varios formatos, cada uno con su código; el escaneo ya busca en
todos los formatos). Solo cambió la IMPORTACIÓN: cada fila física de la
planilla se expande en 1-2 filas lógicas (`importacionExpandirFila_`)
ANTES de validar y clasificar:

- Sin EAN CAJA (o igual al EAN): la fila queda tal cual — una planilla sin
  la columna nueva importa exactamente igual que antes.
- Ambos códigos distintos: se agrega una fila lógica extra → un formato
  adicional del mismo producto con el código de caja, la misma cantidad y
  el nombre sufijado " (caja)" (p. ej. "Caja x 6 (caja)") para
  distinguirlos en el catálogo.
- EAN vacío pero EAN CAJA presente: el código de caja pasa a ser el
  principal (la fila ya no falla por "codigo_barras obligatorio").

Como cada fila lógica pasa completa por el mismo circuito (validación,
duplicados dentro del archivo — que ahora también detecta un EAN CAJA
repetido o chocando con el EAN de otra fila —, clasificación
NUEVO/ACTUALIZAR/SIN_CAMBIOS y aplicación en lote), no hubo que tocar ni
`importacionAplicarEnLote_` ni el frontend: la previsualización muestra la
variante como una fila más (mismo número de fila, código y nombre de
formato propios). La derivación del sufijo es determinista, así que
reimportar la misma planilla clasifica todo como SIN_CAMBIOS (no duplica).
Columna nueva en `CONFIG.IMPORT_PLANILLA`: `codigo_barras_caja`, alias
"ean caja", opcional. Prueba: `testImportEanCaja_`.

## D-049 — Entrega al cliente: informe PDF ejecutivo y guías de uso

Preparación para entregar el sistema al cliente final. Tres piezas:

**Informe PDF de movimientos** (`generarInforme()` en `web/panel.html`,
botón "Generar informe PDF" junto a los filtros de Movimientos): genera una
vista de impresión con estilo ejecutivo (tipografía serif, paleta chocolate
y dorado, cabecera con período/generado por, tarjetas de resumen por tipo,
tabla completa del período filtrado) en una ventana nueva y abre el diálogo
de imprimir — "Guardar como PDF" produce el documento. Se eligió el motor
de PDF del propio navegador en vez de una librería (jsPDF u otras): cero
dependencias nuevas, cero superficie de supply-chain (M9) y tipografía
nativa. Usa el último resultado del filtro (o lo consulta si aún no se ha
filtrado). Sin cambios de backend.

**Guías de uso** (`docs/guias/`): `guia-trabajador` (1 página: login,
retiro con cámara, modo sin señal, situaciones frecuentes) y
`guia-jefatura` (2 páginas: ingreso con pistola + alta rápida, catálogo e
importación EAN/EAN CAJA, dashboard, correcciones, ajustes, usuarios,
configuración, buenas prácticas). Fuente HTML + PDF generado con Edge
headless (`msedge --headless --print-to-pdf`), mismo lenguaje visual del
informe. Los PDF se versionan en el repo para entregarlos tal cual.

Además quedó definido el procedimiento de reinicio de datos para la
entrega (manual, sin código nuevo): respaldar la planilla, eliminar las
hojas de datos, poner los contadores `contador_*` de Configuracion en 0,
re-ejecutar `setupDatabase()` (recrea todo con encabezados actualizados —
cierra de paso el pendiente del encabezado `clave_idempotencia` de D-029)
y crear la cuenta real de jefatura con `setupCrearUsuarioJefatura()`.
D-047 (offline) quedó confirmado funcionando por el usuario en dispositivo
real.

## D-050 — Reinicio para entrega en una sola función

El reinicio de datos para la entrega (borrar hojas + poner contadores en
cero + recrear estructura) se documentó primero como pasos manuales, pero
eran 8 hojas a borrar y 7 contadores a poner en cero — propenso a error
(borrar la hoja equivocada, saltarse un contador). Se encapsuló en
`setupReiniciarParaEntrega(confirmacion)` (Setup.gs): borra todas las hojas
de datos (incluidos usuarios), las recrea vacías con `setupDatabase()` (así
los encabezados quedan según el esquema vigente, cerrando de paso el
pendiente del encabezado `clave_idempotencia`), pone los contadores en cero
y los parámetros de Configuración en fábrica (vía `parametrosGuardar_`).

Salvaguardas por ser DESTRUCTIVA: exige la confirmación exacta
`'BORRAR TODO'` — el botón "Ejecutar" del editor no pasa argumentos, así
que no la dispara por accidente; hay que llamarla explícitamente. No está
en la whitelist HTTP (`httpFunciones_`), por lo que no es invocable desde la
web, y el frontend vive en GitHub Pages (D-022), sin `google.script.run`.
El flujo de entrega queda: `setupReiniciarParaEntrega("BORRAR TODO")` →
`setupCrearUsuarioJefatura(...)` con los datos reales del cliente. Prueba:
`testReinicioEntrega_` (última del runner, porque vacía la base de prueba).

Nota: la cuenta de prueba con movimientos no se puede eliminar desde el
panel (la trazabilidad lo impide, solo desactivar); este reinicio sí la
elimina de verdad porque borra la hoja Usuarios completa.

## D-051 — Limpieza del "ruido" del lector en códigos GS1-128

Reportado por el usuario: registró la EAN CAJA `01030469232998071526123110L4515`
pero al escanearla con la cámara del celular decía "no registrado". El dato
clave fue el valor que devolvía el escáner: `[C101030469232998071526123110L4515)`
— el contenido es idéntico, pero con `[C1` al inicio y `)` al final.

Causa: es un código **GS1-128** (los que traen las cajas con GTIN + lote +
vencimiento adentro). Los lectores anteponen el **identificador de simbología
AIM** `]C1` (que en este dispositivo llega como `[C1`) y a veces agregan
paréntesis. Ese ruido hacía que el código escaneado no coincidiera con el
guardado.

Fix: `utilNormalizeBarcode` (Utils.gs) ahora quita el identificador de
simbología al inicio (`[`/`]` + letra + dígito) y los corchetes/paréntesis
sueltos al inicio o final. Se aplica igual al importar y al buscar, así el
código guardado y el escaneado quedan idénticos. Los códigos normales
(EAN-13, etc.) no se ven afectados porque no empiezan con corchete ni
terminan en paréntesis. En el cliente se agregó `window.normalizarCodigo`
(comun.js) con la misma lógica, aplicada al escanear en retiro.html e
ingreso.html, para que la búsqueda offline (que ocurre solo en el navegador)
y la deduplicación del carro también coincidan. No requiere reimportar: el
valor guardado ya equivale al escaneado normalizado. Pruebas:
`testBarcodePreservesLeadingZeros_` (casos con ruido) y `testImportEanCaja_`
(escaneo con prefijo encuentra el producto).

CAVEAT documentado para el usuario (no resuelto por este fix): un código
GS1-128 con AI(10) lote y AI(15) vencimiento es distinto en cada caja según
su lote/fecha, así que registrar la cadena completa solo hace coincidir las
cajas de ESE lote. Solo el GTIN (AI 01) es constante por producto.
