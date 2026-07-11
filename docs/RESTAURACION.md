# Runbook: restauración de respaldos (M7)

Qué hacer si la planilla de datos de producción se corrompe, se borra por
error o queda inconsistente. Léelo con calma: la restauración es reversible
y no hay que apurarse.

## Cómo funciona el respaldo

- `Backup.gs` copia **toda la planilla** de producción a la carpeta de Drive
  **"Respaldos - Sistema Bodega"** una vez al día (~03:00, hora de Chile).
- Cada copia se llama `BD - Sistema Bodega Chocolateria — respaldo AAAA-MM-DD`.
- Se conservan los **últimos 14 días**; los más antiguos pasan a la papelera
  de Drive (recuperables ~30 días más si hiciera falta).
- El sistema encuentra su base de datos por el **ID** guardado en las
  *Propiedades del script* (clave `SPREADSHEET_ID`), NO por el nombre del
  archivo. Restaurar = apuntar esa propiedad a la copia correcta.

## Restaurar (procedimiento)

1. **No borres nada todavía.** Abre Drive → carpeta "Respaldos - Sistema
   Bodega" y ubica el respaldo del día anterior al problema.
2. Abre esa copia y **verifica** que los datos se ven correctos
   (hoja Inventario, Movimientos, etc.).
3. Copia el **ID** de esa planilla desde su URL:
   `https://docs.google.com/spreadsheets/d/`**`ESTE_ID`**`/edit`.
4. En el editor de Apps Script del backend:
   **Configuración del proyecto (⚙) → Propiedades del script → editar
   `SPREADSHEET_ID`** y pega el ID de la copia. Guarda.
5. Verifica: abre el panel del sistema. El stock y los movimientos deben
   reflejar el estado del respaldo.
6. Cuando confirmes que todo está bien, esa copia **pasa a ser la base
   viva**. Conviene renombrarla a `BD - Sistema Bodega Chocolateria` para
   mantener la convención (opcional; el sistema usa el ID, no el nombre).

## Después de restaurar

- El disparador de respaldo diario sigue funcionando: al día siguiente
  copiará la nueva base viva. No hay que reinstalarlo.
- Si el problema fue un error puntual de datos (no corrupción total),
  considera en cambio **corregir con un movimiento de AJUSTE o REVERSA**
  desde el panel (pestaña Ajustes): mantiene la trazabilidad intacta y evita
  perder los movimientos posteriores al respaldo.

## Alternativa: historial de versiones de Google Sheets

Para deshacer un cambio muy reciente (p. ej. una edición manual equivocada
hace minutos), a veces es más rápido **Archivo → Historial de versiones** en
la propia planilla, sin cambiar el `SPREADSHEET_ID`. Úsalo solo para
reversiones puntuales; para corrupción amplia, usa el respaldo diario.

## Verificar que el respaldo está activo

En el editor de Apps Script, menú **Activadores (Triggers)**: debe existir
uno para `backupEjecutar_` con frecuencia diaria. Si no está, ejecuta
`setupInstalarRespaldoDiario()` una vez.
