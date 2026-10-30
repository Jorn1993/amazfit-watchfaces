# Polestar Link — Amazfit Balance 2 / Zepp Android

**Status: experimental, not working end-to-end against a real Polestar 4.**
Source code lives on `feature/polestar-link`. Do not merge as an advertised working car-key application.

## What is actually verified

- On 30 October 2026 the real Balance 2 sent a `zepp.ping` RPC through Zepp's Side Service and received `{ok:true, auth:false, status:"Not connected"}`. Watch ↔ Zepp communication **works**.
- Zepp Auth opens a browser, but Polestar returns **Invalid Session**. Polestar rejects the callback supplied by Zepp's generic OAuth component.
- Anonymous tests of Polestar's OIDC metadata show a registered web callback and mobile-app callback work with the normal authorization endpoint; the Zepp callback returned HTTP 400.
- Device-code and password OAuth grants are `unauthorized_client` for the known mobile/web clients; the provider advertising a grant does **not** mean a given client is authorized for it.
- `pypolestar/pypolestar`, `kildahldev/unofficial-polestar-api`, and `kaohlive/Polestar` use a different path: **scripted OAuth authorization-code/PKCE**, including provider cookies, form resume path, login redirect, code exchange, and refresh tokens. We ported that into `app-side/oidc.js` with mock tests. **It remains disabled until we can safely obtain credentials and show that Zepp Fetch exposes the needed cookies/redirects.**
- These same integrations use a true **HTTP/2 gRPC** client for vehicle control; Zepp's Side Service documents HTTP Fetch but does not guarantee the binary gRPC features. Never assume HTTP 200 alone confirms a vehicle command.

## Personal real-account login test (v1.3.13)

Zepp Settings now has editable **Polestar email** and visually masked **Polestar password** fields and a **Sign in to Polestar** button. Pressing the button sends a one-shot, timestamp-limited login request through the supported Settings Storage bridge. Side Service immediately removes the queued request and executes the previously tested PKCE authorization-code login implemented in `app-side/oidc.js`. On token response it attempts to discover the account's Polestar car; otherwise a diagnostic error is displayed. Email is remembered to make subsequent attempts easier. Password is not intentionally retained after submission.

**Personal-build risk:** `settingsStorage` is persistent and holds login details briefly between Settings and Side Service; it is not a secure credentials vault. Use only on a personally controlled phone. Do not post screenshots containing an entered password or share developer logs. Do not distribute this as a consumer application.

**Not hardware-verified:** This implementation has passed mocked end-to-end tests. Polestar authentication can still fail if Zepp Fetch hides redirect headers or disallows the Cookie request header, the account needs interactive MFA/consent, or Polestar changes its flow. A successful login is not proof of working HTTP/2 gRPC lock/unlock.

## Credential-free account login feasibility (source v1.3.11)

The Zepp Settings screen offers **Test login options (no password)**. It runs two independent, harmless checks:

1. Zepp Side Service sends only `zepp_probe_only=harmless` as a synthetic Cookie header to `https://httpbin.org/cookies` and checks if the echo matched; it never sends any Polestar cookie or account detail to that service. An HTTP echo only proves that the cookie header could travel via Zepp Fetch. It does not prove Polestar will accept login.
2. The Settings App tries a browser-style, credential-free GET of Polestar OIDC metadata with `credentials:'omit'`. If browser fetch is unavailable or blocked by CORS, **do not add password entry** via Settings. Even a successful GET would not mean the account's existing app session is shared.

Do not ask users to enter passwords in Zepp until a safe transient credential/auth channel exists. Zepp `settingsStorage` is persistent, even if a TextInput shows bullet characters. The official Polestar app's existing account session is **not automatically accessible** to Zepp; native Zepp OAuth previously failed because its redirect is not registered at Polestar. These checks contain no real credentials, OAuth codes, VINs or vehicle commands.

## Current diagnostic release (source v1.3.10)

- The direct Zepp app still does **not** authenticate against Polestar and is **not** a working car key.
- The anonymous compatibility report now distinguishes HTTP reachability from real HTTP/2 gRPC support. An HTTP 200, 401, or 403 alone is **not** a verified gRPC channel.
- The report checks whether Zepp exposes secure WebCrypto primitives required for PKCE, session cookies, and a native binary body. These checks expose no secrets.
- An accepted lock/unlock RPC is not called successful until a subsequent exterior-state read matches the requested state. If the state cannot be verified, the watch reports an unverified command without automatically retrying.
- Failed account discovery clears partial access/refresh tokens, VIN, and endpoint state. OAuth callbacks require an exact, nonempty `state` value.
- Mock tests cover these conditions, but actual Zepp/Polestar compatibility still requires the owner's device.

## Current diagnostic release

The watch's Status button and the Zepp settings page can perform **credential-free compatibility checks**:

1. Polestar OIDC discovery and login-page session cookie visibility.
2. C3 backend discovery and anonymous gRPC transport access (no VIN, token or lock/unlock action).
3. Zepp Settings shows a disabled `Demo123!` input with CSS password masking. This is a *visual test only*, not a real password field. **Do not enter actual credentials until masking is proven on the phone.**

Responses contain only booleans, status codes, and short errors; no cookies, codes, tokens, full OAuth redirects or credentials are logged.

## Reproducing the build

The GitHub Action `polestar-link.yml` checks JavaScript syntax, runs unit/integration tests, builds a developer ZPK, repackages both watch and phone bundles as preview mode, and publishes the package/QR in `polestar-link/public`.

Tests are **mocked**. They do not prove real authentication or vehicle communication.

## Release blockers

- Zepp-side Fetch must preserve Polestar session cookies and expose the 302 redirect with an authorization code. Browser/phone runtimes must provide cryptographically secure randomness and SHA-256 for PKCE.
- Password input must be securely masked, with no plaintext displayed or persisted in Zepp settings or logs. Prior TextInput `type: "password"` was ignored, so do not reuse it.
- Zepp Fetch must support the real C3 backend gRPC/HTTP2 requirements, including binary protobuf responses and trailers/streaming.
- End-to-end status, lock and unlock must be tested on a real Polestar 4 with user approval, never inferred from simulations. Lock/unlock requires confirmation.

## Source references

- https://github.com/kaohlive/Polestar/tree/master/clone_modules/polestar-c3
- https://github.com/kildahldev/unofficial-polestar-api
- https://github.com/pypolestar/pypolestar/blob/main/pypolestar/auth.py
- https://docs.zepp.com/docs/reference/side-service-api/fetch/
- https://github.com/Jorn1993/amazfit-watchfaces/issues/1
