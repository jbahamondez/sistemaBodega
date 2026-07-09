/**
 * Usuarios.gs — Administración de usuarios (solo jefatura, vía Api.gs).
 *
 * Los usuarios nunca se eliminan: se desactivan (mismo principio que el
 * catálogo). El PIN se guarda solo como hash + salt.
 */

/** Lista usuarios sin exponer hash ni salt. */
function usuariosListar_() {
  return dbReadAll_('USUARIOS').map(function (u) {
    return {
      usuario_id: u.usuario_id,
      nombre: u.nombre,
      identificador_acceso: u.identificador_acceso,
      rol: u.rol,
      activo: u.activo,
      created_at: u.created_at
    };
  });
}

/** Crea un usuario nuevo con PIN inicial. */
function usuarioCrear_(datos) {
  var nombre = valRequireNonEmpty(datos.nombre, 'nombre');
  var identificador = valRequireNonEmpty(datos.identificador_acceso,
    'identificador de acceso').toLowerCase();
  var rol = utilTrim(datos.rol).toUpperCase();
  var pin = utilTrim(datos.pin);

  if (!valIsRol(rol)) {
    throw new Error('Rol inválido. Válidos: ' + Object.keys(CONFIG.ROLES).join(', '));
  }
  if (pin.length < 4) throw new Error('El PIN debe tener al menos 4 dígitos.');

  var existente = dbFindOne_('USUARIOS', function (u) {
    return u.identificador_acceso === identificador;
  });
  if (existente) {
    throw new Error('Ya existe un usuario con identificador "' + identificador + '".');
  }

  var salt = utilGenerateSalt();
  var ahora = utilNow();
  var usuario = {
    usuario_id: idNext_('USUARIO'),
    nombre: nombre,
    identificador_acceso: identificador,
    rol: rol,
    pin_hash: utilHashPin(pin, salt),
    pin_salt: salt,
    activo: CONFIG.BOOL.SI,
    created_at: ahora,
    updated_at: ahora
  };
  dbAppendRow_('USUARIOS', usuario);
  return { usuario_id: usuario.usuario_id, nombre: nombre,
    identificador_acceso: identificador, rol: rol };
}

/** Activa o desactiva un usuario. */
function usuarioCambiarEstado_(usuarioId, activar) {
  var usuario = dbFindById_('USUARIOS', usuarioId);
  if (!usuario) throw new Error('Usuario no encontrado: ' + usuarioId);
  dbUpdateById_('USUARIOS', usuarioId, {
    activo: utilBoolToSheet(!!activar),
    updated_at: utilNow()
  });
  return { usuario_id: usuarioId, activo: utilBoolToSheet(!!activar) };
}

/** Cambia el rol de un usuario. */
function usuarioCambiarRol_(usuarioId, rol) {
  rol = utilTrim(rol).toUpperCase();
  if (!valIsRol(rol)) {
    throw new Error('Rol inválido. Válidos: ' + Object.keys(CONFIG.ROLES).join(', '));
  }
  var usuario = dbFindById_('USUARIOS', usuarioId);
  if (!usuario) throw new Error('Usuario no encontrado: ' + usuarioId);
  dbUpdateById_('USUARIOS', usuarioId, { rol: rol, updated_at: utilNow() });
  return { usuario_id: usuarioId, rol: rol };
}

/** Restablece el PIN de un usuario (jefatura). */
function usuarioResetPin_(usuarioId, nuevoPin) {
  nuevoPin = utilTrim(nuevoPin);
  if (nuevoPin.length < 4) throw new Error('El PIN debe tener al menos 4 dígitos.');
  var usuario = dbFindById_('USUARIOS', usuarioId);
  if (!usuario) throw new Error('Usuario no encontrado: ' + usuarioId);
  var salt = utilGenerateSalt();
  dbUpdateById_('USUARIOS', usuarioId, {
    pin_hash: utilHashPin(nuevoPin, salt),
    pin_salt: salt,
    updated_at: utilNow()
  });
  return { usuario_id: usuarioId };
}
