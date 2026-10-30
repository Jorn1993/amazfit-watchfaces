# Direct Polestar 4 connection — engineering decision (2026-10-30)

## Desired UX
Zepp settings: connect Polestar account, select vehicle, display battery/range/lock status. Watch: status, lock, unlock with explicit confirmation. No additional Android APK or user-maintained server.

## Verified facts
- On-device test of v0.5.0: Zepp side-service fetched https://www.polestar.com/ (HTTP 200).
- Zepp supports Settings App / Side Service and HTTP Fetch, but this does **not** prove gRPC over HTTP/2 transport.
- Polestar 4 cloud controls in unofficial-polestar-api use gRPC/HTTP2 with protobuf and an OAuth authentication flow. Library: https://github.com/kildahldev/unofficial-polestar-api
- A gRPC request is **not** an ordinary HTTPS/JSON fetch: application/grpc framing, trailers, HTTP/2 and protobuf are required.
- Current direct Zepp app is **not** capable of Polestar sign-in or vehicle commands. Previous gateway prototype is not deployed or verified.

## Security constraints
- Do not add email/password inputs that promise a login while there is no working authentication path.
- Prefer external OAuth authorization code + PKCE when supported; do not put long-lived passwords in watch-side code or GitHub.
- A token must never be logged, shown in error status, stored in public source, or sent to untrusted hosting.
- Confirm unlock separately on watch. Never present “unlocked” just because an HTTP request was issued.
- Avoid storing account password in generic Zepp settingsStorage without verifying security protections and consent.

## Required proof before shipping credential entry
1. Prove Zepp Side Service can issue a complete Polestar gRPC unary call with proper transport, or discover an official HTTPS API supported by the Polestar 4.
2. Implement secure account authentication / OAuth redirect and token renewal in Zepp.
3. Fetch vehicles and non-sensitive status; prove VIN belongs to authenticated account.
4. Test lock first and unlock with user confirmation and post-command vehicle-state verification.
5. Only after these pass, offer account login with clear privacy information.

## Practical alternatives
- An authenticated gateway translates Zepp HTTPS to Python/gRPC; it requires a trusted service but no Android APK.
- A phone companion can run compatible networking on Android, but this was explicitly rejected as the preferred UX.
- Do not misrepresent an HTTPS reachability test as Polestar authentication.
