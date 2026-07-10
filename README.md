# Sistema de Control y Trazabilidad de Bodega — Chocolatería

Aplicación web para controlar el stock físico y la trazabilidad de la bodega
de una chocolatería. Responde tres preguntas: cuánto hay en bodega, qué entró
y salió, y quién realizó cada movimiento, cuándo y en qué cantidad.

**Costo de operación: $0 mensual.** Se apoya exclusivamente en cuentas
gratuitas de Google y los dispositivos existentes (PC + pistola escaneadora,
celulares Android con cámara).

## Arquitectura

| Capa | Tecnología | Rol |
|---|---|---|
| Frontend | Web estática en GitHub Pages (carpeta `web/`) | Pantallas de jefatura (PC) y trabajador (Android) |
| Backend | Google Apps Script (V8) como API JSON (`Http.gs`) | Validaciones, conversiones, concurrencia, autorización |
| Datos | Google Sheets | Almacenamiento estructurado (9 hojas) |
| Archivos | Google Drive | Alojamiento del archivo de datos y respaldos |

El frontend se separó de Apps Script porque la cámara Android no funciona
dentro de su iframe (D-022). Las páginas llaman a la API con POST JSON
(`web/comun.js`); la URL del backend vive solo en `web/config.js`. Ciclo de
actualización: backend con `clasp push -f` + `clasp update-deployment <id>`
(conserva la misma URL); el frontend se publica solo con cada push a GitHub
(workflow `pages.yml`).

Reglas de arquitectura:

- Los usuarios **nunca** editan las hojas directamente; toda lectura/escritura
  pasa por la aplicación (capa `Db.gs`).
- El stock se almacena en **unidades base**; la operación se hace por
  empaques (cajas/displays) con conversión automática.
- `Movimientos` + `MovimientoDetalle` son la fuente de auditoría;
  `Inventario` es el estado actual optimizado para consulta.
- Los movimientos confirmados son inmutables: los errores se corrigen con
  movimientos de tipo `AJUSTE` o `REVERSA`, nunca borrando.
- Toda operación que modifica stock se ejecuta bajo `LockService`
  (bloqueo + relectura de stock vigente + validación + escritura).

## Estructura del código

```
src/
  appsscript.json   Manifiesto (zona horaria, V8, webapp)
  Config.gs         Configuración central: hojas, columnas, roles, tipos, IDs,
                    mapeo de la planilla de importación (IMPORT_PLANILLA)
  Utils.gs          Utilidades puras (fechas, texto, códigos de barras, CSV, hash de PIN)
  Validation.gs     Validaciones base reutilizables
  Db.gs             Capa de acceso a datos (única que toca Sheets)
  Ids.gs            Generación de IDs únicos bajo bloqueo (PROD-0001, MOV-000001…)
  Setup.gs          Inicialización idempotente de la base de datos y primer usuario
  Historial.gs      Trazabilidad de cambios del catálogo
  Catalogo.gs       CRUD de productos/formatos, estados, búsqueda por código, exportación
  Importacion.gs    Plantilla, previsualización y aplicación de cargas masivas
  Inventario.gs     Consulta de stock (la escritura solo ocurre vía movimientos)
  Movimientos.gs    Confirmación transaccional: bloqueo → releer → validar → escribir
  Panel.gs          Agregados del dashboard (totales, alertas de stock)
  Backup.gs         Respaldo diario de la planilla a Drive, con rotación
  Auth.gs           Login por identificador + PIN y sesiones por token
  Usuarios.gs       Administración de usuarios (crear, estados, rol, reset PIN)
  Api.gs            ÚNICA capa de negocio invocable; valida rol por operación
  Http.gs           Router HTTP: POST JSON desde el frontend (whitelist = Api.gs)
  Code.gs           doGet: página de estado del backend
  SelfTest.gs       Pruebas (ejecutables en el editor y localmente con npm test)

web/                Frontend estático (GitHub Pages)
  config.js         URL de la API (único punto a ajustar si cambia)
  comun.js          Sesión (login por PIN, token) y comunicación fetch con la API
  index.html        Inicio con accesos según rol
  ingreso.html      Ingreso con pistola (jefatura, PC)
  retiro.html       Retiro con cámara (trabajador, Android)
  panel.html        Panel de jefatura
  catalogo.html     Administración del catálogo
```

**Seguridad (Fase 7):** la lógica de negocio usa funciones con sufijo `_`,
que Apps Script no permite invocar desde el cliente. `Api.gs` es la única
superficie pública: cada función valida el token de sesión y el rol en el
servidor. El responsable de cada movimiento es siempre el usuario
autenticado. Trabajadores solo pueden buscar códigos, registrar retiros y
ver sus propios movimientos; todo lo demás exige rol JEFATURA (§12.4).

## Modelo de datos (hojas)

| Hoja | Contenido |
|---|---|
| `Productos` | Catálogo de productos |
| `FormatosEmpaque` | Códigos de barras, tipo (DISPLAY/CAJA/UNIDAD/OTRO) y unidades por empaque |
| `Inventario` | Stock actual en unidades por producto |
| `Movimientos` | Cabecera de cada ENTRADA / RETIRO / AJUSTE / REVERSA |
| `MovimientoDetalle` | Ítems con snapshots históricos (código, nombres, unidades por empaque, stock anterior/posterior) |
| `Usuarios` | Usuarios con rol JEFATURA o TRABAJADOR; PIN solo como hash+salt |
| `Importaciones` | Registro de cada carga masiva de catálogo |
| `HistorialCatalogo` | Trazabilidad de cambios del catálogo (campo, valor anterior/nuevo, origen) |
| `Configuracion` | Contadores de IDs y parámetros operativos |

Las columnas de códigos (`codigo_barras`, `codigo_producto`, snapshots) se
formatean como **texto plano**: se conservan ceros iniciales y nunca se
convierten a notación científica.

## Puesta en marcha

1. `clasp login` con la cuenta de Google gratuita que será dueña de los datos
   (requiere haber activado la API de Apps Script en
   [script.google.com/home/usersettings](https://script.google.com/home/usersettings)).
2. Crear el proyecto de Apps Script (backend): `clasp create-script --type
   standalone --title "Sistema Bodega Chocolateria" --rootDir src`. Guardar
   el `.clasp.json` resultante como `.clasp.prod.json` (no se versiona;
   contiene el scriptId de la cuenta de cada desarrollador — ver
   `.clasp.json.example`).
3. `node scripts/deploy.js prod "Primer despliegue"` — sube el código y crea
   la implementación web, guardando su `deploymentId` en `.clasp.prod.json`
   para que los despliegues futuros reutilicen siempre la misma URL `/exec`.
4. En el editor de Apps Script, ejecutar una vez cada una (autorizando los
   permisos que pida):
   - **`setupDatabase()`** — crea la planilla de datos en Drive con las 9
     hojas y guarda su ID. Idempotente: re-ejecutarla no borra nada.
   - **`setupCrearUsuarioJefatura(nombre, identificador, pin)`** — primer
     usuario administrador (editar los parámetros antes de ejecutar; el PIN
     se guarda solo como hash). Solo funciona si no existe otra jefatura
     activa (bootstrap único).
   - **`setupInstalarRespaldoDiario()`** — instala el respaldo diario de la
     planilla a Drive (ver [Respaldo de datos](#respaldo-de-datos-backupgs)).
   - **`runFoundationTests()`** — verifica que todo quedó bien.
5. Poner la URL `/exec` obtenida en el paso 3 dentro de `web/config.js`
   (`API_URL`).
6. Activar GitHub Pages para la carpeta `web/` (Settings → Pages → Source:
   GitHub Actions; el workflow `.github/workflows/pages.yml` publica en
   cada push a `main`). Esa URL es la que usan el PC de jefatura y los
   celulares Android.

### Actualizar el backend

```
node scripts/deploy.js prod "descripción del cambio"
```

Hace `clasp push -f` y actualiza la implementación existente (misma
`deploymentId` → misma URL `/exec`, nunca cambia). El frontend (`web/`) no
necesita este paso: se publica solo al hacer push a `main`.

### Entorno QA (opcional)

Existe soporte para un segundo proyecto de Apps Script + planilla
totalmente aislados, útil para ensayar cambios riesgosos (lógica de
movimientos, importaciones masivas) sin tocar datos reales, sin que sea
obligatorio para el flujo normal (`node scripts/deploy.js qa
"descripción"`, y `.clasp.qa.json` con el mismo formato que `.clasp.prod.json`).
En el día a día se trabaja directo en `main`; el rollback de código
(`git revert` + volver a desplegar) es rápido y confiable — ver
[D-027](docs/DECISIONES.md).

## Catálogo (Fase 2)

La administración del catálogo vive en la URL de la web app con
`?page=catalogo`. Permite:

- **CRUD manual**: crear/editar productos y formatos, activar/desactivar
  (con advertencia si hay stock o movimientos; nunca se elimina historial).
- **Plantilla**: descarga de la plantilla CSV oficial con instrucciones.
- **Importación**: cargar CSV (archivo o pegado) → validar → previsualizar
  (nuevos / a actualizar con diffs "15 → 18" / sin cambios / errores por
  fila) → confirmar. Modos: solo agregar, solo actualizar, o ambos. Los
  registros ausentes de la planilla nunca se eliminan ni desactivan.
- **Exportación**: catálogo completo a CSV, editable y reimportable.
- **Historial**: cada cambio queda con usuario, fecha, campo, valor
  anterior/nuevo y origen (manual o importación).

Reglas duras: cambiar el catálogo **jamás** modifica el stock ni los
movimientos históricos (estos guardan snapshots), y los códigos de barras se
tratan siempre como texto (se preservan ceros iniciales).

> **La planilla definitiva de la chocolatería aún no existe.** Cuando exista,
> ajustar únicamente `CONFIG.IMPORT_PLANILLA` en [src/Config.gs](src/Config.gs)
> (encabezados y obligatoriedad); la lógica de importación no cambia.

## Ingreso de mercadería (Fase 4)

La pantalla de ingreso vive en `?page=ingreso` (PC de jefatura):

- El campo de escaneo mantiene el **foco permanente**: la pistola (modo HID,
  termina con Enter) escribe directo sin tocar el mouse.
- Cada lectura agrega 1 empaque; re-escanear el mismo código suma otro. Un
  filtro de 300 ms descarta el doble disparo de una misma lectura física.
- El carro muestra empaques, unidades por empaque y total de unidades; las
  cantidades se corrigen a mano y el borrador sobrevive en el navegador si
  se cierra la pestaña (localStorage).
- **El stock no cambia hasta CONFIRMAR INGRESO**: la confirmación es la
  transacción de `movConfirmar` (tipo ENTRADA) con bloqueo y relectura.
- Código no registrado → mensaje claro y enlace al catálogo para crearlo.

## Retiro para reponer tienda (Fase 5)

La pantalla del trabajador vive en `?page=retiro` (celular Android, botones
grandes para operar de pie):

- **Flujo**: REGISTRAR RETIRO → ESCANEAR (cámara trasera) → producto
  detectado con stock disponible → carro con botones +/− → CONFIRMAR RETIRO
  → aviso "ahora retira físicamente" (§14: el registro precede al retiro
  físico).
- **Lector de códigos** en tres niveles: API nativa `BarcodeDetector` de
  Chrome Android (sin dependencias); si no existe, ZXing (open source) desde
  CDN gratuito; y siempre entrada manual del código como respaldo.
- Tras cada lectura: flash verde + vibración + sonido, y debounce de 2,5 s
  para no duplicar la misma lectura.
- **Stock insuficiente**: el servidor rechaza el retiro completo, nada
  cambia y el carro se conserva para corregir (§15).
- Código no registrado → "Producto no registrado, avisa a jefatura" (el
  trabajador no puede crear productos, §22).
- Borrador en localStorage y "Mis retiros recientes" del dispositivo
  (pasarán a filtrarse por usuario real en la Fase 7).

> Si la cámara no abre dentro del marco de Apps Script, abrir la URL de la
> aplicación directamente en Chrome (no incrustada) y conceder el permiso.

## Panel de jefatura (Fase 6)

En `?page=panel` (PC), con cuatro pestañas:

- **Dashboard**: productos activos, unidades totales en bodega, agotados y
  bajo el mínimo (clave `stock_minimo_default` en la hoja Configuracion),
  más los últimos 10 movimientos.
- **Inventario**: stock por producto con equivalencia aproximada en
  empaques ("120 unidades ≈ 8 Display 15"), búsqueda y salto directo a la
  trazabilidad.
- **Movimientos**: filtros por fecha, tipo y producto; clic en cualquier
  fila abre el detalle completo (snapshots, stock anterior → posterior).
- **Trazabilidad**: historial completo de un producto en orden cronológico,
  con el stock resultante al final.

## Validación local (desarrollo)

Requiere Node.js. Instalar dependencias una vez con `npm install` y luego:

```
npm run check   # ESLint + sintaxis V8 + pruebas locales (todo junto)
npm run lint    # solo ESLint
npm test        # solo pruebas (SelfTest.gs con mocks de servicios Google)
```

Al crear un módulo `.gs` nuevo, agregar sus funciones públicas a
`projectGlobals` en [eslint.config.js](eslint.config.js) — los archivos de
Apps Script comparten un único ámbito global y ESLint necesita conocer los
símbolos usados entre archivos.

## Dispositivos de escaneo

- **Pistola escaneadora (jefatura, PC)**: se usa en modo HID (teclado). La
  pantalla de ingreso mantiene el foco en el campo de escaneo y procesa el
  terminador Enter. (Fase 4)
- **Cámara Android (trabajador)**: lectura de códigos con librería open
  source (ZXing o equivalente) embebida en la web app, con debounce y
  confirmación visual/vibración. (Fase 5)

## Respaldo de datos (Backup.gs)

El git del código no protege los **datos reales** (stock, movimientos,
catálogo): un bug puede escribir mal antes de que se note y se revierta el
código. `Backup.gs` copia la planilla completa a la carpeta de Drive
"Respaldos - Sistema Bodega" una vez al día (~03:00), con nombre fechado, y
elimina (papelera) los respaldos con más de 14 días. Se instala una única
vez ejecutando `setupInstalarRespaldoDiario()` desde el editor (idempotente:
volver a ejecutarla no crea un segundo disparador). Complementa —no
reemplaza— el historial de versiones nativo de Google Sheets.

## Estado del proyecto

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Fundación: estructura, configuración, hojas, acceso a datos, IDs, validaciones | ✅ Completada |
| 2 | Catálogo: CRUD manual, plantilla, importación con previsualización, exportación, historial | ✅ Completada |
| 3 | Inventario: consulta y actualización segura con concurrencia | ✅ Completada |
| 4 | Ingreso de jefatura (pistola HID) | ✅ Completada |
| 5 | Retiro móvil (cámara Android) | ✅ Completada |
| 6 | Panel de jefatura: dashboard, inventario, movimientos, trazabilidad | ✅ Completada |
| 7 | Usuarios y permisos (validación en servidor) | ✅ Completada |
| 8 | Calidad: casos automatizados ✅; checklist manual en docs/PRUEBAS.md | ⚠️ Requiere dispositivos |

## Documentación adicional

- [docs/DECISIONES.md](docs/DECISIONES.md) — decisiones técnicas y su justificación.
- [docs/PRUEBAS.md](docs/PRUEBAS.md) — cobertura automatizada y checklist manual de la Fase 8.
- Documento funcional: `Sistema_Control_y_Trazabilidad_Bodega_Chocolateria.pdf`
  (análisis, reglas de negocio y flujos acordados).
