window.LARIOS_CONFIG = window.LARIOS_CONFIG || {
  // Clave publica del proyecto Supabase. No contiene secretos administrativos.
  supabaseUrl: 'https://yowwxoeubqduwiyubyru.supabase.co',
  supabasePublishableKey: 'sb_publishable_6Y7kfR1-MYtfm9r1NldYRg_p1D4sx72',
  requireEmployeeLogin: true,
  contractEmailEndpoint: 'https://yowwxoeubqduwiyubyru.supabase.co/functions/v1/send-contract'
};

// Cargar el guard del scanner al final, despues de scanner.js, V5 y V6.
// Evita que codigo antiguo intente escribir en #scanTitle antes de crear la vista.
window.addEventListener('load', function () {
  var s = document.createElement('script');
  s.src = 'scanner-open-guard-v6.js?v=2';
  s.onload = function () {
    var f = document.querySelector('.foot');
    if (f) f.textContent = 'Larios Rental · V8.4 · PRECIOS V7 · AMPLIACIONES V6 · PERMISOS V1';
  };
  document.body.appendChild(s);
});
