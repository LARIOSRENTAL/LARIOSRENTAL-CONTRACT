# Restauración Android: cobro y garantía por Tap to Pay

Base: `cfc3b648100b67f1a18a7d9ea8b19e52ba11a2e4` de la rama publicada `agent/mobile-v84`.

Se recupera el plugin Stripe Terminal 8.3.0 con SDK 5.8.0 fijado y las correcciones de inicio, permisos, consentimiento de redisplay limitado y recuperación del mismo PaymentIntent. Se incorpora el puente a la APK y se verifica su presencia en el workflow para evitar distribuir un botón sin implementación nativa.

## Comportamiento

- Cobro: importe del contrato guardado, consentimiento, lectura NFC y captura automática del alquiler. Se comprueba el resultado en backend y se conserva el editor.
- Garantía: comprobación del dispositivo y consentimiento antes de crear el intento, importe según la franquicia base actual, PaymentIntent independiente con captura manual. Confirmar la lectura autoriza, sin capturar. Se mantienen los controles existentes de captura parcial y cancelación.
- Guardado: se solicita uso futuro para las garantías Tap nuevas y se verifica el `generated_card` y su Customer antes de guardar la referencia. Una garantía confirmada puede requerir registro web adicional de tarjeta; la pantalla no presenta ese caso como guardado correcto.
- Recuperación: la misma garantía pendiente se vuelve a consultar; una autorización ya confirmada no lee otra tarjeta ni crea otra retención. La referencia local no contiene client_secret. Los eventos de Stripe concilian el estado incluso con la aplicación cerrada.
- Acceso: sesión y rol de Larios, sin claves Stripe en la APK; garantía Tap restringida a su creador o administrador. Este cambio no implementa la nueva arquitectura completa de asignación de contratos descrita en la auditoría anterior.
- Navegador: conserva la búsqueda de cobros externos por importe y confirmación del administrador. No convierte el navegador en lector NFC.

No se cambian precios, seguros, reglas de franquicia, extras, vehículos, Renthub ni generación PDF. Se conserva el orden y los ajustes recientes del editor.

## Inventario previo a publicación

Aplicación y compilación:

- `.github/workflows/android-apk.yml`
- `app-v84/package.json`, `app-v84/package-lock.json`
- `app-v84/scripts/prepare-terminal.mjs`
- `app-v84/native/tap-to-pay.js`, `app-v84/native/README.md`
- `app-v84/www/native-terminal.js` (bundle generado)
- `app-v84/www/index.html`, `app-v84/www/service-worker.js`
- `app-v84/www/payment-methods-v1.js`
- `app-v84/www/guarantee-panel-v1.js`
- `app-v84/www/reservation-interaction-fix-v1.js`

Backend:

- `supabase/functions/stripe-checkout/index.ts` (sincroniza el enrutado nativo que ya estaba desplegado)
- `supabase/functions/stripe-checkout/native-terminal.ts`
- `supabase/functions/stripe-checkout/native-hold.ts`
- `supabase/functions/preauthorization/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

Pruebas/documentación:

- `tests/production-preauthorization.mjs`
- `tests/stripe-native-terminal.test.js`
- `tests/stripe-native-bridge.test.js`
- `tests/stripe-tap-hold.test.js`
- `tests/stripe-checkout-v1.test.js` (corrige una aserción antigua para Checkout en otra pestaña)
- Este documento.

Migraciones SQL: ninguna. No se alteran tablas ni datos de contratos. No se crean cobros ni retenciones reales durante la verificación.

## Validación de código

Pruebas con Stripe y SDK simulados: alquiler, consentimiento, importe exacto, guardado, tarjeta no reutilizable/Customer incorrecto, garantía sin captura, cancelación y captura parcial, vuelta tras interrupción, bloqueo de operaciones simultáneas, CORS nativo, aislamiento por creador de garantía, validación del webhook y preservación del editor. Se ejecutan también las regresiones existentes de Checkout, lector y vinculación externa.

El empaquetado y compilación se verifican en GitHub Actions con Java 21 y firma release existente. El diagnóstico de dispositivo no crea un PaymentIntent ni modifica suscripciones webhook. Al preparar un cobro/garantía nuevo, el backend añade los eventos financieros necesarios a la suscripción existente sin eliminar los anteriores.

## Limitaciones para la prueba de aceptación

La prueba NFC en el dispositivo y las respuestas de la cuenta/banco no pueden sustituirse por mocks ni por una APK compilada. No se ha realizado aquí una transacción real. La cuenta de pruebas no estaba configurada en la auditoría previa. No se prometen autorizaciones extendidas en esta restauración: se muestra el vencimiento `capture_before` que comunique Stripe. Cancelar en Stripe no demuestra cuándo el banco devuelve disponibilidad de fondos.

El Redmi de la fotografía necesita actualizar su parche de seguridad y pasar el diagnóstico real. La versión release debe instalarse como actualización de la APK firmada anterior, manteniendo identidad y firma. La solución propia iPhone permanece pendiente de membresía y permisos Apple y no se publica con esta restauración Android.
