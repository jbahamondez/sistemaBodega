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

  /**
   * Confirma la sesión con el servidor (rol vigente) y actualiza `datos` +
   * el respaldo en localStorage. Sin efectos de UI: quien la llama decide
   * qué mostrar. onOk() se invoca con `datos` ya actualizado; onErr(mensaje)
   * solo cuando corresponde limpiar la sesión o avisar de un problema real
   * (nunca por un simple corte de red, D-025).
   */
  function confirmarConServidor(token, onOk, onErr) {
    llamarServidor('apiSesionInfo', [token], function (info) {
      datos = { token: token, usuario_id: info.usuario_id,
        nombre: info.nombre, rol: info.rol, validada: Date.now() };
      guardar(datos);
      onOk();
    }, function (err) {
      var msg = (err && err.message) || '';
      if (msg.indexOf('Sesión expirada') !== -1 || msg.indexOf('inactivo') !== -1) {
        guardar(null);
        onErr('La sesión expiró. Vuelve a entrar.');
      } else {
        onErr('No se pudo verificar tu acceso (' + msg + '). ' +
          'Revisa tu conexión y recarga la página.');
      }
    });
  }

  /**
   * Overlay "verificando…" para asegurarRolConfirmado: evita mostrar la
   * página en blanco mientras se confirma el rol con el servidor.
   */
  function mostrarVerificando() {
    var el = document.getElementById('sesion-overlay');
    el.style.display = 'flex';
    document.getElementById('sesion-form').style.display = 'none';
    if (!document.getElementById('sesion-verificando')) {
      document.querySelector('#sesion-overlay .caja').insertAdjacentHTML('beforeend',
        '<p id="sesion-verificando" style="text-align:center;color:#757575;' +
        'font-size:.9rem;margin:0">Verificando acceso…</p>');
    }
    document.getElementById('sesion-verificando').style.display = 'block';
    document.getElementById('sesion-chip').style.display = 'none';
  }
  function ocultarVerificando() {
    document.getElementById('sesion-form').style.display = '';
    var v = document.getElementById('sesion-verificando');
    if (v) v.style.display = 'none';
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
      r.validada = Date.now();
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
    /**
     * Sesión OPTIMISTA (rendimiento): la página se pinta de inmediato con
     * la sesión guardada, sin esperar un viaje al servidor. La seguridad no
     * depende de esto: CADA operación de datos valida el token en el
     * servidor de todos modos; si la sesión murió, la primera llamada
     * responde "Sesión expirada" y aparece el login. Si la última
     * validación es antigua, se revalida en segundo plano sin bloquear.
     */
    asegurar: function (rolRequerido, onListo) {
      pendiente = { rolRequerido: rolRequerido, onListo: onListo };
      var guardada = leer();
      if (!guardada || !guardada.token) { mostrarLogin(''); return; }
      datos = guardada;
      completar();

      var VALIDEZ_MS = 10 * 60 * 1000; // revalidar como máximo cada 10 min
      if (guardada.validada && Date.now() - guardada.validada < VALIDEZ_MS) return;
      llamarServidor('apiSesionInfo', [guardada.token], function (info) {
        guardar({ token: guardada.token, usuario_id: info.usuario_id,
          nombre: info.nombre, rol: info.rol, validada: Date.now() });
      }, function (err) {
        var msg = (err && err.message) || '';
        // Solo se descarta la sesión si el SERVIDOR dice que es inválida;
        // los errores transitorios de red no borran nada.
        if (msg.indexOf('Sesión expirada') !== -1 || msg.indexOf('inactivo') !== -1) {
          guardar(null);
          mostrarLogin('La sesión expiró. Vuelve a entrar.');
        }
      });
    },

    /**
     * Verificación de rol SIN optimismo: nunca decide con el dato guardado
     * en el navegador (podría estar desactualizado, p. ej. si el rol
     * cambió después de iniciar sesión, o si el dispositivo se usó antes
     * con otra cuenta). Muestra "Verificando acceso…" y confirma con el
     * servidor antes de mostrar la página o el aviso de "no autorizado" —
     * una sola decisión, sin destello de contenido indebido. USA ESTO en
     * pantallas ENTERAS restringidas por rol (Panel, Catálogo, Ingreso):
     * si el rol confirmado no coincide, la página completa se rechaza.
     */
    asegurarRolConfirmado: function (rolRequerido, onListo) {
      pendiente = { rolRequerido: rolRequerido, onListo: onListo };
      var guardada = leer();
      if (!guardada || !guardada.token) { mostrarLogin(''); return; }
      mostrarVerificando();
      confirmarConServidor(guardada.token, function () {
        ocultarVerificando();
        completar();
      }, function (mensaje) {
        ocultarVerificando();
        mostrarLogin(mensaje);
      });
    },

    /**
     * Verificación de rol SIN efectos en la UI de sesión (sin overlay, sin
     * mensajes de error): confirma con el servidor y ejecuta onEsRol() SOLO
     * si el rol confirmado coincide; si no coincide o falla, simplemente no
     * hace nada. USA ESTO para decisiones parciales dentro de una página
     * abierta a cualquier rol (p. ej. mostrar accesos de administración en
     * el inicio) — nunca para bloquear la página completa.
     */
    confirmarRolPara: function (rolBuscado, onEsRol) {
      var guardada = leer();
      if (!guardada || !guardada.token) return;
      confirmarConServidor(guardada.token, function () {
        if (datos.rol === rolBuscado) onEsRol();
      }, function () { /* silencioso: no se muestra ni se decide nada */ });
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

/**
 * window.Ui — modales y avisos propios del sistema (temática del navbar),
 * en reemplazo de alert/confirm/prompt del navegador.
 *
 *   Ui.toast(mensaje, 'ok'|'err')                — aviso flotante temporal.
 *   Ui.confirmar(titulo, mensaje, onConfirmar)   — modal Sí/Cancelar.
 *   Ui.formulario(titulo, campos, onGuardar)     — modal con inputs.
 *     campos: [{ id, label, valor, tipo ('text'|'password'), ayuda }]
 *     onGuardar(valores) recibe { id: valorEscrito, ... }.
 */
window.Ui = (function () {
  'use strict';

  var css =
    '#ui-modal{position:fixed;inset:0;background:rgba(30,20,15,.55);z-index:120;' +
    'display:none;align-items:center;justify-content:center;padding:1rem}' +
    '#ui-modal .caja{background:#fff;border-radius:14px;width:100%;max-width:420px;' +
    'overflow:hidden;font-family:system-ui,sans-serif;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.35);animation:ui-pop .16s ease-out}' +
    '@keyframes ui-pop{from{transform:scale(.94);opacity:0}to{transform:scale(1);opacity:1}}' +
    '#ui-modal .cabecera{background:linear-gradient(135deg,#3e2723 0%,#4e342e 55%,#5d4037 100%);' +
    'color:#fff;padding:.85rem 1.2rem;display:flex;align-items:center;gap:.6rem}' +
    '#ui-modal .cabecera .icono{font-size:1.15rem;background:rgba(255,255,255,.12);' +
    'border-radius:8px;width:2rem;height:2rem;display:flex;align-items:center;justify-content:center}' +
    '#ui-modal .cabecera strong{font-size:1rem}' +
    '#ui-modal .cuerpo{padding:1.1rem 1.2rem;color:#2b2b2b;font-size:.92rem;line-height:1.45}' +
    '#ui-modal label{display:block;font-size:.82rem;color:#6d4c41;margin-bottom:.75rem}' +
    '#ui-modal input{width:100%;box-sizing:border-box;padding:.6rem .7rem;font-size:1rem;' +
    'border:1px solid #e0d7ce;border-radius:8px;margin-top:.25rem}' +
    '#ui-modal input:focus{outline:none;border-color:#5d4037;box-shadow:0 0 0 3px rgba(93,64,55,.15)}' +
    '#ui-modal .ayuda{font-size:.75rem;color:#757575;margin:-.45rem 0 .75rem}' +
    '#ui-modal .ui-error{color:#c62828;font-size:.85rem;min-height:1.1rem;margin:.2rem 0 0}' +
    '#ui-modal .pie{display:flex;justify-content:flex-end;gap:.5rem;padding:0 1.2rem 1.1rem}' +
    '#ui-modal button{font-size:.92rem;border-radius:8px;padding:.55rem 1.1rem;cursor:pointer}' +
    '#ui-modal button.principal{background:#4e342e;color:#fff;border:none;font-weight:600}' +
    '#ui-modal button.principal:hover{background:#5d4037}' +
    '#ui-modal button.peligro{background:#c62828;color:#fff;border:none;font-weight:600}' +
    '#ui-modal button.cancelar{background:#fff;color:#4e342e;border:1px solid #e0d7ce}' +
    '#ui-modal button.cancelar:hover{background:#faf6f1}' +
    '#ui-toast{position:fixed;top:.9rem;right:.9rem;z-index:130;max-width:380px;' +
    'padding:.75rem 1rem;border-radius:10px;font-family:system-ui,sans-serif;' +
    'font-size:.9rem;display:none;white-space:pre-wrap;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.28);animation:ui-pop .16s ease-out}' +
    '#ui-toast.ok{background:#e8f5e9;color:#2e7d32;border:1px solid #2e7d32}' +
    '#ui-toast.err{background:#fbe9e7;color:#c62828;border:1px solid #c62828}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend',
    '<div id="ui-modal"></div><div id="ui-toast"></div>');

  var modal = document.getElementById('ui-modal');
  modal.addEventListener('click', function (ev) {
    if (ev.target === modal) cerrarModal();
  });

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function cerrarModal() {
    modal.style.display = 'none';
    modal.innerHTML = '';
  }
  function abrirModal(icono, titulo, cuerpoHTML, botones) {
    modal.innerHTML =
      '<div class="caja">' +
      '<div class="cabecera"><span class="icono">' + icono + '</span><strong>' +
        esc(titulo) + '</strong></div>' +
      '<div class="cuerpo">' + cuerpoHTML + '</div>' +
      '<div class="pie">' + botones + '</div>' +
      '</div>';
    modal.style.display = 'flex';
  }

  return {
    toast: function (mensaje, tipo) {
      var el = document.getElementById('ui-toast');
      el.textContent = mensaje;
      el.className = tipo === 'err' ? 'err' : 'ok';
      el.style.display = 'block';
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.style.display = 'none'; }, 5000);
    },

    confirmar: function (titulo, mensaje, onConfirmar, opciones) {
      opciones = opciones || {};
      abrirModal(opciones.icono || '❓', titulo,
        '<p style="margin:0;white-space:pre-wrap">' + esc(mensaje) + '</p>',
        '<button type="button" class="cancelar" id="ui-cancelar">Cancelar</button>' +
        '<button type="button" class="' + (opciones.peligro ? 'peligro' : 'principal') +
          '" id="ui-aceptar">' + esc(opciones.textoAceptar || 'Confirmar') + '</button>');
      document.getElementById('ui-cancelar').addEventListener('click', cerrarModal);
      document.getElementById('ui-aceptar').addEventListener('click', function () {
        cerrarModal();
        onConfirmar();
      });
      document.getElementById('ui-aceptar').focus();
    },

    formulario: function (titulo, campos, onGuardar, opciones) {
      opciones = opciones || {};
      var cuerpo = campos.map(function (c) {
        return '<label>' + esc(c.label) +
          '<input id="ui-campo-' + esc(c.id) + '" type="' + (c.tipo || 'text') +
          '" value="' + esc(c.valor || '') + '" autocomplete="off"></label>' +
          (c.ayuda ? '<p class="ayuda">' + esc(c.ayuda) + '</p>' : '');
      }).join('') + '<p class="ui-error" id="ui-form-error"></p>';
      abrirModal(opciones.icono || '✏️', titulo, cuerpo,
        '<button type="button" class="cancelar" id="ui-cancelar">Cancelar</button>' +
        '<button type="button" class="principal" id="ui-aceptar">' +
          esc(opciones.textoAceptar || 'Guardar') + '</button>');
      document.getElementById('ui-cancelar').addEventListener('click', cerrarModal);

      function enviar() {
        var valores = {};
        campos.forEach(function (c) {
          valores[c.id] = document.getElementById('ui-campo-' + c.id).value;
        });
        // onGuardar puede devolver un mensaje de error para mostrarlo sin
        // cerrar el modal (validaciones locales); si no, el modal se cierra.
        var error = onGuardar(valores);
        if (error) {
          document.getElementById('ui-form-error').textContent = error;
        } else {
          cerrarModal();
        }
      }
      document.getElementById('ui-aceptar').addEventListener('click', enviar);
      modal.querySelectorAll('input').forEach(function (input) {
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); enviar(); }
        });
      });
      var primero = modal.querySelector('input');
      if (primero) { primero.focus(); primero.select(); }
    }
  };
})();
