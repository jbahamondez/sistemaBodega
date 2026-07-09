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
| Interfaz | Web responsive (HtmlService) | Pantallas de jefatura (PC) y trabajador (Android) |
| Lógica | Google Apps Script (V8) | Validaciones, conversiones, concurrencia, autorización |
| Datos | Google Sheets | Almacenamiento estructurado (9 hojas) |
| Archivos | Google Drive | Alojamiento del archivo de datos y respaldos |

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
  IngresoUi.html    Pantalla de ingreso para jefatura (pistola HID, PC)
  RetiroUi.html     Pantalla de retiro para trabajador (cámara, Android)
  Panel.gs          Agregados del dashboard (totales, alertas de stock)
  PanelUi.html      Panel de jefatura (dashboard, inventario, movimientos, trazabilidad)
  CatalogoUi.html   Interfaz de administración del catálogo (jefatura, PC)
  Code.gs           Punto de entrada web (doGet + routing)
  SelfTest.gs       Pruebas (ejecutables en el editor y localmente con npm test)
```

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

1. Crear un proyecto en [script.google.com](https://script.google.com) con la
   cuenta de Google gratuita que será dueña de los datos.
2. Copiar los archivos de `src/` al proyecto (manualmente o con
   [clasp](https://github.com/google/clasp): copiar `.clasp.json.example` a
   `.clasp.json`, completar el `scriptId` y ejecutar `clasp push`).
3. En el editor de Apps Script, ejecutar **`setupDatabase()`** una vez.
   Crea el archivo "BD - Sistema Bodega Chocolateria" en Drive con las 9
   hojas y guarda su ID en Script Properties. Es idempotente: re-ejecutarla
   no borra nada.
4. Ejecutar **`setupCrearUsuarioJefatura(nombre, identificador, pin)`** para
   crear el primer usuario administrador (editar los parámetros antes de
   ejecutar; el PIN se guarda solo como hash).
5. Ejecutar **`runFoundationTests()`** para verificar la fundación.
6. Publicar: *Implementar → Nueva implementación → Aplicación web*.
   La URL resultante se usa desde el PC de jefatura y los celulares Android.

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

## Estado del proyecto

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Fundación: estructura, configuración, hojas, acceso a datos, IDs, validaciones | ✅ Completada |
| 2 | Catálogo: CRUD manual, plantilla, importación con previsualización, exportación, historial | ✅ Completada |
| 3 | Inventario: consulta y actualización segura con concurrencia | ✅ Completada |
| 4 | Ingreso de jefatura (pistola HID) | ✅ Completada |
| 5 | Retiro móvil (cámara Android) | ✅ Completada |
| 6 | Panel de jefatura: dashboard, inventario, movimientos, trazabilidad | ✅ Completada |
| 7 | Usuarios y permisos (validación en servidor) | Pendiente |
| 8 | Calidad: casos de prueba obligatorios | Pendiente |

## Documentación adicional

- [docs/DECISIONES.md](docs/DECISIONES.md) — decisiones técnicas y su justificación.
- Documento funcional: `Sistema_Control_y_Trazabilidad_Bodega_Chocolateria.pdf`
  (análisis, reglas de negocio y flujos acordados).
