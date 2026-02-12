(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var nextButton = document.getElementById('reservation-next');
    if (!nextButton) {
      return;
    }

    nextButton.addEventListener('click', function () {
      var panel1 = document.querySelector('panel[data-panel="1"], [data-panel="1"]');
      var panel2 = document.querySelector('panel[data-panel="2"], [data-panel="2"]');

      if (panel1) {
        panel1.style.display = 'none';
      }
      if (panel2) {
        panel2.style.display = '';
      }
    });
  });
})();
