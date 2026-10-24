# Nautic Palette

Independent Zepp OS watchface project, maintained in this repository. Completely separate from Luce and Movement Platform.

## Watchface

Designed for 480 × 480 round displays, including the Amazfit Balance 2.

The watchface retains its existing layout, six configurable complications, gauge progress, tap interactions, battery and date display, weather, red automatic night mode, and Always-On Display.

Available themes:

| Theme | Appearance |
|---|---|
| Color | Multicolor complications and warm-toned main clock |
| Mono | White and gray |
| Mix | White time, date, and general UI; colorful complication values, icons and progress |
| Blue | Blue throughout |
| Green | Green throughout |
| Purple | Purple throughout |
| Orange | Orange throughout |
| Pink | Pink throughout |

## Install through Zepp

Open the dedicated installation page:

**https://jorn1993.github.io/amazfit-watchfaces/**

Scan the QR code with **Zepp → Profile → your watch → Developer Mode → Scan**.

If Developer Mode isn't visible, open **Zepp → Profile → Settings → About** and tap the Zepp logo seven times.

The QR code contains the Zepp installation URI:

`zpkd1://jorn1993.github.io/amazfit-watchfaces/nautic-palette/nautic-palette.zpk`

This URL needs public HTTPS access so Zepp can retrieve the compiled package. The face has a separate app ID (`21319240`) and can be installed alongside existing watchfaces.

Once installed, long-press the face, choose **Edit**, and select the desired theme in the existing theme picker.

## Build and deployment

All watchface source, generator tools and test scenarios live **inside this repository**. No other watchface repository needs to be cloned, downloaded, or modified during normal builds.

A push to `main` that changes the watchface starts `.github/workflows/build.yml`, which:

1. Generates the complete graphics and layouts for every theme.
2. Runs the automated Zepp OS watchface scenarios.
3. Compiles and validates the 480 × 480 `.zpk`.
4. Generates the Zepp QR code and installation site.
5. Publishes the installation page through GitHub Pages.

Key files:

- `faces/sextant/watchface/`: Watchface runtime and layouts.
- `faces/sextant/design/`: Asset generator.
- `faces/sextant/scenarios/`: Test scenarios.
- `faces/sextant/app.json`: Application manifest.
- `lib/`: Local supporting code.
- `fonts/`: Font assets and accompanying font notice.
- `tools/`: Local build/test tooling.
- `.github/workflows/build.yml`: Production build.

**Build state:** Automated compilation and deployment have previously passed. Installation and appearance on a physical Balance 2 still need confirmation.
