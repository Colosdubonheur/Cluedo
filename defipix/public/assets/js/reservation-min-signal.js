(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('reservation-js-signal');
    if (el) {
      el.textContent = 'JS: min-signal DOMContentLoaded OK';
    }
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('[reservation-min-signal] DOMContentLoaded OK');
    }
  });
})();
