# Polestar Link — Zepp-only prototype

**Version 0.2.0 — non-operational vehicle demo.**

The Amazfit Balance 2 app contains a Lock/Unlock user interface and a Test Zepp button. The Zepp Android app hosts a Settings page and Side Service. **No separate Android APK, Home Assistant, Polestar credentials, or live vehicle-control endpoint is required for the demo.**

The Lock/Unlock buttons are deliberately inert and do not talk to a vehicle. The UI explains this. Never enter Polestar passwords or tokens into this prototype.

## Layout

- `watch/page/index.js` — safe watch UI
- `watch/setting/index.js` — Zepp settings page
- `watch/app-side/index.js` — Zepp-hosted side service, no vehicle network traffic
- `watch/app.json` — manifest (setting + app-side registered)
- `.github/workflows/polestar-link.yml` — standalone developer build and QR

## Install

The GitHub workflow builds a preview-mode `.zpk` and stores its QR and package in `polestar-link/public/` on the feature branch. To use the QR, open:

https://github.com/Jorn1993/amazfit-watchfaces/blob/feature/polestar-link/polestar-link/public/install-qr.png?raw=true

In Zepp, select Developer Mode > Scan. The QR will work only if the new build has finished successfully; check the package revision before retesting. No production release or merging to either watchface branch is intended.

## Why remote lock/unlock is not yet implemented

Zepp Settings UI and Side Service are documented, so the companion APK can be avoided. Polestar 4 uses undocumented third-party authentication/control endpoints. The app **must not ask for Polestar credentials or claim success** until sign-in, token storage, command authorization, and device-specific API behavior are independently validated. Live unlock must require an explicit confirmation and provide server acknowledgment and updated lock status.

See https://docs.zepp.com/docs/guides/framework/app-settings/register/ and https://github.com/kildahldev/unofficial-polestar-api for background.
