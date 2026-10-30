# Polestar Link — isolated prototype

This directory is an Amazfit Balance 2 diagnostic app. It tests watch ↔ Zepp phone-side ↔ Android localhost communication. **No Polestar vehicle commands or login are implemented.**

## Installation QR

The official Zepp developer QR requires `zeus preview` on the **watch source project**, with a developer account login. A normal QR encoding a `.zab` URL is not a working Zepp installation code.

```sh
npm install -g @zeppos/zeus-cli
cd polestar-link/watch
npm install
node prepare-icons.mjs
zeus login
zeus preview
```

Select the Balance 2 target and scan with Zepp → Developer Mode → + → Scan. The login/preview is interactive; GitHub Actions cannot automatically authenticate your Zepp account. If using a GitHub Codespace on Android, run these commands in the browser terminal, then display the QR on another screen (or save it as an image and try scanning via gallery if Zepp offers that option).

This branch is intentionally independent of both existing watchfaces.
