/**
 * Usuarios.gs — Administración de usuarios (solo jefatura, vía Api.gs).
 *
 * Los usuarios nunca se eliminan: se desactivan (mismo principio que el
 * catálogo). El PIN se guarda solo como hash + salt.
 */

/**
 * ¿El identificador ya lo usa otro usuario? Comparación sin distinguir
 * mayúsculas: "Fran" y "fran" son el mismo identificador de login.
 */
function usuarioIdentificadorEnUso_(identificador, usuarioIdExcluido) {
  var buscado = utilTrim(identificador).toLowerCase();
  return dbFindOne_('USUARIOS', function (u) {
    return u.identificador_acceso.toLowerCase() === buscado &&
           u.usuario_id !== usuarioIdExcluido;
  }) !== null;
}

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
  // El identificador CONSERVA las mayúsculas tal como se escribió; el login
  // y la unicidad lo comparan sin distinguirlas (usuarioIdentificadorEnUso_).
  var identificador = valRequireNonEmpty(datos.identificador_acceso,
    'identificador de acceso');
  var rol = utilTrim(datos.rol).toUpperCase();
  var pin = utilTrim(datos.pin);

  if (!valIsRol(rol)) {
    throw new Error('Rol inválido. Válidos: ' + Object.keys(CONFIG.ROLES).join(', '));
  }
  if (pin.length < 6) throw new Error('El PIN debe tener al menos 6 dígitos.');

  return dbConLock_(function () { // unicidad + escritura atómicas (A5)
    if (usuarioIdentificadorEnUso_(identificador, null)) {
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
  });
}

/** Edita nombre y/o identificador de acceso de un usuario. */
function usuarioEditar_(usuarioId, patch) {
  var usuario = dbFindById_('USUARIOS', usuarioId);
  if (!usuario) throw new Error('Usuario no encontrado: ' + usuarioId);

  var cambios = {};
  if (patch.nombre !== undefined && utilTrim(patch.nombre) !== usuario.nombre) {
    cambios.nombre = valRequireNonEmpty(patch.nombre, 'nombre');
  }
  if (patch.identificador_acceso !== undefined) {
    // Se conservan las mayúsculas tal como se escriben ("Fran" queda "Fran");
    // la unicidad y el login no distinguen mayúsculas.
    var identificador = utilTrim(patch.identificador_acceso);
    if (identificador !== usuario.identificador_acceso) {
      valRequireNonEmpty(identificador, 'identificador de acceso');
      if (usuarioIdentificadorEnUso_(identificador, usuario.usuario_id)) {
        throw new Error('Ya existe un usuario con identificador "' + identificador + '".');
      }
      cambios.identificador_acceso = identificador;
    }
  }
  if (Object.keys(cambios).length === 0) {
    return { usuario_id: usuarioId, sin_cambios: true };
  }
  cambios.updated_at = utilNow();
  dbUpdateById_('USUARIOS', usuarioId, cambios);
  return { usuario_id: usuarioId, sin_cambios: false };
}

/**
 * Elimina físicamente un usuario SOLO si nunca registró movimientos (p. ej.
 * creado por error con un dato equivocado). Si tiene movimientos, se niega
 * y sugiere desactivarlo: la trazabilidad exige conservar al responsable
 * de cada operación (§16).
 */
function usuarioEliminar_(usuarioId) {
  var usuario = dbFindById_('USUARIOS', usuarioId);
  if (!usuario) throw new Error('Usuario no encontrado: ' + usuarioId);

  var tieneMovimientos = dbFindOne_('MOVIMIENTOS', function (m) {
    return m.usuario_id === usuario.usuario_id;
  });
  if (tieneMovimientos) {
    throw new Error(
      'Este usuario tiene movimientos registrados y no puede eliminarse ' +
      '(la trazabilidad conserva al responsable de cada operación). ' +
      'Desactívalo en su lugar.');
  }
  dbDeleteRowByIndex_('USUARIOS', usuario._rowIndex);
  return { usuario_id: usuarioId, eliminado: true };
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
  if (nuevoPin.length < 6) throw new Error('El PIN debe tener al menos 6 dígitos.');
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
