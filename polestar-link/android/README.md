# Polestar Link — standalone Android app

A private, unofficial Android companion for the Polestar 4 with the existing
Amazfit Balance 2 watch app as an optional client.

## Features in the source

- Native, premium dark Compose interface with Home / Controls / Settings.
- Polestar ID sign-in using the mobile OAuth client, PKCE and a WebView capable
  of displaying Polestar's email verification flow. Sign-in needs a live-device
  test; the IdP may refuse embedded WebViews.
- Android Keystore AES-GCM token and VIN storage. No password persistence.
- Native TLS HTTP/2 gRPC via grpc-okhttp (battery, range, charging, exterior,
  and confirmed invocation actions).
- Real status is required before enabling controls. Actions request explicit
  confirmation, terminal C3 responses, and independent lock-state checks.
- Optional foreground local bridge on **127.0.0.1:18764 only**, with a one-time
  6-digit code, 120-second expiry, max five attempts and long-lived random
  paired bearer token. No public relay, Home Assistant or Data Portal.
- Only current status is displayed. Unknown readings stay unknown.

## Android build

GitHub Actions workflow `polestar-android.yml` produces a debug APK. It also
publishes it in `polestar-link/public/` for direct installation.

For local builds: JDK 17, Android SDK 35, Gradle 8.11.1,
then `gradle :app:assembleDebug` inside this directory.

## Security and limitations

This is **unofficial**, untested on the owner's Polestar 4. OAuth login, C3
service compatibility and real command acknowledgements require physical
verification. Do not assume an automated mock test means the car responds.

The local watch bridge requires the Android foreground service to remain
active. Android may impose background execution and dataSync service
time limits. A separate watch build is required to pair using the
6-digit code; until then, the Android app is usable independently.

Do not publish access tokens, passwords, verification codes or vehicle VINs.
Debug APKs are not production-signed and should only be installed by their
owner. This project is not affiliated with Polestar.

C3 reference: https://github.com/kildahldev/unofficial-polestar-api
