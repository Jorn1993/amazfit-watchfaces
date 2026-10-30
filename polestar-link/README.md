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
