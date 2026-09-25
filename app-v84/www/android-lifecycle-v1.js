(function () {
  'use strict';

  const native = !!(window.Capacitor?.isNativePlatform?.());
  let lastRefresh = Date.now();
  let refreshing = false;

  async function refreshAgenda() {
    if (document.hidden || document.getElementById('home')?.classList.contains('hidden')) return;
    if (refreshing || Date.now() - lastRefresh < 30000 || !navigator.onLine) return;
    if (!window.LariosReservations?.loadAgenda || !localStorage.getItem('lr_token')) return;
    refreshing = true;
    try {
      const expiry = Number(localStorage.getItem('lr_expires_at') || 0);
      if (expiry && Date.now() / 1000 > expiry - 30 && window.refreshSession) {
        if (!await window.refreshSession()) return;
      }
      await window.LariosReservations.loadAgenda(document.getElementById('agendaDate')?.value || undefined);
      lastRefresh = Date.now();
    } finally {
      refreshing = false;
    }
  }

  function goBack() {
    const quick = document.getElementById('quickReservationModal');
    if (quick && !quick.classList.contains('hidden')) {
      window.LariosReservations?.closeQuick();
      return true;
    }
    if (!document.getElementById('reservation')?.classList.contains('hidden')) {
      window.LariosReservations?.close();
      return true;
    }
    if (!document.getElementById('list')?.classList.contains('hidden')) {
      window.showHome?.();
      void refreshAgenda();
      return true;
    }
    return false;
  }

  if (native) {
    const app = window.Capacitor?.Plugins?.App;
    app?.addListener?.('appStateChange', ({ isActive }) => { if (isActive) void refreshAgenda(); });
    app?.addListener?.('backButton', () => {
      if (!goBack()) void app.minimizeApp?.();
    });
  } else {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshAgenda(); });
  }
  window.addEventListener('focus', () => { void refreshAgenda(); });
})();
