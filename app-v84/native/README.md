# Larios Rental · Stripe Terminal

The native Android/iOS bridge uses the employee's Larios Rental session. It never requires Stripe Dashboard access. The web edition retains the existing admin-only external-payment linking flow.

## Build

Use Node 22 and Java 21. Run `npm ci`, `npm run native:prepare`, `npx cap add android`, `node scripts/prepare-terminal.mjs`, then `npx cap sync android`. The preparation script applies reviewed, guarded patches to the pinned MIT Capacitor Community Stripe Terminal 8.3.0 plugin: SDK startup in Application.onCreate, permission denial, empty discovery results, logging and required limited redisplay consent. Stripe Android SDK is pinned to 5.8.0.

The Android GitHub workflow builds the APK. Live Tap to Pay requires a **release, non-debuggable APK** signed with the existing LR_ANDROID_KEYSTORE_BASE64, LR_ANDROID_STORE_PASSWORD, LR_ANDROID_KEY_ALIAS and LR_ANDROID_KEY_PASSWORD repository secrets. The debug APK deliberately refuses live Tap to Pay. Signing keys must never be committed to this public repository. No Play Store publication is required for installing a signed Android APK.

Stripe validates the device's NFC capability, security patch, Android version and integrity during discovery before any PaymentIntent is created. Android 13 is the application's minimum Tap to Pay version; that alone does not guarantee device compatibility. Test on the intended physical device with a small authorized transaction before rollout.

## Server

Deploy `stripe-checkout` with `index.ts`, `external-payment.ts`, `native-terminal.ts`; deploy `stripe-webhook` with its index and the native-terminal sibling module. Apply `complete_native_stripe_payment` migration first. Existing STRIPE_SECRET_KEY, STRIPE_ENABLED and STRIPE_TERMINAL_LOCATION_ID settings are reused. The Stripe webhook endpoint should include `payment_intent.succeeded` in its event subscriptions for background reconciliation. Client verification independently reconciles the same payment on return, even if this event is not subscribed.

A single open native attempt per contract, stable Stripe idempotency keys, and a durable pending intent prevent retries from creating duplicate native charges. Before retrying an uncertain operation, use Comprobar cobro Tap to Pay. Cancellation first checks whether Stripe already charged it. Payment evidence and the initial contract amount are verified on the server; clients cannot mark an unpaid intent paid. Only service_role can finalize the payment or save the reusable token.

Card collection requests setup_future_usage=off_session and limited redisplay after customer authorization. Save only Stripe's generated_card attached to the expected Customer. A card_present token or wallet token must never be treated as a reusable online card. If Stripe supplies no generated_card, the paid rental remains linked and Consultar tarjeta opens the existing secure card-registration flow. Later off-session charges can still require customer authentication.

## iPhone

The bridge and consent patch are included for iOS source builds. Activation additionally needs an Apple Developer account, Apple-approved Tap to Pay entitlements, a compatible iPhone and a signed provisioning profile. Before distribution, configure location usage text and the Tap to Pay entitlement in the Xcode project, follow Stripe's current Apple onboarding guide, and validate on device. Adding the web page to the home screen does not enable native NFC payments. This Android workflow does not build or activate an iOS app.

## Checks

`node tests/stripe-native-terminal.test.js` checks server authorization, contract/amount reconciliation, refunds, generated cards, uncertain results and retry behavior. `node tests/stripe-native-bridge.test.js` checks consent, form preservation, native SDK flow, exact amounts and interrupted confirmation. These mock-based checks do not replace a physical NFC acceptance test.
