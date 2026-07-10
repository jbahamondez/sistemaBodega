/**
 * comun.js — Sesión y comunicación con la API para todas las páginas.
 *
 * Expone window.Sesion con la MISMA interfaz que usaba la versión servida
 * por Apps Script (asegurar, api, datos, cerrar), pero implementada sobre
 * fetch() contra API_URL (config.js). Las peticiones usan Content-Type
 * text/plain para ser "simples" (sin preflight CORS, que Apps Script no
 * atiende).
 */
/* global API_URL */

(function () {
  'use strict';

  // ------------------------- overlay de login ------------------------------
  var css =
    '#sesion-overlay{position:fixed;inset:0;background:#4e342e;z-index:100;' +
    'display:none;align-items:center;justify-content:center;padding:1rem}' +
    '#sesion-overlay .caja{background:#fff;border-radius:14px;padding:1.6rem;' +
    'width:100%;max-width:360px;font-family:system-ui,sans-serif}' +
    '#sesion-overlay h2{margin:0 0 .3rem;color:#4e342e;font-size:1.2rem}' +
    '#sesion-overlay p.sub{margin:0 0 1rem;color:#757575;font-size:.85rem}' +
    '#sesion-overlay label{display:block;font-size:.85rem;color:#6d4c41;margin-bottom:.8rem}' +
    '#sesion-overlay input{width:100%;box-sizing:border-box;padding:.7rem;' +
    'font-size:1.05rem;border:1px solid #e0d7ce;border-radius:8px;margin-top:.3rem}' +
    '#sesion-overlay button{width:100%;padding:.85rem;font-size:1.05rem;font-weight:700;' +
    'background:#4e342e;color:#fff;border:none;border-radius:10px;cursor:pointer}' +
    '#sesion-overlay button:disabled{background:#bbb}' +
    '#sesion-error{color:#c62828;font-size:.88rem;min-height:1.2rem;margin:.5rem 0;white-space:pre-wrap}' +
    '#sesion-chip{position:fixed;bottom:.8rem;right:.8rem;z-index:90;background:#fff;' +
    'border:1px solid #e0d7ce;border-radius:20px;padding:.35rem .8rem;' +
    'font-family:system-ui,sans-serif;font-size:.8rem;color:#4e342e;' +
    'box-shadow:0 1px 6px rgba(0,0,0,.15);display:none}' +
    '#sesion-chip button{background:none;border:none;color:#c62828;cursor:pointer;' +
    'font-size:.8rem;padding:0 0 0 .5rem}';

  var htmlOverlay =
    '<div id="sesion-overlay"><div class="caja">' +
    '<h2>🍫 Sistema Bodega</h2><p class="sub">Identifícate para continuar</p>' +
    '<form id="sesion-form">' +
    '<label>Identificador<input id="sesion-usuario" autocomplete="username" autocapitalize="none"></label>' +
    '<label>PIN<input id="sesion-pin" type="password" inputmode="numeric" autocomplete="current-password"></label>' +
    '<div id="sesion-error"></div>' +
    '<button type="submit" id="sesion-boton">Entrar</button>' +
    '<p style="text-align:center;margin:.8rem 0 0"><a href="index.html" ' +
    'style="color:#6d4c41;font-size:.85rem">← Volver al inicio</a></p>' +
    '</form></div></div>' +
    '<div id="sesion-chip"><span id="sesion-nombre"></span>' +
    '<button type="button" id="sesion-salir">Salir</button></div>';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', htmlOverlay);

  // ------------------------------ estado -----------------------------------
  var CLAVE = 'sesion_bodega_v1';
  var datos = null;      // { token, usuario_id, nombre, rol }
  var pendiente = null;  // { rolRequerido, onListo }

  function leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); }
    catch (e) { return null; }
  }
  function guardar(d) {
    datos = d;
    try {
      if (d) localStorage.setItem(CLAVE, JSON.stringify(d));
      else localStorage.removeItem(CLAVE);
    } catch (e) { /* sin almacenamiento: la sesión vive en memoria */ }
  }

  // --------------------------- transporte HTTP -----------------------------
  function llamarServidor(fn, args, onOk, onErr) {
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args || [] })
    }).then(function (r) {
      if (!r.ok) throw new Error('Error de conexión (HTTP ' + r.status + ').');
      return r.json();
    }).then(function (res) {
      if (res.ok) onOk(res.data);
      else onErr(new Error(res.error || 'Error desconocido.'));
    }).catch(function (err) {
      onErr(err.message ? err : new Error('Sin conexión con el servidor.'));
    });
  }

  // ------------------------------- UI login --------------------------------
  function mostrarLogin(mensajeError) {
    document.getElementById('sesion-overlay').style.display = 'flex';
    document.getElementById('sesion-chip').style.display = 'none';
    document.getElementById('sesion-error').textContent = mensajeError || '';
    setTimeout(function () { document.getElementById('sesion-usuario').focus(); }, 100);
  }
  function ocultarLogin() {
    document.getElementById('sesion-overlay').style.display = 'none';
    document.getElementById('sesion-chip').style.display = '';
    document.getElementById('sesion-nombre').textContent =
      datos.nombre + ' (' + datos.rol + ')';
  }
  function completar() {
    if (pendiente.rolRequerido && datos.rol !== pendiente.rolRequerido) {
      // La sesión NO se borra: no tener el rol de una pantalla no es un
      // problema de sesión. Se ofrece volver o entrar con otra cuenta.
      mostrarLogin('Tu usuario (' + datos.rol + ') no tiene acceso a esta ' +
        'pantalla (requiere ' + pendiente.rolRequerido + '). Vuelve al ' +
        'inicio o entra con otra cuenta.');
      return;
    }
    ocultarLogin();
    pendiente.onListo(datos);
  }

  document.getElementById('sesion-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var boton = document.getElementById('sesion-boton');
    boton.disabled = true;
    llamarServidor('apiLogin', [
      document.getElementById('sesion-usuario').value,
      document.getElementById('sesion-pin').value
    ], function (r) {
      boton.disabled = false;
      document.getElementById('sesion-pin').value = '';
      guardar(r);
      completar();
    }, function (err) {
      boton.disabled = false;
      document.getElementById('sesion-error').textContent = err.message;
    });
  });
  document.getElementById('sesion-salir').addEventListener('click', function () {
    window.Sesion.cerrar();
  });

  // ------------------- teclado móvil: ocultar al tocar fuera ---------------
  // Tocar un campo despliega el teclado (comportamiento nativo). Tocar
  // CUALQUIER otra parte de la pantalla quita el foco del campo activo, lo
  // que esconde el teclado. Los campos con data-mantener-foco (p. ej. el
  // campo de la pistola en el ingreso) quedan exentos.
  document.addEventListener('touchstart', function (ev) {
    var activo = document.activeElement;
    if (!activo || !/^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName)) return;
    if (activo.hasAttribute('data-mantener-foco')) return;
    var destino = ev.target;
    if (destino.closest && destino.closest('input, textarea, select, label')) return;
    activo.blur();
  }, { passive: true });

  // ----------------------------- API pública -------------------------------
  window.Sesion = {
    /** Garantiza sesión válida (y rol, si se exige) antes de ejecutar onListo. */
    asegurar: function (rolRequerido, onListo) {
      pendiente = { rolRequerido: rolRequerido, onListo: onListo };
      var guardada = leer();
      if (!guardada || !guardada.token) { mostrarLogin(''); return; }
      llamarServidor('apiSesionInfo', [guardada.token], function (info) {
        guardar({ token: guardada.token, usuario_id: info.usuario_id,
          nombre: info.nombre, rol: info.rol });
        completar();
      }, function (err) {
        var msg = (err && err.message) || '';
        // Solo se descarta la sesión si el SERVIDOR dice que es inválida.
        // Un error transitorio (red, servidor lento) no borra nada: se pide
        // reintentar y la sesión guardada sigue disponible.
        if (msg.indexOf('Sesión expirada') !== -1 || msg.indexOf('inactivo') !== -1) {
          guardar(null);
          mostrarLogin('');
          return;
        }
        mostrarLogin('No se pudo verificar la sesión (' + msg +
          '). Revisa tu conexión y recarga la página, o vuelve a entrar.');
      });
    },

    /** Llama a una función api* anteponiendo el token de la sesión. */
    api: function (fn, args, onOk, onErr) {
      llamarServidor(fn, [datos ? datos.token : ''].concat(args || []),
        onOk,
        function (err) {
          if (err.message && err.message.indexOf('Sesión expirada') !== -1) {
            guardar(null);
            mostrarLogin('La sesión expiró. Vuelve a entrar.');
            return;
          }
          if (onErr) onErr(err); else alert('Error: ' + err.message);
        });
    },

    datos: function () { return datos; },

    cerrar: function () {
      var token = datos && datos.token;
      guardar(null);
      if (token) {
        llamarServidor('apiLogout', [token],
          function () { location.reload(); },
          function () { location.reload(); });
      } else {
        location.reload();
      }
    }
  };
})();
