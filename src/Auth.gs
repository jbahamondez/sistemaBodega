/**
 * Auth.gs — Autenticación por identificador + PIN y sesiones por token.
 *
 * El login genera un token aleatorio guardado en CacheService (6 horas).
 * El cliente lo envía en cada llamada a la capa Api.gs, que valida usuario
 * activo y rol EN EL SERVIDOR antes de cada operación (§24: no basta con
 * ocultar botones).
 *
 * El PIN nunca viaja ni se guarda en claro: solo hash SHA-256 + salt.
 */

var AUTH_TTL_SEGUNDOS = 21600; // 6 horas (máximo de CacheService)
var AUTH_PREFIJO_CACHE = 'sesion_';

/** Valida identificador + PIN. Devuelve { token, usuario_id, nombre, rol }. */
function authLogin_(identificador, pin) {
  identificador = utilTrim(identificador);
  pin = utilTrim(pin);
  // Mensaje único para no revelar si el identificador existe.
  var errorGenerico = 'Usuario o PIN incorrecto.';
  if (!identificador || !pin) throw new Error(errorGenerico);

  var usuario = dbFindOne_('USUARIOS', function (u) {
    return u.identificador_acceso === identificador;
  });
  if (!usuario || !utilToBool(usuario.activo)) throw new Error(errorGenerico);
  if (!utilSafeEquals(usuario.pin_hash, utilHashPin(pin, usuario.pin_salt))) {
    throw new Error(errorGenerico);
  }

  var token = Utilities.getUuid();
  CacheService.getScriptCache()
    .put(AUTH_PREFIJO_CACHE + token, usuario.usuario_id, AUTH_TTL_SEGUNDOS);
  return {
    token: token,
    usuario_id: usuario.usuario_id,
    nombre: usuario.nombre,
    rol: usuario.rol
  };
}

/** Cierra la sesión asociada al token. */
function authLogout_(token) {
  CacheService.getScriptCache().remove(AUTH_PREFIJO_CACHE + utilTrim(token));
}

/**
 * Valida un token de sesión y, opcionalmente, un rol requerido.
 * Devuelve la fila del usuario o lanza Error con mensaje claro.
 * Se ejecuta al inicio de CADA función de Api.gs.
 */
function authValidar_(token, rolRequerido) {
  var usuarioId = CacheService.getScriptCache()
    .get(AUTH_PREFIJO_CACHE + utilTrim(token));
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
