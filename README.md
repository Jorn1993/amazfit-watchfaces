# Amazfit Watchfaces

Independent smartwatch/watchface project. **No relationship to Luce or the Movement Platform application.**

## Nautic Palette

A noncommercial customization of [raetha's Sextant](https://github.com/raetha/zepp-watch-faces) for Zepp OS watches, initially targeting **480 × 480 round displays** (including the Amazfit Balance 2-class emulator). The generated watchface has its own app ID (`21319240`) so it doesn't replace the original Sextant.

Themes selected from the existing watchface editor:

| Theme | Behavior |
| --- | --- |
| Color | Original multicolored Sextant theme |
| Mono | Original monochrome version |
| Mix | White clock/date/general interface; individual complications, progress ticks, and metric icons keep their colors |
| Blue | Blue accents, graphics, clock and complications |
| Green | Green throughout |
| Purple | Purple throughout |
| Orange | Orange throughout |
| Pink | Pink throughout |

The original *automatic red night mode* remains independent, as does Always-On Display. Complication types, positions and tap actions are preserved.

### Install using Zepp's QR scanner

**Installation address (after GitHub Pages is enabled and the build succeeds):**

https://jorn1993.github.io/amazfit-watchfaces/

The page will show the QR code. The QR encodes:

`zpkd1://jorn1993.github.io/amazfit-watchfaces/nautic-palette/nautic-palette.zpk`

This is a Zepp-specific installation URL; it's **not** a normal website link or a QR code that embeds the binary package.

1. In the Zepp app, go to **Profile → Settings → About** and tap the Zepp logo **seven times** to enable Developer Mode.
2. Under **Profile → your Amazfit watch → Developer Mode**, tap **Scan**.
3. Scan the installation QR code displayed on another screen, then confirm installation.
4. On the watch, long-press the face and choose **Edit**, then tap the theme area (over the date) to cycle through the available palettes.

On-watch installation of this custom build has not yet been verified.

### One-time GitHub setup for hosting

The repo was created **private**. Zepp's QR installer needs an externally reachable HTTPS `.zpk`; a private GitHub file or authenticated Actions artifact is not sufficient.

- With **GitHub Free**, change the repository visibility to **Public** at **Settings → General → Danger Zone → Change repository visibility**. Only do this if you're comfortable making the source public.
- Alternatively, on a GitHub plan that supports Pages for private repositories, keep it private. **GitHub Pages content will still be publicly accessible** unless private Pages visibility is explicitly supported and configured.
- Go to **Settings → Pages → Build and deployment → Source → GitHub Actions**.
- Open **Actions → Build Nautic Palette and installation QR → Run workflow**. The successful workflow uploads the `.zpk` and install QR as build artifacts and deploys the installer page.
- Check the deployment URL above (the `.zpk` must be publicly downloadable over HTTPS). Only then scan the QR code.

**Current build status:** Successfully compiled and tested on 2026-10-24 using GitHub Actions ([successful build](https://github.com/Jorn1993/amazfit-watchfaces/actions/runs/40098875166)). All 27 offline watchface scenarios passed; the 480×480 ZPK was validated, and GitHub Pages deployed the QR installation site successfully. This does not yet constitute an installation test on a physical Amazfit Balance 2. If the install page is not loading, check the workflow deployment and GitHub Pages settings.

## Repository structure

- `tools/build_patch.py` — applies the noncommercial color-theme changes to the pinned upstream source; also generates theme test scenarios.
- `.github/workflows/build.yml` — obtains the pinned upstream source, builds resources, tests the watchface, produces and validates the ZPK, generates the installation QR/page and deploys Pages.
- `LICENSE` — original Sextant license, CC BY-NC-SA 4.0.

## Developer build

The GitHub Actions workflow pins [Sextant upstream commit `b39c8a1`](https://github.com/raetha/zepp-watch-faces/commit/b39c8a1ab51659a34f6317846b8bd649cd9fe7d8) and Zeus CLI v1.9.3 for reproducibility. It generates a new 480×480 ZPK; it does not modify or republish the original author's repository.

To reproduce locally, use Python 3.12, Node 22 and follow the steps in `.github/workflows/build.yml`.

## Credits and licensing

Based on [Sextant by raetha](https://github.com/raetha/zepp-watch-faces), licensed [CC BY-NC-SA 4.0](LICENSE). Original artist/developer attribution is required; derivatives must remain noncommercial and share-alike. This project is not endorsed by raetha, Zepp, Amazfit or Huami.
