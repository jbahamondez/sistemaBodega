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
