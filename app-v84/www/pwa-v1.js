(function () {
  if (!('serviceWorker' in navigator) || window.Capacitor?.isNativePlatform?.()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.warn('La instalación sin conexión no está disponible', error);
    });
  });
})();
