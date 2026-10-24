# WatchWit

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

## Size optimization (introduced in v0.1.1)

The package reuses byte-for-byte identical generated bitmaps without altering the watchface design: Mix shares Color complication icons and progress-marker graphics; weather conditions with the same icon or description share one image; single-hue palettes reuse their uniform marker graphics. All eight editable color themes, automatic night mode, and Always-On Display remain available. The v0.1.1 version increment lets Zepp recognize this as an update to v0.1.0.

## Install through Zepp

**[Open the WatchWit installation page](https://jorn1993.github.io/amazfit-watchfaces/)**

- **[Save QR image for WatchWit v0.2.1](https://jorn1993.github.io/amazfit-watchfaces/nautic-palette/WatchWit-v0.2.1-QR.png)** — includes the watchface name and version number, and can be saved to your phone's gallery.
- [Download the current ZPK](https://jorn1993.github.io/amazfit-watchfaces/nautic-palette/nautic-palette.zpk)

In the Zepp app, select **Profile → your watch → Developer Mode → Scan** and scan the QR code displayed on another screen.

If Developer Mode is not visible, open **Zepp → Profile → Settings → About** and tap the Zepp logo seven times. The QR contains `zpkd1://jorn1993.github.io/amazfit-watchfaces/nautic-palette/nautic-palette.zpk`; Zepp downloads the package from that public HTTPS address.

Once installed, the face is labeled **WatchWit v0.2.1** in the watchface selection screen, so the installed version is visible without opening Zepp. Long-press the face, choose **Edit**, and select a theme in the editor.

## Complication selection (v0.2.0)

On the watch, long-press WatchWit and open **Edit**. Tap any complication slot to open Zepp OS's built-in **full-screen selection list** rather than cycling one-by-one. Select the item you want and finish editing normally. This uses the native Zepp watchface `select_list` setting; actual appearance and behavior should be confirmed on the Balance 2.

## Editor improvements (v0.2.1)

The complication list now supplies an icon asset for each metric, in addition to the existing editor preview. On return from edit mode, the face avoids an unnecessary second full update after a theme change. Whether Zepp firmware displays icons in the native selector must be confirmed on an actual Balance 2.

## Battery and refresh behavior

WatchWit is an event-driven digital watchface. The time refreshes once per minute; sensor changes can trigger additional complication updates, throttled to at most once per second. Always-On Display draws a simplified face and does not redraw live complications. The compass sensor is started only when a compass complication is selected and the watchface is active.

Since v0.1.1, repeated date and battery values do not trigger redundant UI property updates. In v0.2.0, non-compass sensor events are rate-limited to reduce full redraws, and sensor-triggered updates are skipped while the face is paused; screen resume and minute ticks still refresh the face. This reduces unnecessary rendering work but **does not establish a measured battery-life improvement**. Real consumption depends on your selected complications, always-on display, raise-to-wake usage, sensors, screen brightness and activity tracking.

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
