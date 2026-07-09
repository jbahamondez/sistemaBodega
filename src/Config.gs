/**
 * Config.gs — Configuración central del sistema.
 *
 * Única fuente de verdad para nombres de hojas, columnas, roles, tipos y
 * constantes. Ningún otro módulo debe hardcodear nombres de hojas o columnas.
 */

var CONFIG = {

  /** Nombre del archivo de Google Sheets que actúa como base de datos. */
  SPREADSHEET_NAME: 'BD - Sistema Bodega Chocolateria',

  /** Clave en Script Properties donde se guarda el ID del spreadsheet. */
  PROP_SPREADSHEET_ID: 'SPREADSHEET_ID',

  /** Zona horaria operativa (coincide con appsscript.json). */
  TIMEZONE: 'America/Santiago',

  /**
   * Definición de cada hoja: nombre, columnas en orden y columnas que deben
   * formatearse como texto plano (códigos de barras, códigos de producto,
   * hashes) para que Sheets nunca los convierta a número, notación
   * científica ni les elimine ceros iniciales.
   */
  SHEETS: {
    PRODUCTOS: {
      name: 'Productos',
      idColumn: 'producto_id',
      columns: ['producto_id', 'codigo_producto', 'nombre', 'categoria',
                'descripcion', 'activo', 'created_at', 'updated_at'],
      textColumns: ['producto_id', 'codigo_producto']
    },
    FORMATOS_EMPAQUE: {
      name: 'FormatosEmpaque',
      idColumn: 'formato_id',
      columns: ['formato_id', 'producto_id', 'codigo_barras', 'nombre_formato',
                'tipo_empaque', 'unidades_por_empaque', 'activo',
                'created_at', 'updated_at'],
      textColumns: ['formato_id', 'producto_id', 'codigo_barras']
    },
    INVENTARIO: {
      name: 'Inventario',
      idColumn: 'producto_id',
      columns: ['producto_id', 'stock_unidades', 'updated_at', 'updated_by'],
      textColumns: ['producto_id', 'updated_by']
    },
    MOVIMIENTOS: {
      name: 'Movimientos',
      idColumn: 'movimiento_id',
      columns: ['movimiento_id', 'tipo', 'estado', 'usuario_id',
                'usuario_nombre_snapshot', 'fecha_hora', 'origen', 'destino',
                'observacion', 'total_formatos', 'total_empaques',
                'total_unidades'],
      textColumns: ['movimiento_id', 'usuario_id']
    },
    MOVIMIENTO_DETALLE: {
      name: 'MovimientoDetalle',
      idColumn: 'detalle_id',
      columns: ['detalle_id', 'movimiento_id', 'producto_id', 'formato_id',
                'codigo_barras_snapshot', 'producto_nombre_snapshot',
                'formato_nombre_snapshot', 'cantidad_empaques',
                'unidades_por_empaque_snapshot', 'total_unidades',
                'stock_anterior', 'stock_posterior'],
      textColumns: ['detalle_id', 'movimiento_id', 'producto_id', 'formato_id',
                    'codigo_barras_snapshot']
    },
    USUARIOS: {
      name: 'Usuarios',
      idColumn: 'usuario_id',
      columns: ['usuario_id', 'nombre', 'identificador_acceso', 'rol',
                'pin_hash', 'pin_salt', 'activo', 'created_at', 'updated_at'],
      textColumns: ['usuario_id', 'identificador_acceso', 'pin_hash', 'pin_salt']
    },
    IMPORTACIONES: {
      name: 'Importaciones',
      idColumn: 'importacion_id',
      columns: ['importacion_id', 'fecha_hora', 'usuario_id', 'nombre_archivo',
                'cantidad_filas', 'creados', 'actualizados', 'sin_cambios',
                'errores', 'estado'],
      textColumns: ['importacion_id', 'usuario_id']
    },
    HISTORIAL_CATALOGO: {
      name: 'HistorialCatalogo',
      idColumn: 'historial_id',
      columns: ['historial_id', 'fecha_hora', 'usuario_id', 'entidad',
                'entidad_id', 'campo', 'valor_anterior', 'valor_nuevo',
                'origen'],
      textColumns: ['historial_id', 'usuario_id', 'entidad_id',
                    'valor_anterior', 'valor_nuevo']
    },
    CONFIGURACION: {
      name: 'Configuracion',
      idColumn: 'clave',
      columns: ['clave', 'valor'],
      textColumns: ['clave']
    }
  },

  /** Roles de usuario. */
  ROLES: {
    JEFATURA: 'JEFATURA',
    TRABAJADOR: 'TRABAJADOR'
  },

  /** Tipos de movimiento de inventario. */
  TIPOS_MOVIMIENTO: {
    ENTRADA: 'ENTRADA',
    RETIRO: 'RETIRO',
    AJUSTE: 'AJUSTE',
    REVERSA: 'REVERSA'
  },

  /**
   * Estados de un movimiento. La confirmación escribe primero la cabecera en
   * EN_PROCESO, luego los detalles y el inventario, y al final marca
   * CONFIRMADO. Un movimiento que quede EN_PROCESO por un fallo intermedio es
   * detectable y no cuenta como confirmado.
   */
  ESTADOS_MOVIMIENTO: {
    EN_PROCESO: 'EN_PROCESO',
    CONFIRMADO: 'CONFIRMADO'
  },

  /** Tipos de empaque válidos. */
  TIPOS_EMPAQUE: {
    DISPLAY: 'DISPLAY',
    CAJA: 'CAJA',
    UNIDAD: 'UNIDAD',
    OTRO: 'OTRO'
  },

  /** Orígenes de cambios en el catálogo. */
  ORIGENES_CAMBIO: {
    EDICION_MANUAL: 'EDICION_MANUAL',
    IMPORTACION_PLANILLA: 'IMPORTACION_PLANILLA'
  },

  /** Valores usados en columnas booleanas de las hojas. */
  BOOL: {
    SI: 'SI',
    NO: 'NO'
  },

  /**
   * Prefijos y contadores para IDs legibles y estables.
   * counterKey es la clave usada en la hoja Configuracion.
   */
  IDS: {
    PRODUCTO:    { prefix: 'PROD', counterKey: 'contador_producto',    padding: 4 },
    FORMATO:     { prefix: 'FMT',  counterKey: 'contador_formato',     padding: 4 },
    MOVIMIENTO:  { prefix: 'MOV',  counterKey: 'contador_movimiento',  padding: 6 },
    DETALLE:     { prefix: 'DET',  counterKey: 'contador_detalle',     padding: 6 },
    USUARIO:     { prefix: 'USR',  counterKey: 'contador_usuario',     padding: 3 },
    IMPORTACION: { prefix: 'IMP',  counterKey: 'contador_importacion', padding: 4 },
    HISTORIAL:   { prefix: 'HIST', counterKey: 'contador_historial',   padding: 6 }
  },

  /** Configuración operativa inicial sembrada en la hoja Configuracion. */
  DEFAULTS: {
    stock_minimo_default: '10',
    version_esquema: '1'
  },

  /** Milisegundos máximos de espera por el bloqueo de escritura. */
  LOCK_TIMEOUT_MS: 30000
};
