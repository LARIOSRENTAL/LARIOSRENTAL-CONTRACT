window.LARIOS_CONFIG = window.LARIOS_CONFIG || {
  // Clave publica del proyecto Supabase. No contiene secretos administrativos.
  supabaseUrl: 'https://yowwxoeubqduwiyubyru.supabase.co',
  supabasePublishableKey: 'sb_publishable_6Y7kfR1-MYtfm9r1NldYRg_p1D4sx72',
  requireEmployeeLogin: true,
  contractEmailEndpoint: 'https://yowwxoeubqduwiyubyru.supabase.co/functions/v1/send-contract'
};

// El scanner-v5 crea la carcasa visual y cambia el pie al cargarse. Scanner V6 se
// carga después y es el motor final. Marcamos la versión una vez terminada toda la
// carga para que el pie no vuelva a mostrar V5 por el orden de los scripts.
window.addEventListener('load', function () {
  setTimeout(function () {
    var f = document.querySelector('.foot');
    if (f) f.textContent = 'Larios Rental · V8.4 · Scanner V6 WEB · FINAL';
  }, 800);
});
