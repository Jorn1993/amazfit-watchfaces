# WatchWit Orbit — design and release specification

## Identity
- Independent app ID: `21319242`.
- App display name: **WatchWit Orbit v0.1.1**.
- Stable sibling: WatchWit Classic on `main` (`21319240`).
- Separate install QR: https://jorn1993.github.io/amazfit-watchfaces/preview/

## 480 × 480 visual specification
- Black/navy radial background and three restrained orbital accent sweeps.
- One centered digital clock with a lightweight surrounding rounded rectangle.
- A concise date + battery header above the clock, never on top of time digits.
- Six separate horizontal capsule modules, preserving customizable selections:
  - Top-left center (106, 103)
  - Top-middle center (240, 103)
  - Top-right center (374, 103)
  - Bottom-left center (106, 373)
  - Bottom-middle center (240, 373)
  - Bottom-right center (374, 373)
- Every module is 122 × 98 pixels. Each live data field and complication editor target must remain inside its own card.
- Avoid free-floating glances in the content; the OS handles status badges.
- No gradients, animations, or overlays should require one-second CPU redraws.

## Validation gates
1. `python3 tools/check_orbit_geometry.py` — safe-area and inter-card spacing.
2. Generate assets: `python3 faces/sextant/design/generate.py`.
3. `python3 tools/check_orbit_runtime_layout.py` — verify actual measured generated widgets against module geometry.
4. Run the existing scenario suite and compile the Zepp OS ZPK.
5. Inspect the native 480 × 480 art and verify manifest and version-specific QR target.
6. Verify on Balance 2: live time, editable complications, always-on display, sleep/resume, theme changes, app shortcuts and power consumption. CI alone cannot prove real-world visual appearance or battery impact.

## Release rules
- Do not merge Orbit into Classic. Reuse generic fixes deliberately, without replacing either visual design.
- Version number must be shown in the installed watchface name.
- Changes that could cause any overlap must be blocked by a failing geometry test before deployment.
- Do not claim real-watch verification unless a physical Balance 2 has been tested.
