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
