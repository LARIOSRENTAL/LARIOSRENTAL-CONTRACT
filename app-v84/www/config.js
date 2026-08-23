window.LARIOS_CONFIG = window.LARIOS_CONFIG || {
  // Clave publica del proyecto Supabase. No contiene secretos administrativos.
  supabaseUrl: 'https://yowwxoeubqduwiyubyru.supabase.co',
  supabasePublishableKey: 'sb_publishable_6Y7kfR1-MYtfm9r1NldYRg_p1D4sx72',
  requireEmployeeLogin: true,
  contractEmailEndpoint: 'https://yowwxoeubqduwiyubyru.supabase.co/functions/v1/send-contract'
};

// Compatibilidad temporal: larios-fixes.js conserva un escáner manual antiguo y lo
// reasigna 100 ms después de iniciar la app. Volvemos a cargar Scanner V5 después
// de ese parche para que sea siempre la implementación activa al pulsar Escanear.
window.addEventListener('load', function () {
  setTimeout(function () {
    var old = document.getElementById('scanner-v5-reassert');
    if (old) old.remove();
    var s = document.createElement('script');
    s.id = 'scanner-v5-reassert';
    s.src = 'scanner-v5.js?v=reassert-bugfix-1';
    s.onload = function () {
      var f = document.querySelector('.foot');
      if (f) f.textContent = 'Larios Rental · V8.4 · Scanner V5 ACTIVO · FIX 1';
    };
    document.body.appendChild(s);
  }, 500);
});
