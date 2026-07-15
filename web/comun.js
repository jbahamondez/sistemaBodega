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

/**
 * Identificador único para claves de idempotencia de operaciones (C2).
 * Usa crypto.randomUUID cuando está disponible; si no, un fallback simple
 * (suficiente: solo necesita ser único por dispositivo/operación).
 */
window.uuid = function () {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'op-' + Date.now().toString(36) + '-' +
    Math.random().toString(36).slice(2, 10);
};

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
    'font-size:.8rem;padding:0 0 0 .5rem}' +
    // La página puede llevar body.gate-rol{visibility:hidden} para evitar el
    // destello de contenido restringido (auditoría: trabajador veía opciones
    // de jefatura si el script tardaba en cargar). El overlay debe verse
    // IGUAL aunque el body esté oculto: visibility no se puede "reabrir"
    // desde un hijo salvo declarándolo explícitamente visible.
    '#sesion-overlay,#sesion-chip{visibility:visible}';

  var htmlOverlay =
    '<div id="sesion-overlay"><div class="caja">' +
    '<h2>🍫 Sistema Bodega</h2><p class="sub">Identifícate para continuar</p>' +
    '<form id="sesion-form">' +
    '<label>Identificador<input id="sesion-usuario" autocomplete="username" autocapitalize="none"></label>' +
    '<label>PIN<input id="sesion-pin" type="password" inputmode="numeric" autocomplete="current-password"></label>' +
    '<div id="sesion-error"></div>' +
    '<button type="submit" id="sesion-boton">Entrar</button>' +
    '</form></div></div>' +
    '<div id="sesion-chip"><span id="sesion-nombre"></span>' +
    '<button type="button" id="sesion-salir">Salir</button></div>';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML('beforeend', htmlOverlay);

  // ------------------------------ estado -----------------------------------
  var CLAVE = 'sesion_bodega_v1';
  var datos = null;          // { token, usuario_id, nombre, rol }
  var pendiente = null;      // { rolRequerido, onListo }
  var cerrandoSesion = false; // true durante Sesion.cerrar(): silencia avisos
  // de revalidaciones en segundo plano que aún estaban en vuelo (podrían
  // responder "Sesión expirada" justo porque el logout ya invalidó el token,
  // no porque la sesión haya expirado por sí sola).

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
  var TIMEOUT_MS = 30000; // corta peticiones colgadas (M5): red débil de bodega

  function llamarServidor(fn, args, onOk, onErr) {
    // AbortController corta el fetch si el servidor no responde a tiempo, en
    // vez de dejar la UI en "Procesando…" para siempre. Si el navegador no
    // lo soporta, la petición sigue sin timeout (degradación aceptable).
    var control = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var expiro = false;
    var temporizador = setTimeout(function () {
      expiro = true;
      if (control) control.abort();
    }, TIMEOUT_MS);

    var opciones = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args || [] })
    };
    if (control) opciones.signal = control.signal;

    fetch(API_URL, opciones).then(function (r) {
      if (!r.ok) throw new Error('Error de conexión (HTTP ' + r.status + ').');
      return r.json();
    }).then(function (res) {
      clearTimeout(temporizador);
      if (res.ok) onOk(res.data);
      else onErr(new Error(res.error || 'Error desconocido.'));
    }).catch(function () {
      // Todo lo que cae aquí es un problema de red/comunicación (fetch()
      // rechazado por no haber conexión, CORS, JSON inválido, o el "Error de
      // conexión (HTTP …)" de arriba) — nunca un error de negocio, esos ya
      // se resolvieron en el .then() anterior. Se descarta a propósito el
      // mensaje crudo del navegador (p. ej. "Failed to fetch", "NetworkError
      // when attempting to fetch resource" en Firefox, "Load failed" en
      // Safari — cada uno distinto y ninguno útil para el usuario) por un
      // texto siempre reconocible como "problema de conexión", que además
      // usan otras pantallas (retiro.html, D-047) para decidir si ofrecer
      // una alternativa sin conexión.
      clearTimeout(temporizador);
      if (expiro) {
        onErr(new Error('El servidor tardó demasiado en responder. Revisa tu ' +
          'conexión e intenta de nuevo.'));
      } else {
        onErr(new Error('Sin conexión con el servidor. Revisa tu conexión e intenta de nuevo.'));
      }
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
      // body.gate-rol sigue oculto: el contenido restringido nunca se revela
      // si el rol no coincide.
      mostrarLogin('Tu usuario (' + datos.rol + ') no tiene acceso a esta ' +
        'pantalla (requiere ' + pendiente.rolRequerido + '). Vuelve al ' +
        'inicio o entra con otra cuenta.');
      return;
    }
    ocultarLogin();
    // Revela el contenido de la página (si venía oculto con gate-rol) SOLO
    // ahora que el rol quedó confirmado — cierra el destello reportado.
    document.body.classList.remove('gate-rol');
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
        if (!cerrandoSesion &&
          (msg.indexOf('Sesión expirada') !== -1 || msg.indexOf('inactivo') !== -1)) {
          guardar(null);
          mostrarLogin('La sesión expiró. Vuelve a entrar.');
        }
      });
    },

    /**
     * Verificación de rol para pantallas ENTERAS restringidas (Panel,
     * Catálogo, Ingreso). El contenido de la página NUNCA se revela sin que
     * el rol quede confirmado (ver body.gate-rol + completar(): cierra el
     * destello de contenido restringido, reportado por el usuario).
     *
     * Para no repetir el viaje al servidor —y el overlay "Verificando…"— en
     * cada clic entre estas pantallas durante una sesión de trabajo, si el
     * rol ya se confirmó hace menos de CONFIANZA_MS con el servidor Y
     * coincide con el requerido, se revela de inmediato SIN overlay; de
     * todos modos se revalida en segundo plano (silenciosa) para detectar
     * pronto un cambio de rol o una sesión invalidada. Pasada la ventana de
     * confianza, o si el rol no coincide, se hace la verificación completa
     * con "Verificando acceso…" visible.
     */
    asegurarRolConfirmado: function (rolRequerido, onListo) {
      pendiente = { rolRequerido: rolRequerido, onListo: onListo };
      var guardada = leer();
      if (!guardada || !guardada.token) { mostrarLogin(''); return; }

      var CONFIANZA_MS = 2 * 60 * 1000; // 2 min: navegar entre pantallas no reverifica cada vez
      var confirmadoHacePoco = guardada.validada &&
        (Date.now() - guardada.validada < CONFIANZA_MS);
      if (confirmadoHacePoco && guardada.rol === rolRequerido) {
        datos = guardada;
        completar(); // ya se confirmó este rol hace poco: revela sin overlay
        // Revalidación en segundo plano: NUNCA interrumpe por un corte de red
        // transitorio (D-025). confirmarConServidor solo pone datos en null
        // cuando el servidor declaró la sesión realmente inválida/inactiva;
        // un simple problema de conexión deja `datos` intacto y aquí se
        // ignora en silencio (se reintentará en la próxima navegación).
        confirmarConServidor(guardada.token, function () { /* refresca en silencio */ },
          function (mensaje) { if (datos === null && !cerrandoSesion) mostrarLogin(mensaje); });
        return;
      }

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
     * Verificación ÚNICA para páginas abiertas a cualquier rol pero con
     * contenido condicionado por rol (p. ej. el inicio: todos entran, pero
     * las tarjetas de administración solo se muestran a JEFATURA).
     *
     * Reemplaza el patrón anterior de llamar asegurar(null,...) SEGUIDO de
     * confirmarRolPara(...) — dos peticiones de red independientes que
     * compartían las mismas variables internas (`datos`, `pendiente`) sin
     * necesidad. Con un solo viaje al servidor se decide TODO: si no hay
     * sesión, se pide login; si la hay, se llama onListo(datosConfirmados)
     * una única vez con el rol ya verificado (nunca con el dato cacheado).
     */
    asegurarConfirmado: function (onListo) {
      // `pendiente` debe quedar seteada SIEMPRE (aunque este método no la
      // use en su propio camino de éxito): si no hay sesión, se muestra el
      // formulario de login, y al enviarlo, completar() la necesita para
      // saber a quién avisar tras un login exitoso.
      pendiente = { rolRequerido: null, onListo: onListo };
      var guardada = leer();
      if (!guardada || !guardada.token) { mostrarLogin(''); return; }
      confirmarConServidor(guardada.token, function () {
        onListo(datos);
      }, function (mensaje) {
        mostrarLogin(mensaje);
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
      cerrandoSesion = true;
      guardar(null);
      // apiLogout es "avisar al servidor" (best-effort): no bloquea la
      // navegación. Esperar su respuesta antes de navegar le daba tiempo a
      // una revalidación en segundo plano ya en vuelo (asegurar/
      // asegurarRolConfirmado de la pantalla actual) para responder
      // "Sesión expirada" justo cuando el logout invalidó el token —
      // mostrando ese aviso por error antes de llegar al Inicio.
      if (token) llamarServidor('apiLogout', [token], function () {}, function () {});
      location.href = 'index.html';
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
    '#ui-modal input,#ui-modal select{width:100%;box-sizing:border-box;padding:.6rem .7rem;' +
    'font-size:1rem;border:1px solid #e0d7ce;border-radius:8px;margin-top:.25rem;' +
    'font-family:inherit;background:#fff}' +
    '#ui-modal input:focus,#ui-modal select:focus{outline:none;border-color:#5d4037;' +
    'box-shadow:0 0 0 3px rgba(93,64,55,.15)}' +
    '#ui-modal .ayuda{font-size:.75rem;color:#757575;margin:-.45rem 0 .75rem}' +
    '#ui-modal .ui-error{color:#c62828;font-size:.85rem;min-height:1.1rem;margin:.2rem 0 0}' +
    '#ui-modal .pie{display:flex;justify-content:flex-end;gap:.5rem;padding:0 1.2rem 1.1rem}' +
    '#ui-modal button{font-size:.92rem;border-radius:8px;padding:.55rem 1.1rem;cursor:pointer}' +
    '#ui-modal button.principal{background:#4e342e;color:#fff;border:none;font-weight:600}' +
    '#ui-modal button.principal:hover{background:#5d4037}' +
    '#ui-modal button.peligro{background:#c62828;color:#fff;border:none;font-weight:600}' +
    '#ui-modal button.cancelar{background:#fff;color:#4e342e;border:1px solid #e0d7ce}' +
    '#ui-modal button.cancelar:hover{background:#faf6f1}' +
    // Snackbar inferior centrado: se ubica bien arriba del borde inferior
    // (4.5rem) para no superponerse nunca con #sesion-chip, que vive abajo
    // a la derecha.
    '#ui-toast{position:fixed;bottom:4.5rem;left:50%;transform:translateX(-50%);' +
    'z-index:130;max-width:380px;' +
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
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
        var control;
        if (c.tipo === 'select') {
          var opts = (c.opciones || []).map(function (op) {
            var valorOp = (op && op.value !== undefined) ? op.value : op;
            var etiqueta = (op && op.label !== undefined) ? op.label : op;
            var elegido = (valorOp === c.valor) ? ' selected' : '';
            return '<option value="' + esc(valorOp) + '"' + elegido + '>' + esc(etiqueta) + '</option>';
          }).join('');
          control = '<select id="ui-campo-' + esc(c.id) + '">' + opts + '</select>';
        } else {
          control = '<input id="ui-campo-' + esc(c.id) + '" type="' + (c.tipo || 'text') +
            '" value="' + esc(c.valor || '') + '" autocomplete="off">';
        }
        return '<label>' + esc(c.label) + control + '</label>' +
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
      var primero = modal.querySelector('input, select');
      if (primero) { primero.focus(); if (primero.select) primero.select(); }
    }
  };
})();
