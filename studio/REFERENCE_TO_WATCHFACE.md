# WatchWit Studio — Reference-to-Watchface Contract

## User goal

A user provides a watchface image as a visual reference. Deliver an independently installable Amazfit Balance 2 watchface that preserves the supplied design's composition and appearance, while allowing users to choose the metrics in each eligible complication slot and tap a complication to open its relevant watch app.

The reference image is a **design specification**, not a single background bitmap. Never simply paste fixed sample readings into the background. All data values, icons, rings, date and time that can change must be separate runtime elements and must match the artwork at native 480 × 480 resolution.

## Required deliverables for every future reference

1. Archived reference and a 480 × 480 annotated layout with named elements, safe areas, font choices, visual tokens, asset layers and interaction zones.
2. A Studio JSON blueprint containing exact component bounds, visual styles, slot metadata and suggested defaults.
3. A generated preview using **the actual Zepp graphics** and the target font metrics; include representative time/date and realistic samples.
4. A six-or-more-scenario gallery: normal, worst-case long value, unavailable sensor, different day/date, all selected themes and edit mode.
5. Installable ZPK with **distinct app ID and version**, plus a versioned QR link. Classic must remain unaffected.
6. A machine-readable quality report with boundary, clipping, collision, interaction and accessibility checks. CI must not report a visual PASS solely because ZPK compilation succeeded.

## Dynamic and editable complications

Each complication must define:
- `slotId`, bounds, content layers, default `metricId` and selectable metric type IDs;
- available metrics and supported hardware data sources, including value units and formatting;
- icon, value and label positioning that survive selected metric changes;
- state: loading, unavailable, normal, maximum, and zero;
- optional progress calculation and separate visual progress arc/track;
- click action: open an appropriate existing Zepp system app through a real supported routing API. Do not claim tapability where no action is available;
- editing behavior: tap/long press to select the complication, use Zepp's native full-screen selection list with icons where supported, persist selection and restore after reload.

Preserve metric IDs and saved assignments when updating the watchface. Mapping *slot* positions to metric choices must never silently change old user preferences.

## Visual requirements

- Draw at native 480 × 480; use component masks appropriate to the *round* screen, not rectangular bounding-box assumptions.
- Preview must use the same composition and font resources as the Zepp runtime. Avoid synthetic fonts or screenshots that differ from the watch.
- Enforce a readable text hierarchy and minimum viable icon/label sizes on hardware. Trade decorative labels for a bigger value when constrained.
- Edit-mode previews, selection highlights and tap regions must fit the shapes of the visible complications; editing must not cover unrelated elements.
- Show a side-by-side reference and generated render and log concrete differences in size, spacing, typography, material/color, and hierarchy.
- Never call a build 'pixel-perfect' without evidence; hardware screenshots are the final verification.

## Workflow

Reference intake → visual decomposition → Studio blueprint → static layered asset design → dynamic component binding → state gallery → geometry/legibility/accessibility checks → genuine Zepp render → comparison → device testing → revision → separately versioned release.

**Release gate:** all automated checks must pass AND the generated preview must receive visual approval before calling the design finished. Unknown device behavior should be labeled unverified, not assumed to work.

## Roadmap for Studio

- [x] Browser-based drag/editor of generic components, save/load JSON, basic geometry checks.
- [x] Initial Studio-to-Zepp blueprint consumption in the Reference branch for slot positions and clock size.
- [ ] A complete portable layout schema covering style, layers, interactions, metrics and settings (current JSON is partial).
- [ ] A shape-aware layout engine with exact font metrics and automatic worst-case stress previews.
- [ ] A genuine WYSIWYG Zepp component preview and screenshot regression comparisons.
- [ ] Automatic reliable asset and widget code export for arbitrary user-provided designs.
- [ ] Native watch interaction testing, tap-routing checks and watchface state screenshots.

This file is a requirements contract; it does not imply that unchecked roadmap items are implemented.
