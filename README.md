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
  Config.gs         Configuración central: hojas, columnas, roles, tipos, IDs
  Utils.gs          Utilidades puras (fechas, texto, códigos de barras, hash de PIN)
  Validation.gs     Validaciones base reutilizables
  Db.gs             Capa de acceso a datos (única que toca Sheets)
  Ids.gs            Generación de IDs únicos bajo bloqueo (PROD-0001, MOV-000001…)
  Setup.gs          Inicialización idempotente de la base de datos y primer usuario
  Code.gs           Punto de entrada web (doGet)
  SelfTest.gs       Pruebas de la fundación
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
| 2 | Catálogo: CRUD manual, plantilla, importación con previsualización, exportación, historial | Pendiente |
| 3 | Inventario: consulta y actualización segura con concurrencia | Pendiente |
| 4 | Ingreso de jefatura (pistola HID) | Pendiente |
| 5 | Retiro móvil (cámara Android) | Pendiente |
| 6 | Panel de jefatura: dashboard, movimientos, trazabilidad | Pendiente |
| 7 | Usuarios y permisos (validación en servidor) | Pendiente |
| 8 | Calidad: casos de prueba obligatorios | Pendiente |

## Documentación adicional

- [docs/DECISIONES.md](docs/DECISIONES.md) — decisiones técnicas y su justificación.
- Documento funcional: `Sistema_Control_y_Trazabilidad_Bodega_Chocolateria.pdf`
  (análisis, reglas de negocio y flujos acordados).
