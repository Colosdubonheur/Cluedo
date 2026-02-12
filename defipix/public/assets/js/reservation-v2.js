/* reservation-v2.js
 * Safari iPhone diagnostic guards (safe/minimal)
 */
(function setupReservationEarlySignal() {
  var BUILD_ID = 'reservation-v2-20260211-early-1';

  function setSignal(text) {
    var el = document.getElementById('reservation-js-signal');
    if (el) {
      el.textContent = text;
    }
  }

  try {
    setSignal('JS: fichier exécuté (early)');
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('[reservation-v2]', BUILD_ID, 'early-exec');
    }
  } catch (err) {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error('[reservation-v2] early signal failed', err);
    }
  }

  function shortError(prefix, message, lineno, colno) {
    var parts = [prefix, message || 'unknown'];
    if (lineno) {
      parts.push('L' + lineno + (colno ? ':' + colno : ''));
    }
    setSignal(parts.join(' | '));
  }

  window.onerror = function (message, source, lineno, colno) {
    shortError('JS ERROR:', String(message || ''), lineno, colno);
    return false;
  };

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var message = 'promise rejection';

    if (reason && typeof reason === 'object' && 'message' in reason) {
      message = String(reason.message);
    } else if (typeof reason === 'string') {
      message = reason;
    }

    shortError('JS ERROR:', message);
  });
})();

/* IIFE principale existante (placeholder si vide) */
(function () {
  // Conserver ici le code existant de reservation-v2.js.
})();
