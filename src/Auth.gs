/**
 * Auth.gs — Autenticación por identificador + PIN y sesiones por token.
 *
 * El login genera un token aleatorio. La sesión se guarda en DOS lugares:
 * CacheService (rápido, pero Google puede purgar entradas en cualquier
 * momento) y PropertiesService (durable). Si la caché pierde la entrada, la
 * validación la restaura desde el respaldo durable — así una purga de caché
 * no desloguea a los usuarios (D-025).
 *
 * El PIN nunca viaja ni se guarda en claro: solo hash SHA-256 + salt.
 */

var AUTH_TTL_SEGUNDOS = 21600; // 6 horas
var AUTH_PREFIJO_CACHE = 'sesion_';
var AUTH_PREFIJO_INTENTOS = 'intentos_';
var AUTH_MAX_INTENTOS = 5;          // fallos consecutivos antes de bloquear
var AUTH_BLOQUEO_MS = 15 * 60 * 1000; // 15 minutos de bloqueo

/**
 * Valida identificador + PIN. Devuelve { token, usuario_id, nombre, rol }.
 *
 * Anti fuerza bruta (auditoría C1): la URL de la API es pública y el login
 * es anónimo, así que un PIN corto sería adivinable por enumeración. Cada
 * identificador acumula fallos consecutivos; al llegar a AUTH_MAX_INTENTOS
 * se bloquea por AUTH_BLOQUEO_MS. El bloqueo aplica igual a identificadores
 * inexistentes para no revelar cuáles existen.
 */
function authLogin_(identificador, pin) {
  identificador = utilTrim(identificador);
  pin = utilTrim(pin);
  // Mensaje único para no revelar si el identificador existe.
  var errorGenerico = 'Usuario o PIN incorrecto.';
  if (!identificador || !pin) throw new Error(errorGenerico);

  var claveIntentos = AUTH_PREFIJO_INTENTOS + identificador.toLowerCase();
  authVerificarBloqueo_(claveIntentos);

  // El identificador no distingue mayúsculas ("Fran" y "fran" entran igual);
  // el PIN sí es exacto.
  var identificadorBuscado = identificador.toLowerCase();
  var usuario = dbFindOne_('USUARIOS', function (u) {
    return u.identificador_acceso.toLowerCase() === identificadorBuscado;
  });
  var pinCorrecto = usuario &&
    utilSafeEquals(usuario.pin_hash, utilHashPin(pin, usuario.pin_salt));
  if (!usuario || !utilToBool(usuario.activo) || !pinCorrecto) {
    authRegistrarFallo_(claveIntentos);
    throw new Error(errorGenerico);
  }

  PropertiesService.getScriptProperties().deleteProperty(claveIntentos);
  authLimpiarSesionesExpiradas_();

  var token = Utilities.getUuid();
  authGuardarSesion_(token, usuario.usuario_id);
  return {
    token: token,
    usuario_id: usuario.usuario_id,
    nombre: usuario.nombre,
    rol: usuario.rol
  };
}

/** Lanza error si el identificador está bloqueado por exceso de fallos. */
function authVerificarBloqueo_(claveIntentos) {
  var crudo = PropertiesService.getScriptProperties().getProperty(claveIntentos);
  if (!crudo) return;
  try {
    var registro = JSON.parse(crudo);
    if (registro.n >= AUTH_MAX_INTENTOS) {
      var restanteMs = registro.t + AUTH_BLOQUEO_MS - Date.now();
      if (restanteMs > 0) {
        throw new Error('Demasiados intentos fallidos. Espera ' +
          Math.ceil(restanteMs / 60000) + ' minuto(s) e intenta de nuevo.');
      }
      // Bloqueo vencido: se limpia y se permite intentar otra vez.
      PropertiesService.getScriptProperties().deleteProperty(claveIntentos);
    }
  } catch (e) {
    if (e.message && e.message.indexOf('Demasiados intentos') === 0) throw e;
    // Registro corrupto: se descarta sin bloquear.
    PropertiesService.getScriptProperties().deleteProperty(claveIntentos);
  }
}

/** Suma un fallo de login al contador del identificador. */
function authRegistrarFallo_(claveIntentos) {
  var props = PropertiesService.getScriptProperties();
  var n = 0;
  try {
    var previo = JSON.parse(props.getProperty(claveIntentos) || 'null');
    // Los fallos antiguos (fuera de la ventana de bloqueo) no cuentan.
    if (previo && Date.now() - previo.t < AUTH_BLOQUEO_MS) n = previo.n;
  } catch (e) { /* contador corrupto: se reinicia */ }
  props.setProperty(claveIntentos, JSON.stringify({ n: n + 1, t: Date.now() }));
}

/** Cierra la sesión asociada al token (caché y respaldo durable). */
function authLogout_(token) {
  var clave = AUTH_PREFIJO_CACHE + utilTrim(token);
  CacheService.getScriptCache().remove(clave);
  PropertiesService.getScriptProperties().deleteProperty(clave);
}

/**
 * Valida un token de sesión y, opcionalmente, un rol requerido.
 * Devuelve la fila del usuario o lanza Error con mensaje claro.
 * Se ejecuta al inicio de CADA función de Api.gs.
 */
function authValidar_(token, rolRequerido) {
  var usuarioId = authResolverUsuarioId_(token);
  if (!usuarioId) {
    throw new Error('Sesión expirada o inválida. Vuelve a iniciar sesión.');
  }
  var usuario = dbFindById_('USUARIOS', usuarioId);
  if (!usuario || !utilToBool(usuario.activo)) {
    throw new Error('Usuario inactivo. Contacta a jefatura.');
  }
  if (rolRequerido && usuario.rol !== rolRequerido) {
    throw new Error('No autorizado: esta operación requiere rol ' + rolRequerido + '.');
  }
  return usuario;
}

// ---------------------------------------------------------------------------
// Internas
// ---------------------------------------------------------------------------

/** Guarda la sesión en caché (rápido) y en propiedades (durable). */
function authGuardarSesion_(token, usuarioId) {
  var clave = AUTH_PREFIJO_CACHE + token;
  var expira = Date.now() + AUTH_TTL_SEGUNDOS * 1000;
  CacheService.getScriptCache().put(clave, usuarioId, AUTH_TTL_SEGUNDOS);
  PropertiesService.getScriptProperties().setProperty(clave,
    JSON.stringify({ uid: usuarioId, exp: expira }));
}

/**
 * Resuelve el usuario de un token: primero caché; si la caché fue purgada,
 * respaldo durable (y se vuelve a llenar la caché con el TTL restante).
 * Devuelve null si el token no existe o expiró.
 */
function authResolverUsuarioId_(token) {
  var clave = AUTH_PREFIJO_CACHE + utilTrim(token);
  var uid = CacheService.getScriptCache().get(clave);
  if (uid) return uid;

  var crudo = PropertiesService.getScriptProperties().getProperty(clave);
  if (!crudo) return null;
  try {
    var sesion = JSON.parse(crudo);
    if (!sesion.exp || sesion.exp < Date.now()) {
      PropertiesService.getScriptProperties().deleteProperty(clave);
      return null;
    }
    var restanteSegundos = Math.floor((sesion.exp - Date.now()) / 1000);
    CacheService.getScriptCache().put(clave, sesion.uid,
      Math.max(60, Math.min(restanteSegundos, AUTH_TTL_SEGUNDOS)));
    return sesion.uid;
  } catch (e) {
    return null;
  }
}

/**
 * Borra del respaldo durable las sesiones vencidas y los contadores de
 * intentos ya irrelevantes (se ejecuta al loguear).
 */
function authLimpiarSesionesExpiradas_() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var ahora = Date.now();
  Object.keys(todas).forEach(function (clave) {
    if (clave.indexOf(AUTH_PREFIJO_CACHE) === 0) {
      try {
        var sesion = JSON.parse(todas[clave]);
        if (!sesion.exp || sesion.exp < ahora) props.deleteProperty(clave);
      } catch (e) {
        props.deleteProperty(clave);
      }
      return;
    }
    if (clave.indexOf(AUTH_PREFIJO_INTENTOS) === 0) {
      try {
        var registro = JSON.parse(todas[clave]);
        if (!registro.t || ahora - registro.t > AUTH_BLOQUEO_MS) {
          props.deleteProperty(clave);
        }
      } catch (e) {
        props.deleteProperty(clave);
      }
    }
  });
}
