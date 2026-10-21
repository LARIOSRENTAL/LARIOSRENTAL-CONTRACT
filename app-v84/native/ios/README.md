# iPhone native build

The same Larios Rental contract editor, PDF generation, employee session and native Stripe Terminal bridge are bundled into an iOS app. Payments use the shared contract reconciliation and reusable-card rules. Employees do not need Stripe Dashboard accounts.

Run `npm ci`, `npm run ios:add` on a Mac with Xcode and CocoaPods installed. The create script extracts the official pinned Capacitor template, sets the deployment target **before** the first pod install, registers the native merchant-education plugin, configures usage descriptions and adds the Tap to Pay entitlement. CocoaPods is necessary because the existing ML Kit scanner has no SPM manifest. Stripe iOS SDK is pinned to 5.8.0. This iOS target requires iOS 18 or later; Stripe may impose newer OS requirements on physical devices.

The `.github/workflows/ios-app.yml` workflow first builds the iPhone target without signing. If no Apple signing secrets are configured, its output is validation only, **not an installable IPA**. A successful unsigned build does not prove Apple approved the capability or that NFC payments work on a phone.

## Apple prerequisites

Apple requires an organization-level Developer account and the Account Holder's request for the managed Tap to Pay entitlement. Apple charges a Developer membership fee even when the app is not publicly listed. Development and distribution entitlements are separate. Register the app ID `com.lariosrental.management` and generate an explicit provisioning profile with `com.apple.developer.proximity-reader.payment.acceptance = true`. An arbitrary entitlements file does not grant permission.

After Apple approval, configure these **GitHub Actions repository secrets**, never source code or chat messages:

- `LR_IOS_CERTIFICATE_P12_BASE64`: the Apple signing certificate and private key exported as P12, base64 encoded.
- `LR_IOS_CERTIFICATE_PASSWORD`: P12 password, which can be empty if the export has no password.
- `LR_IOS_PROVISIONING_PROFILE_BASE64`: matching Apple provisioning profile, base64 encoded.
- `LR_IOS_TEAM_ID`: the Apple Developer organization team ID.

Run the workflow with the appropriate export method: `debugging` for a development profile; `release-testing` for ad hoc distribution to registered iPhones; `app-store-connect` for an App Store/TestFlight distribution profile. The workflow validates the profile's expiry, exact bundle ID, entitlement and export type before using it. It never submits to TestFlight or the App Store automatically. Ad hoc installation only works on the iPhones registered in that Apple profile; installing an IPA is not equivalent to installing an Android APK.

The workflow imports credentials into a temporary keychain and deletes signing material at the end. For signed builds it produces an IPA and verifies its code signature. Install through the appropriate Apple distribution channel, then validate the real device, merchant terms, NFC collection, contract link and future-card authorization with a small explicitly authorized payment.

## Native education

`LariosTapEducation` presents Apple's official ProximityReader “How to Tap” sheet before the first iPhone reader connection and provides a repeatable help button. It waits for dismissal before starting Stripe Terminal. The iPad can continue editing contracts, but the education plugin rejects it as a Tap to Pay reader.

Sources:
- https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios
- https://developer.apple.com/documentation/proximityreader/setting-up-the-entitlement-for-tap-to-pay-on-iphone
- https://developer.apple.com/documentation/proximityreader/proximityreaderdiscovery
