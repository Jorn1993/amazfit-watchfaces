# WatchWit Studio — Visual watchface design MVP

WatchWit Studio is the visual design entry point for WatchWit watchfaces. It is hosted at https://jorn1993.github.io/amazfit-watchfaces/studio/ and source-controlled in `studio/index.html`.

## Current capabilities

- 480 × 480 circular watchface canvas, with a visible inner safe-area guide
- Movable and editable clock, complication card, date, and brand components
- Theme-independent element colors, positions, dimensions and sample content
- Mouse/touch drag, keyboard nudging, Undo, save to browser, import/export JSON
- Scenario testing for normal, long, and unavailable complication values
- Geometric warnings for overlap, out-of-bounds component corners, probable text overflow and undersized cards
- Static first-party app: no server, accounts, uploads, or backend dependencies

## Design source of truth

Exported `watchwit-layout.json` is a versioned *design blueprint*, not a compiled Zepp application. Schema 1 specifies:

```json
{
  "schemaVersion": 1,
  "device": "Amazfit Balance 2",
  "canvas": { "width": 480, "height": 480, "round": true, "safeInset": 18 },
  "elements": [{
    "id": "clock",
    "type": "clock",
    "x": 75, "y": 207, "w": 330, "h": 101,
    "value": "10:08", "label": "", "symbol": "",
    "fontSize": 78, "color": "#eff7ff"
  }]
}
```

Geometry is expressed in native pixels. Element `type` is one of `card`, `clock`, `date`, `brand`. IDs are unique. Imported files must match canvas width and schema version.

## Quality gates and limits

1. Browser preview and blueprint warnings come first.
2. Verify long values, varying dates, missing data, and the round safe area.
3. Visual approval requires a real 480 × 480 screenshot and comparison with the design.
4. **Zepp export is not implemented in Studio MVP**. The current JSON is not compiled automatically into a .zpk. A future adapter must map these primitives to Zepp widgets/assets, use the same fonts/metrics, and fail builds when clipping is detected.
5. The current overlap check catches intersections between *blueprint element boxes*. It does not prove absence of collisions among Zepp's firmware-rendered glyphs or overlays. No claim of pixel-perfect Zepp rendering is made.

## Development

Edit `studio/index.html`; the main GitHub Actions workflow validates its embedded JavaScript with `node --check` and copies it to `site/studio/index.html` for GitHub Pages. WatchWit Classic remains on the same main release path.

Next integration milestones: shared renderable layout schema, asset/widget exporter, browser screenshot snapshots, multi-resolution/locale testing, and Zepp simulator comparison.
