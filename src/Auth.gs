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

/** Valida identificador + PIN. Devuelve { token, usuario_id, nombre, rol }. */
function authLogin_(identificador, pin) {
  identificador = utilTrim(identificador);
  pin = utilTrim(pin);
  // Mensaje único para no revelar si el identificador existe.
  var errorGenerico = 'Usuario o PIN incorrecto.';
  if (!identificador || !pin) throw new Error(errorGenerico);

  // El identificador no distingue mayúsculas ("Fran" y "fran" entran igual);
  // el PIN sí es exacto.
  var identificadorBuscado = identificador.toLowerCase();
  var usuario = dbFindOne_('USUARIOS', function (u) {
    return u.identificador_acceso.toLowerCase() === identificadorBuscado;
  });
  if (!usuario || !utilToBool(usuario.activo)) throw new Error(errorGenerico);
  if (!utilSafeEquals(usuario.pin_hash, utilHashPin(pin, usuario.pin_salt))) {
    throw new Error(errorGenerico);
  }

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

/** Borra del respaldo durable las sesiones vencidas (se ejecuta al loguear). */
function authLimpiarSesionesExpiradas_() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var ahora = Date.now();
  Object.keys(todas).forEach(function (clave) {
    if (clave.indexOf(AUTH_PREFIJO_CACHE) !== 0) return;
    try {
      var sesion = JSON.parse(todas[clave]);
      if (!sesion.exp || sesion.exp < ahora) props.deleteProperty(clave);
    } catch (e) {
      props.deleteProperty(clave);
    }
  });
}
