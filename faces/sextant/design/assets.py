"""Generate every watch-face asset plus watchface/layout.generated.js.

Run:  python3 faces/sextant/design/generate.py   (or `npm run assets`)
"""
import json
import math
import shutil
import numpy as np
from PIL import Image, ImageDraw

from . import config as K
from . import geometry as G
from zfkit import fonts as F
from zfkit.icons import (METRIC_SVG, BATTERY_SVG, BATTERY_FILL_VB, GLANCE_SVG, GLANCE_OFF_SVG, weather_svg, svg_to_image, retint)

S = 3                      # supersampling for vector drawing
OUT = K.ASSET_DIR
THEME_NAMES = list(K.THEMES)


def P(v):
    return int(round(v * S))


def lerp(a, b, t):
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def save(img, rel):
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    return rel


def down(img):
    return img.resize((img.width // S, img.height // S), Image.LANCZOS)


def hexint(rgb):
    return int("%02x%02x%02x" % tuple(rgb), 16)


# ============================================================================= backgrounds
def draw_band(img, theme):
    t = K.THEMES[theme]
    if t["band"] is not None:
        _band_fill(img, t)
    d = ImageDraw.Draw(img)
    for fn in (G.band_top_y, G.band_bot_y):
        xs = np.linspace(-10, K.W + 10, 1200)
        for xa, xb in zip(xs[:-1], xs[1:]):
            f = 1 - abs((xa + xb) / 2 / K.W - 0.5) * 2
            col = lerp(t["glow_lo"], t["accent"], K.BRASS_FLOOR + (1 - K.BRASS_FLOOR) * max(0, f) ** 1.8)
            d.line([P(xa), P(fn(xa)), P(xb), P(fn(xb))], fill=col, width=P(K.LINE_W))


def _band_fill(img, t):
    lo, hi = t["band"]
    # horizontal gradient with a little noise so dark themes do not band
    f = (np.abs(np.arange(img.width) / img.width - 0.5) * 2) ** 1.4
    col = np.array(lo, float)[None, :] * (1 - f[:, None]) + np.array(hi, float)[None, :] * f[:, None]
    rng = np.random.default_rng(7)
    arr = col[None, :, :] + rng.uniform(-1.6, 1.6, (img.height, img.width, 3))
    arr = np.clip(np.round(arr), 0, 255).astype(np.uint8)
    grad = Image.fromarray(np.dstack([arr, np.full(arr.shape[:2], 255, np.uint8)]), "RGBA")
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).polygon(G.band_polygon(S), fill=255)
    img.paste(grad, (0, 0), m)


def draw_dividers(d, theme):
    col = K.THEMES[theme]["divider"]
    for top in (True, False):
        for side in "LR":
            pts = G.divider_points(side, top)
            y0 = K.BAND_T - K.DIV_START_GAP if top else K.BAND_B + K.DIV_START_GAP
            pts = [(pts[0][0], y0)] + pts[1:]
            d.line([(P(x), P(y)) for x, y in pts], fill=col, width=P(K.LINE_W), joint="curve")


def draw_separators(d, col, theme=None):
    """Band separators. With a theme they take the band edges' look: brass in the middle
    fading towards the dim edge colour at the ends (BRASS_FLOOR keeps some brass). Without
    one (the always-on screen) they're a plain line in col."""
    for i in (0, 1):
        pts = G.separator_points(i)
        if not theme:
            d.line([(P(x), P(y)) for x, y in pts], fill=col, width=P(K.LINE_W), joint="curve")
            continue
        t = K.THEMES[theme]
        segs = []
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            n = 40
            segs += [((x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n), (x1 + (x2 - x1) * (k + 1) / n, y1 + (y2 - y1) * (k + 1) / n)) for k in range(n)]
        half = (pts[-1][1] - pts[0][1]) / 2
        for (xa, ya), (xb, yb) in segs:
            f = 1 - abs((ya + yb) / 2 - K.MID) / half
            d.line([P(xa), P(ya), P(xb), P(yb)], fill=lerp(t["glow_lo"], t["accent"], K.BRASS_FLOOR + (1 - K.BRASS_FLOOR) * max(0, f) ** 1.8), width=P(K.LINE_W))


RULE_PTS = {}


def rule_points(y, top):
    """Polyline for the rule between a status pair and its metric: a flat middle (RULE_FLAT)
    whose ends bend towards the rim along the line from the flat end to the divider's elbow,
    stopping RULE_END_GAP from the dividers' vertical parts."""
    edge = G.DIV_X[0] + K.LINE_W / 2 + K.RULE_END_GAP
    ey = G.DIV_ELBOW_Y if top else K.W - G.DIV_ELBOW_Y
    fx = K.C - K.RULE_FLAT / 2                                  # flat part's left end
    slope = (ey - y) / (G.DIV_X[0] - fx)                        # dy per unit x toward the elbow
    yl = y + slope * (edge - fx)
    return [(edge, yl), (fx, y), (K.W - fx, y), (K.W - edge, yl)]


def rule_image(pts, theme, x0, y0):
    t = K.THEMES[theme]
    xs = [p[0] for p in pts]
    w = math.ceil(max(xs) - x0 + K.LINE_W)
    h = math.ceil(max(p[1] for p in pts) - y0 + K.LINE_W)
    img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    q = [(P(x - x0), P(y - y0)) for x, y in pts]
    d.line(q, fill=t["divider"] + (255,), width=P(K.LINE_W), joint="curve")
    r = P(K.LINE_W / 2)
    for x, y in (q[0], q[-1]):                                  # round caps
        d.ellipse([x - r, y - r, x + r, y + r], fill=img.getpixel((max(0, min(img.width - 1, int(x))), max(0, min(img.height - 1, int(y))))))
    return down(img)


MARKER_TIP_R, MARKER_BASE_R, MARKER_HALF_W, MARKER_BOX = K.RING_R - 13, K.RING_R + 1, 5.0, 16


def marker_image(zepp_deg, col):
    """A triangle marker at zepp_deg (tip towards the centre), cut to a small box around it."""
    big = Image.new("RGBA", (K.W * S, K.W * S), (0, 0, 0, 0))
    a = math.radians(zepp_deg)
    ux, uy = math.sin(a), -math.cos(a)                 # outward
    vx, vy = math.cos(a), math.sin(a)                  # tangent
    tip = (K.C + MARKER_TIP_R * ux, K.C + MARKER_TIP_R * uy)
    bc = (K.C + MARKER_BASE_R * ux, K.C + MARKER_BASE_R * uy)
    pts = [tip, (bc[0] - MARKER_HALF_W * vx, bc[1] - MARKER_HALF_W * vy), (bc[0] + MARKER_HALF_W * vx, bc[1] + MARKER_HALF_W * vy)]
    ImageDraw.Draw(big).polygon([(P(x), P(y)) for x, y in pts], fill=col + (255,))
    cx, cy = K.C + (MARKER_TIP_R + MARKER_BASE_R) / 2 * ux, K.C + (MARKER_TIP_R + MARKER_BASE_R) / 2 * uy
    x0, y0 = int(round(cx - MARKER_BOX / 2)), int(round(cy - MARKER_BOX / 2))
    crop = big.crop((x0 * S, y0 * S, (x0 + MARKER_BOX) * S, (y0 + MARKER_BOX) * S))
    return down(crop), x0, y0


def compass_angles():
    """Marker angles (zepp degrees): north, south and the four diagonals. The diagonals sit
    half a degree off 45 so the whole-degree ticks either side are equally far away; with
    DIAG_AT_GAUGE_MID they sit at the corner gauges' mid-points instead (43.5 deg), on the
    line through the turned corner values (Twisted Sextant)."""
    d = corner_alpha() if K.DIAG_AT_GAUGE_MID else 45.5
    return [0, d, 180 - d, 180, 180 + d, 360 - d]


def make_markers():
    """Triangle markers (tip towards the centre) at compass_angles(). Images, because the
    firmware draws arcs only in whole degrees. For each marker k and theme: m{k}_brass
    (until its gauge's fill passes it) and m{k}_lit_{metric} (after)."""
    out = []
    for k, ang in enumerate(compass_angles()):
        for theme in THEME_NAMES:
            t = K.THEMES[theme]
            img, x0, y0 = marker_image(ang, t["accent"])
            save(img, f"marker/{theme}/m{k}_brass.png")
            # Color uses a different color for each lit metric. Mix reuses those
            # exact same bitmaps. Mono/night need just one shared uniform lit
            # bitmap, and single-hue themes reuse their brass marker.
            if theme == "color":
                metrics = (m for m, v in K.METRICS.items() if v[2])
            elif theme in ("mono", "night"):
                metrics = ("steps",)
            else:
                metrics = ()
            for metric in metrics:
                save(marker_image(ang, metric_rgb(theme, metric))[0], f"marker/{theme}/m{k}_lit_{metric}.png")
        out.append(dict(k=k, a=ang, x=x0, y=y0))
    return out


def round_crop(img):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).ellipse([0, 0, img.width - 1, img.height - 1], fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 255))
    out.paste(img, (0, 0), m)
    return out


def make_backgrounds():
    """Premium six-gauge WatchWit design, rendered at native 480 px.

    The Studio blueprint supplies widget positions. Backgrounds contain only
    decorative graphics: never sample time, sensor numbers, or icon text.
    """
    import cairosvg
    import io
    paths = {}
    for theme in THEME_NAMES:
        t = K.THEMES[theme]
        color_mode = theme in ('color', 'mix')
        accent = '#%02x%02x%02x' % t['accent']
        def tint(value):
            return value if color_mode else accent
        aqua, warm, red, green = [tint(x) for x in
                                  ('#24cff9','#ffb244','#ff6268','#42e67c')]
        svg = ["""<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
        <defs>
          <radialGradient id="base"><stop stop-color="#183149"/>
            <stop offset=".66" stop-color="#081929"/>
            <stop offset="1" stop-color="#02070f"/></radialGradient>
          <radialGradient id="pod" cx=".44" cy=".23" r=".9"><stop stop-color="#172a3f"/>
            <stop offset=".46" stop-color="#081827"/><stop offset="1" stop-color="#010710"/></radialGradient>
          <linearGradient id="panel" x2="0" y2="1">
            <stop stop-color="#122d43"/><stop offset=".08" stop-color="#030d1b"/>
            <stop offset=".87" stop-color="#020a16"/><stop offset="1" stop-color="#17334c"/>
          </linearGradient>
          <linearGradient id="shine" x2="0" y2="1"><stop stop-color="#67dfff"/>
            <stop offset=".48" stop-color="#259cff"/><stop offset="1" stop-color="#0861d1"/></linearGradient>
        </defs>
        <circle cx="240" cy="240" r="239" fill="#01050b"/>
        <circle cx="240" cy="240" r="237" stroke="#7b94a9" stroke-width="1.2" fill="url(#base)"/>
        <circle cx="240" cy="240" r="229" stroke="#20374e" stroke-width="2" fill="none"/>
        """]
        def seg(cx,cy,r,aa,bb,width,colour,op=1):
            x1=cx+r*math.cos(math.radians(aa)); y1=cy+r*math.sin(math.radians(aa))
            x2=cx+r*math.cos(math.radians(bb)); y2=cy+r*math.sin(math.radians(bb))
            svg.append(f'<path d="M{x1:.2f},{y1:.2f} A{r},{r} 0 0 1 {x2:.2f},{y2:.2f}" '
                       f'fill="none" stroke="{colour}" stroke-width="{width}" opacity="{op}"/>')
        # No peripheral blocks: they competed with the six complication gauges,
        # were disconnected from live metrics and reduced usable screen space.
        svg.append('<circle cx="240" cy="240" r="226" fill="none" stroke="#1c344b" stroke-width="1.4"/>')
        # Central body with shaped shoulder silhouette and cyan inset rails.
        shoulder=('M 48 171 Q 58 163 81 162 L 139 162 Q 154 161 164 158 '
                  'Q 172 155 190 155 L 291 155 Q 310 155 317 156 '
                  'Q 325 161 342 162 L 400 162 Q 421 163 432 172 '
                  'Q 445 186 445 209 L 445 289 Q 443 303 425 309 '
                  'Q 409 313 393 313 L 87 313 Q 68 313 54 307 '
                  'Q 36 307 36 286 L 36 209 Q 36 185 48 171 Z')
        svg += [f'<path d="{shoulder}" fill="#081726" stroke="#2c4e68" stroke-width="3"/>',
                f'<path d="{shoulder}" fill="none" stroke="{aqua}" stroke-width="1.2" opacity=".6"/>',
                '<rect x="48" y="172" width="384" height="141" rx="23" fill="url(#panel)" stroke="#267ea9" stroke-width="2"/>',
                f'<rect x="43" y="194" width="5" height="93" rx="2.5" fill="{aqua}"/>',
                f'<rect x="432" y="194" width="5" height="93" rx="2.5" fill="{aqua}"/>']
        # Raised pod rims are composed after the central panel. This avoids
        # the panel clipping their curved outlines or gauge indicators.
        # The six raised pods. No flat rectangular complication cards.
        for cx,cy,colour in ((119,100,aqua),(240,100,red),(361,100,warm),
                             (119,380,green),(240,380,aqua),(361,380,aqua)):
            svg.extend((
                f'<circle cx="{cx}" cy="{cy+2}" r="49" fill="#02070d" opacity=".8"/>',
                f'<circle cx="{cx}" cy="{cy}" r="47" fill="url(#pod)" stroke="#375874" stroke-width="2.6"/>',
                f'<circle cx="{cx}" cy="{cy}" r="43" fill="#020b16" stroke="#10263b" stroke-width="1.4"/>'))
            # Actual progress is drawn from Zepp sensors by live ARC_PROGRESS
            # widgets. Do not bake misleading fixed percentages into artwork.
            seg(cx,cy,49,8,161,1.1,'#2e668d',.70)
        svg.append('<path d="M239 176v19" stroke="#7197b3" opacity=".8" stroke-width="1"/>')
        # Accent underlines between pods, avoiding dynamic text.
        for xx in (180,300):
            for yy in (93,351):
                svg.append(f'<path d="M{xx} {yy}v26" stroke="#7294b1" stroke-width="1" opacity=".75"/>')
        svg.extend((f'<text x="240" y="443" font-size="16" font-weight="bold" '
                    f'fill="{aqua}" text-anchor="middle">W</text>',
                    '<text x="240" y="456" font-size="7.5" letter-spacing="3.4" '
                    'fill="#afc1d4" text-anchor="middle">WATCHWIT</text>','</svg>'))
        artwork=cairosvg.svg2png(bytestring=''.join(svg).encode(),output_width=480,output_height=480)
        img=Image.open(io.BytesIO(artwork)).convert('RGB')
        paths[theme]=save(img,f'bg/{theme}.png')
        paths[f'aod_{theme}']=save(Image.new('RGBA',(K.W,K.W),(0,0,0,0)),f'aod/bg_{theme}.png')
    return paths


# ============================================================================= time digits
def TF():
    """Extra-bold numeric instance for the six-gauge hero clock."""
    path = F.BUILD / "RobotoCondensed-ReferenceBold.ttf"
    if not path.exists():
        variable = F.TTFont(K.FONT_DIR / "RobotoCondensed[wght].ttf")
        F.instantiateVariableFont(variable, {"wght": 850}).save(path)
    return path


def solve_time_px():
    """Largest time size whose widest value keeps TIME_SIDE_GAP to each separator."""
    def gap(px):
        f = F.pil_font(str(TF()), px, S)
        adv = f.getlength("0", features=["tnum"]) / S
        ex = [F.ink_extent(TF(), px, ch) for ch in "0123456789"]
        colon = round(px * 22 / 124, 1)
        worst = 4 * adv + colon - min(e[0] for e in ex) - (adv - max(e[2] for e in ex))
        return (K.SEP_X[1] - 1 - (K.SEP_X[0] + 1) - worst) / 2
    lo, hi = 60, 200
    while hi - lo > 1:
        mid = (lo + hi) // 2
        lo, hi = (mid, hi) if gap(mid) >= K.TIME_SIDE_GAP else (lo, mid)
    return lo


def time_metrics():
    f = F.pil_font(str(TF()), K.TIME_PX, S)
    adv = f.getlength("0", features=["tnum"]) / S
    tops, bots, lefts, rights = [], [], [], []
    for ch in "0123456789":
        x0, t, x1, b = F.ink_extent(TF(), K.TIME_PX, ch)
        tops.append(t); bots.append(b); lefts.append(x0); rights.append(x1)
    return dict(adv=adv, top=min(tops), bot=max(bots), lsb_min=min(lefts), right_max=max(rights),
                colon_w=round(K.TIME_PX * 22 / 124, 1))


def make_time_digits():
    tm = time_metrics()
    pad = 3
    cell_w = int(math.ceil(tm["adv"]))
    cell_h = int(math.ceil(tm["bot"] - tm["top"])) + 2 * pad
    base_y = -tm["top"] + pad                       # baseline inside the cell
    f = F.pil_font(str(TF()), K.TIME_PX, S)
    styles = {name: K.THEMES[name]["time"] for name in THEME_NAMES}
    colon_w = int(math.ceil(tm["colon_w"]))
    ink_mid = (tm["top"] + tm["bot"]) / 2 - tm["top"] + pad   # ink centre inside cell
    for name, (c_top, c_bot) in styles.items():
        for ch in "0123456789":
            m = Image.new("L", (cell_w * S, cell_h * S), 0)
            ImageDraw.Draw(m).text((0, base_y * S), ch, font=f, fill=255, anchor="ls", features=["tnum"])
            grad = Image.new("RGB", m.size)
            gd = ImageDraw.Draw(grad)
            for y in range(m.height):
                tt = np.clip((y / S - pad) / (cell_h - 2 * pad), 0, 1)
                gd.line([(0, y), (m.width, y)], fill=lerp(c_top, c_bot, tt))
            img = grad.convert("RGBA"); img.putalpha(m)
            save(down(img), f"time/{name}/{ch}.png")
            if name == "color":
                cyan = Image.new("RGB", m.size)
                cdraw = ImageDraw.Draw(cyan)
                for yy in range(m.height):
                    blend = yy / max(1, m.height - 1)
                    cdraw.line([(0, yy), (m.width, yy)],
                               fill=lerp((55, 225, 253), (29, 124, 250), blend))
                cyan = cyan.convert("RGBA")
                cyan.putalpha(m)
                save(down(cyan), f"time_minute/{name}/{ch}.png")
        # colon
        acc = (31, 203, 245) if name == "color" else K.THEMES[name]["accent"]
        cimg = Image.new("RGBA", (colon_w * S, cell_h * S), (0, 0, 0, 0))
        cd = ImageDraw.Draw(cimg)
        r = 0.04 * K.TIME_PX
        for dy in (-0.153 * K.TIME_PX, 0.153 * K.TIME_PX):
            cx, cy = colon_w / 2, ink_mid + dy
            cd.rounded_rectangle([P(cx - r), P(cy - r), P(cx + r), P(cy + r)], radius=P(2), fill=acc + (255,))
        save(down(cimg), f"time/{name}/colon.png")
    # always-on outline digits
    for theme in THEME_NAMES:
        col = K.THEMES[theme]["aod_time"]
        for ch in "0123456789":
            img = Image.new("RGBA", (cell_w * S, cell_h * S), (0, 0, 0, 0))
            ImageDraw.Draw(img).text((0, base_y * S), ch, font=f, fill=(0, 0, 0, 0), anchor="ls",
                                     features=["tnum"], stroke_width=P(K.AOD_STROKE), stroke_fill=col + (255,))
            save(down(img), f"aod/time_{theme}/{ch}.png")
        cimg = Image.new("RGBA", (colon_w * S, cell_h * S), (0, 0, 0, 0))
        cd = ImageDraw.Draw(cimg)
        r = 0.035 * K.TIME_PX
        for dy in (-0.153 * K.TIME_PX, 0.153 * K.TIME_PX):
            cx, cy = colon_w / 2, ink_mid + dy
            cd.rounded_rectangle([P(cx - r), P(cy - r), P(cx + r), P(cy + r)], radius=P(2), fill=col + (255,))
        save(down(cimg), f"aod/time_{theme}/colon.png")
    return {**tm, "cell_w": cell_w, "cell_h": cell_h, "colon_w": colon_w, "ink_mid": ink_mid}


# ============================================================================= icons
def centred(img, size):
    """The icon's drawing centred in a size x size box. Icon art doesn't always sit in the
    middle of its canvas, which made the icon-to-value gaps look uneven."""
    bb = img.getchannel("A").getbbox()
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if not bb:
        return out
    art = img.crop(bb)
    out.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return out


def battery_ink_h():
    img = centred(svg_to_image(BATTERY_SVG("#ffffff"), K.BATTERY_ICON_PX), K.BATTERY_ICON_PX)
    bb = img.getchannel("A").getbbox()
    return bb[3] - bb[1]


def battery_fill_box():
    """Where the full charge sits inside the battery icon's box, in whole pixels: the same
    shift as centred() applies to the outline, so the fill lands exactly inside it."""
    px = K.BATTERY_ICON_PX
    raw = svg_to_image(BATTERY_SVG("#ffffff"), px)
    bb = raw.getchannel("A").getbbox()
    dx = (px - (bb[2] - bb[0])) // 2 - bb[0]
    dy = (px - (bb[3] - bb[1])) // 2 - bb[1]
    s = px / 24
    x, y, w, h = BATTERY_FILL_VB
    x0, y0 = round(x * s + dx), round(y * s + dy)
    x1, y1 = round((x + w) * s + dx), round((y + h) * s + dy)
    return dict(dx=x0, dy=y0, w=x1 - x0, h=y1 - y0, radius=1)


def metric_rgb(theme, metric):
    if theme in ("color", "mix"):
        return K.hexrgb(K.METRICS[metric][1])
    return K.THEMES[theme]["metric"]


def make_icons():
    for theme in THEME_NAMES:
        # Mix's metric and weather icons are byte-identical to Color's icons.
        # The renderer intentionally points Mix at icons/color instead.
        if theme != "mix":
            for metric in list(METRIC_SVG):
                base = metric if metric in K.METRICS else metric.split("_")[0] if metric.split("_")[0] in K.METRICS else "sun"
                rgb = metric_rgb(theme, base)
                svg = METRIC_SVG[metric]("#%02x%02x%02x" % rgb)
                save(centred(svg_to_image(svg, K.ICON_PX), K.ICON_PX), f"icons/{theme}/{metric}.png")
            # Zepp's weather conditions have repeated icon types; their indexed
            # level array can safely point more than one condition at one image.
            seen_weather = set()
            for i, (kind, _) in enumerate(K.WEATHER):
                if kind in seen_weather:
                    continue
                seen_weather.add(kind)
                small = retint(svg_to_image(weather_svg(kind), K.ICON_PX), theme, K.THEMES[theme].get("metric"))
                save(centred(small, K.ICON_PX), f"icons/{theme}/weather_{i}.png")
                if i == 0:
                    save(centred(small, K.ICON_PX), f"icons/{theme}/forecast.png")
        for level, hx in K.BATTERY_COLORS.items():
            rgb = K.hexrgb(hx) if theme == "color" else K.THEMES[theme]["metric"]
            save(centred(svg_to_image(BATTERY_SVG("#%02x%02x%02x" % rgb), K.BATTERY_ICON_PX), K.BATTERY_ICON_PX), f"battery/{theme}/{level}.png")
        for name, svg in GLANCE_SVG.items():
            status_tint = "mono" if theme == "mix" else theme
            img = centred(retint(svg_to_image(svg, K.GLANCE_SIZE), status_tint, K.THEMES[theme].get("metric")), K.GLANCE_SIZE)
            # the active icon covers the always-drawn off icon, so it sits on a black disc
            # (the colour of the section panels it's on, so the disc doesn't show)
            backed = Image.new("RGBA", img.size, (0, 0, 0, 0))
            ImageDraw.Draw(backed).ellipse([0, 0, img.width - 1, img.height - 1], fill=(0, 0, 0, 255))
            backed.alpha_composite(img)
            save(backed, f"status/{theme}/{name}.png")
            off = centred(retint(svg_to_image(GLANCE_OFF_SVG[name], K.GLANCE_SIZE), status_tint, K.THEMES[theme].get("muted_icon")), K.GLANCE_SIZE)
            save(off, f"status/{theme}/{name}_off.png")
    # always-on battery icon (dim, single colour per theme)
    for theme in THEME_NAMES:
        rgb = K.THEMES[theme]["aod_text"]
        save(centred(svg_to_image(BATTERY_SVG("#%02x%02x%02x" % rgb), K.BATTERY_ICON_PX), K.BATTERY_ICON_PX), f"aod/battery_{theme}.png")


# ============================================================================= weather condition text
def make_desc_images(box):
    """One image per weather condition and theme, for an IMG_LEVEL bound to WEATHER_CURRENT.

    Face code can't read the current condition at any API level, but a bound IMG_LEVEL is
    given it by the firmware, so the condition name is drawn as images."""
    asc, desc = F.vmetrics(str(F.TEXT_FONT))
    px = K.DESC_PX
    line_h = (asc + desc) * px
    baseline = (box["h"] - line_h) / 2 + asc * px           # same placement as a TEXT widget
    f = F.pil_font(str(F.TEXT_FONT), px, S)
    for theme in THEME_NAMES:
        col = K.THEMES[theme]["desc"]
        seen_desc = set()
        for i, (_, text) in enumerate(K.WEATHER):
            if text in seen_desc or (not text and theme != "color"):
                continue
            seen_desc.add(text)
            img = Image.new("RGBA", (box["w"] * S, box["h"] * S), (0, 0, 0, 0))
            if text:
                ImageDraw.Draw(img).text((img.width / 2, baseline * S), text, font=f, fill=col + (255,), anchor="ms")
            save(down(img), f"desc/{theme}/{i}.png")
    return dict(x=int(round(box["x"])), y=box["y"], w=box["w"], h=box["h"])


def make_pod_weather_descriptions():
    """Small current-condition labels inside the bottom weather gauge."""
    px, width, height = 14, 106, 17
    for theme in THEME_NAMES:
        seen = set()
        for index, (_, label) in enumerate(K.WEATHER):
            if label in seen or (not label and theme != "color"):
                continue
            seen.add(label)
            image = Image.new("RGBA", (width * S, height * S), (0, 0, 0, 0))
            if label:
                size = px
                font = F.pil_font(str(F.TEXT_FONT), size, S)
                while size > 10 and ImageDraw.Draw(image).textbbox((0, 0), label, font=font)[2] > (width-4)*S:
                    size -= 1
                    font = F.pil_font(str(F.TEXT_FONT), size, S)
                d = ImageDraw.Draw(image)
                d.text((width*S/2, height*S/2), label, font=font,
                       fill=K.THEMES[theme]["muted"]+(255,), anchor="mm")
            save(down(image), f"pod_desc/{theme}/{index}.png")


# ============================================================================= layout maths
def text_box(px, cx, ink_cy, w, sample="0123456789"):
    y, h = F.text_box_for_ink_centre(F.TEXT_FONT, px, ink_cy, sample)
    return dict(x=round(cx - w / 2, 1), y=y, w=w, h=h, size=px)


def digit_h(px):
    _, t, _, b = F.ink_extent(F.TEXT_FONT, px, "0123456789")
    return b - t


def cap_h(px):
    _, t, _, b = F.ink_extent(F.TEXT_FONT, px, "HEOTX")
    return b - t


def solve_side_x():
    """Centre x for the corner values: a 5-digit value ("99,999") gets equal gaps to the
    divider stroke and to the inner end of the long ticks."""
    x0, t, x1, b = F.ink_extent(F.TEXT_FONT, K.VALUE_PX, "99,999")
    w = x1 - x0
    h = digit_h(K.VALUE_PX)
    ring_in = K.RING_R - K.TICK_MAJOR
    div_edge = K.DIV_X[0] - 1
    y_top = K.ELBOW_Y
    lo, hi = 60.0, 180.0
    for _ in range(60):
        cx = (lo + hi) / 2
        xa, xb = cx - w / 2, cx + w / 2
        rg = min(ring_in - math.hypot(xa - K.C, y - K.C) for y in (y_top, y_top + h))
        if rg < div_edge - xb:
            lo = cx
        else:
            hi = cx
    cx = (lo + hi) / 2
    gap = div_edge - (cx + w / 2)
    return round(cx, 1), round(w, 1), round(gap, 1)


def char_widths(px):
    chars = "0123456789,.-:%° /" + "".join(sorted(set("".join(K.UNIT_CHARS.values()))))
    return {c: round(F.advance(F.TEXT_FONT, px, c), 2) for c in chars}


# ============================================================================= turned corners (Twisted Sextant)
ROT_SET = {0: "n", 1: "p", 2: "p", 4: "n"}     # slot -> rotation set (TL, TR, BL, BR)
ROT_CHARS = {**{str(d): str(d) for d in range(10)}, ",": "comma", ".": "dot", "-": "dash", ":": "colon",
             "%": "pct", "/": "slash", "°": "deg"}


def rot_code(c):
    """File-name code for a glyph (letters keep their case apart on any file system)."""
    return ROT_CHARS.get(c) or (f"cap_{c}" if c.isupper() else c)


def corner_alpha():
    """Angle (deg) of the corner gauges' mid-point from the nearest centre line."""
    t = list(G.segment_ticks(G.ring_segments()[0]))
    # the extra tick extends the divider end by one step; each tick covers [z - 1, z] here
    mid = (G.to_zepp(t[0]) + K.TICK_STEP + G.to_zepp(t[-1])) / 2 - 0.5
    return 360 - mid


def rot_rho(name):
    return -corner_alpha() if name == "n" else corner_alpha()


def rot_q(px):
    return int(math.ceil(px * 1.7 / 2)) * 2


def rot_glyph(c, px, rgb):
    """One upright glyph on a square canvas whose centre sits on the value's ink centre
    line (horizontally: the middle of the glyph's advance). The face code places one
    per character along the gauge and the firmware turns it (IMG `angle`), so every
    glyph of a value, and its unit, shares one anchor line."""
    q = rot_q(K.VALUE_PX)
    _, top, _, bot = F.ink_extent(F.TEXT_FONT, K.VALUE_PX, "0123456789")
    img = Image.new("RGBA", (q * S, q * S), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((q * S / 2, q * S / 2 - (top + bot) / 2 * S), c, font=F.pil_font(F.TEXT_FONT, px, S),
                             fill=tuple(rgb) + (255,), anchor="ms")
    return down(img)


def make_rot_assets():
    """TURN_CORNERS: one image per character and theme (the firmware rotates them)."""
    if not K.TURN_CORNERS:
        return
    for theme in THEME_NAMES:
        t = K.THEMES[theme]
        for c, code in ROT_CHARS.items():
            save(rot_glyph(c, K.VALUE_PX, t["text"]), f"rot/{theme}/{code}.png")
        for metric, chars in K.UNIT_CHARS.items():
            for c in chars:
                save(rot_glyph(c, K.UNIT_PX, metric_rgb(theme, metric)), f"rot/{theme}/u_{metric}_{rot_code(c)}.png")
    Image.new("RGBA", (1, 1), (0, 0, 0, 0)).save(OUT / "rot" / "blank.png")


def rotate_corners(centres, slots):
    """TURN_CORNERS: each corner takes the top- (or bottom-) middle layout turned about the
    centre to its gauge's mid-angle, so its value keeps the same gap to the ticks. The icon
    and the value's glyphs are turned by the firmware."""
    a = corner_alpha()
    tm, bm = centres[5], centres[3]
    for i, name in ROT_SET.items():
        rho = rot_rho(name)
        base = tm if i in (0, 1) else bm
        ca, sa = math.cos(math.radians(rho)), math.sin(math.radians(rho))
        def turn(y):
            dy = y - K.C
            return K.C - dy * sa, K.C + dy * ca
        vx, vy = turn(base[2])
        ix, iy = turn(base[1])
        box = slots[i]
        box["cx"] = round(vx, 1)
        box["value"] = text_box(K.VALUE_PX, vx, vy, 132)            # upright fallback (bound metrics)
        box["unit"]["y"] = round(box["unit"]["y"] - centres[i][2] + vy, 1)
        box["icon"] = dict(x=round(ix - K.ICON_PX / 2), y=round(iy - K.ICON_PX / 2), size=K.ICON_PX)
        rot = dict(deg=round(rho, 2), cos=round(ca, 5), sin=round(sa, 5), vx=round(vx, 2), vy=round(vy, 2), q=rot_q(K.VALUE_PX))
        # the icon's widget box is big enough for the turned drawing
        qi = int(math.ceil(K.ICON_PX * (abs(ca) + abs(sa)) / 2)) * 2 + 2
        rot["icon"] = dict(x=round(ix - qi / 2), y=round(iy - qi / 2), box=qi, pos=(qi - K.ICON_PX) // 2)
        box["rot"] = rot
        mx, my = (vx + ix) / 2, (vy + iy) / 2
        e = box["edit"]
        box["edit"] = dict(x=round(mx - e["w"] / 2), y=round(my - e["h"] / 2), w=e["w"], h=e["h"])
    return a


def build_layout(tm, bg_paths):
    L = {}
    # Orbit deliberately has no Classic outer gauge widgets: the accent arcs
    # are static artwork, keeping the face clean and battery-conscious.
    L["markers"] = dict(fixed=[])
    blueprint = json.loads((K.REPO / "studio" / "target-watchface.json").read_text())
    specs = {e["id"]: e for e in blueprint["elements"]}
    slot_names = ("steps", "calories", "battery", "weather", "distance", "heart")
    segments = []
    for name in slot_names:
        e = specs[name]
        cx, cy = round(e["x"] + e["w"]/2), round(e["y"] + e["h"]/2)
        ticks = []
        for k in range(12):
            angle = 210 + 10*k
            ticks.append(dict(s=angle, e=angle+7, len=5.8,
                              r_center=45, r_outer=48, cx=cx, cy=cy))
        segments.append(dict(ticks=ticks))
    L["gauge"] = dict(segments=segments)

    # ---------------------------------------------------------------- complications
    side_x, w99, side_gap = 106, 100, 12
    vh = digit_h(K.VALUE_PX)
    slots = []
    # Canonical watchface positions come from WatchWit Studio's editable JSON.
    # The ordered slots here retain Zepp's persistent complication indexing.
    blueprint = json.loads((K.REPO / "studio" / "target-watchface.json").read_text())
    if blueprint.get("schemaVersion") != 1 or blueprint.get("canvas", {}).get("width") != 480:
        raise ValueError("Incompatible WatchWit Studio blueprint")
    elements = {item["id"]: item for item in blueprint["elements"]}
    slot_names = ("steps", "calories", "battery", "weather", "distance", "heart")
    centres = []
    for name in slot_names:
        part = elements[name]
        cx = part["x"] + part["w"] / 2
        icon_cy = part["y"] + 23
        value_cy = part["y"] + 51
        centres.append((cx, icon_cy, value_cy))
    sections_rows = dict(top=160, bottom=320)
    RULE_PTS.clear()
    L["rules"] = []
    L["_notes_rim_gap"] = 16
    asc, desc = F.vmetrics(str(F.TEXT_FONT))
    for slot_name, (cx, icy, vcy) in zip(slot_names, centres):
        vbox = text_box(K.VALUE_PX, cx, vcy, 68)
        # unit box: shares the value's baseline
        v_line_h = (asc + desc) * K.VALUE_PX
        baseline = vbox["y"] + (vbox["h"] - v_line_h) / 2 + asc * K.VALUE_PX
        u_line_h = (asc + desc) * K.UNIT_PX
        u_h = int(round(u_line_h + 6))
        u_y = baseline - asc * K.UNIT_PX - (u_h - u_line_h) / 2
        top_y = min(icy - K.ICON_PX / 2, vcy - vh / 2) - 8
        bot_y = max(icy + K.ICON_PX / 2, vcy + vh / 2) + 8
        slots.append(dict(
            cx=round(cx, 1),
            icon=dict(x=round(cx - K.ICON_PX / 2), y=round(icy - K.ICON_PX / 2), size=K.ICON_PX),
            value=vbox,
            caption=dict(x=round(cx - 26), y=round(elements[slot_name]["y"] + 66), w=52, h=13, size=10),
            unit=dict(y=round(u_y, 1), h=u_h, size=K.UNIT_PX),
            edit=dict(x=round(cx - 58), y=round(top_y), w=116, h=round(bot_y - top_y)),
        ))
    if K.TURN_CORNERS:
        L["_notes_corner_angle"] = round(rotate_corners(centres, slots), 2)
    L["slots"] = slots
    L["char_widths"] = dict(value=char_widths(K.VALUE_PX), unit=char_widths(K.UNIT_PX), unit_gap=3)

    # ---------------------------------------------------------------- date stack (left of the time)
    small = K.DATE_SMALL_PX
    ch21, dh42 = cap_h(small), digit_h(K.DATE_DAY_PX)
    # gaps shrink from the approved 11.1/10.1 (21px lines) to 8/8 (42px lines)
    t_ = (small - 21) / 21
    gap1, gap2 = 11.1 + (8 - 11.1) * t_, 10.1 + (8 - 10.1) * t_
    stack_h = ch21 + gap1 + dh42 + gap2 + ch21

    def date_lines(cx, top):
        return dict(
            dow=text_box(small, cx, top + ch21 / 2, 100, "HEOTX"),
            day=text_box(K.DATE_DAY_PX, cx, top + ch21 + gap1 + dh42 / 2, 100),
            month=text_box(small, cx, top + ch21 + gap1 + dh42 + gap2 + ch21 / 2, 100, "HEOTX"),
        )
    side_l = K.SEP_X[0] / 2
    side_r = 389
    top = K.MID - stack_h / 2
    # Compact horizontal header above hero clock, not Classic side stacks.
    L["date"] = dict(
        dow=text_box(20, 170, 184, 75, "HEOTX"),
        month=text_box(20, 286, 184, 75, "HEOTX"),
        day=text_box(20, 357, 184, 42),
    )
    L["theme_edit"] = dict(x=110, y=174, w=260, h=29)

    bh = digit_h(K.BATTERY_VALUE_PX)
    # battery: the drawing is centred in its box and much shorter than it is wide, so
    # space it on the drawing itself, with the same visible gap as the complications
    bat_ink = battery_ink_h()
    blk = bat_ink + K.VISIBLE_ICON_GAP + bh
    btop = K.MID - blk / 2
    L["battery"] = dict(
        icon=dict(x=341, y=177, size=K.BATTERY_ICON_PX),
        text=text_box(17, 396, 188, 55),
    )

    # ---------------------------------------------------------------- time + description
    dh22 = cap_h(K.DESC_PX)
    th = tm["bot"] - tm["top"]
    total_adv = 4 * tm["adv"] + tm["colon_w"]
    worst_w = total_adv - tm["lsb_min"] - (tm["adv"] - tm["right_max"])
    gh = (K.SEP_X[1] - 1 - (K.SEP_X[0] + 1) - worst_w) / 2
    gs = K.GLANCE_SIZE
    # the time is centred in the band on every screen; the condition text is centred in the
    # space between the digits and the band's lower edge
    time_cy = 253
    gv = (K.BAND_IN[1] - (time_cy + th / 2) - dh22) / 2
    desc_cy = time_cy + th / 2 + gv + dh22 / 2
    # status icons: a pair at the band in the top- and bottom-middle sections
    spots = {}
    for key, pair in (("top", K.GLANCE_SECTIONS[0]), ("bottom", K.GLANCE_SECTIONS[1])):
        w_ = 2 * gs + K.GLANCE_PAIR_GAP
        for k, nm in enumerate(pair):
            spots[nm] = (K.C - w_ / 2 + gs / 2 + k * (gs + K.GLANCE_PAIR_GAP), sections_rows[key])
    L["glances"] = [dict(name=nm, x=round(spots[nm][0] - gs / 2), y=round(spots[nm][1] - gs / 2)) for nm in K.GLANCES]
    x0 = K.C - (4 * tm["cell_w"] + tm["colon_w"]) / 2
    img_y = time_cy - tm["ink_mid"]
    L["time"] = dict(
        hour_x=round(x0), minute_x=round(x0 + 2 * tm["cell_w"] + tm["colon_w"]),
        colon_x=round(x0 + 2 * tm["cell_w"]), y=round(img_y),
        cell_w=tm["cell_w"], cell_h=tm["cell_h"], gap_side=round(gh, 1), gap_vertical=round(gv, 1),
    )
    L["desc"] = text_box(K.DESC_PX, K.C, desc_cy, 260, "HEOTX")
    L["desc_img"] = make_desc_images(L["desc"])
    L["night_edit"] = dict(x=round(K.C - 115), y=round(time_cy - 52), w=230, h=104)

    # ---------------------------------------------------------------- always-on
    fill = battery_fill_box()
    for b in (L["battery"],):
        b["fill"] = dict(x=b["icon"]["x"] + fill["dx"], y=b["icon"]["y"] + fill["dy"], w=fill["w"], h=fill["h"], radius=fill["radius"])
    L["aod"] = dict(date=date_lines(side_l, K.MID - stack_h / 2),
                    battery=L["battery"])

    # ---------------------------------------------------------------- colours / misc
    colours = {}
    for theme in THEME_NAMES:
        t = K.THEMES[theme]
        m = {}
        for metric in K.METRICS:
            rgb = metric_rgb(theme, metric)
            m[metric] = dict(on=hexint(rgb), dim=hexint(lerp((0, 0, 0), rgb, t["dim_factor"])))
        colours[theme] = dict(text=hexint(t["text"]), muted=hexint(t["muted"]), accent=hexint(t["accent"]),
                              colored_values=(theme == "mix"),
                              desc=hexint(t["desc"]), aod_text=hexint(t["aod_text"]),
                              battery={k: hexint(K.hexrgb(hx) if theme == "color" else t["metric"]) for k, hx in K.BATTERY_COLORS.items()},
                              unit=m, bg=bg_paths[theme], aod_bg=bg_paths[f"aod_{theme}"])
    L["colors"] = colours
    L["metrics"] = {k: dict(title=v[0], title_sc=K.TITLES_ZH[k][0], title_tc=K.TITLES_ZH[k][1], progress=v[2])
                    for k, v in K.METRICS.items()}
    L["default_slots"] = K.DEFAULT_SLOTS
    L["edit_metrics"] = K.EDIT_METRICS
    if K.DEMO_VALUES:
        L["demo_values"] = K.DEMO_VALUES
    L["fixed_slots"] = {str(k): v for k, v in K.FIXED_SLOTS.items()}
    L["weather_desc"] = [d for _, d in K.WEATHER]
    # IMG_LEVEL keeps 29 firmware indices; duplicate images share a source.
    L["weather_icon_index"] = [next(j for j, (other, _) in enumerate(K.WEATHER) if other == kind)
                               for kind, _ in K.WEATHER]
    L["weather_text_index"] = [next(j for j, (_, other) in enumerate(K.WEATHER) if other == text)
                               for _, text in K.WEATHER]
    L["font"] = "fonts/" + F.TEXT_FONT_SUBSET_NAME
    L["_notes"] = dict(side_value_x=side_x, width_99999=w99, gap_99999_to_divider=side_gap,
                       time_px=K.TIME_PX, time_gap_side=round(gh, 1), time_gap_vertical=round(gv, 1))
    return L


def write_layout(L):
    body = json.dumps(L, indent=2)
    K.LAYOUT_JS.write_text(
        "// GENERATED by faces/sextant/design/generate.py - do not edit by hand.\n"
        "// Change faces/sextant/design/config.py and re-run the generator (npm run assets).\n"
        f"export const LAYOUT = {body};\n")


# ============================================================================= edit-mode assets
def make_edit_assets(L):
    def frame(w, h, col, width):
        img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
        ImageDraw.Draw(img).rounded_rectangle([P(1), P(1), P(w - 1), P(h - 1)], radius=P(14), outline=col, width=P(width))
        return down(img)
    sizes = {(s["edit"]["w"], s["edit"]["h"]) for s in L["slots"]}
    sizes.add((L["theme_edit"]["w"], L["theme_edit"]["h"]))
    sizes.add((L["night_edit"]["w"], L["night_edit"]["h"]))
    for w, h in sizes:
        save(frame(w, h, (214, 172, 96, 255), 3), f"edit/select_{w}x{h}.png")
        save(frame(w, h, (120, 128, 140, 200), 2), f"edit/unselect_{w}x{h}.png")
        # tap areas over the complications (fully transparent; the widget box takes the tap)
        save(Image.new("RGBA", (w, h), (0, 0, 0, 0)), f"edit/tap_{w}x{h}.png")
    for theme in THEME_NAMES:
        for r in L.get("rules") or []:
            save(rule_image(RULE_PTS[r["src"]], theme, r["x"], r["y"]), f"rule/{theme}_{r['src']}.png")
    # The firmware draws the tip text in its own (dark) colour, so the tip is light.
    tip = Image.new("RGBA", (150 * S, 40 * S), (0, 0, 0, 0))
    ImageDraw.Draw(tip).rounded_rectangle([0, 0, tip.width - 1, tip.height - 1], radius=P(20), fill=(240, 216, 160, 255), outline=(255, 244, 214, 255), width=P(2))
    save(down(tip), "edit/tip.png")
    # The firmware hides normal widgets in edit mode, so give the edit boxes a dimmed
    # copy of the face's background (shown only in edit mode) for context.
    for theme in K.THEMES:
        bg = Image.open(OUT / "bg" / f"{theme}.png").convert("RGBA")
        save(Image.eval(bg.convert("RGB"), lambda v: int(v * 0.45)).convert("RGBA"), f"edit/bg_{theme}.png")

    # per-metric previews: icon above a sample value
    samples = dict(battery="85%", steps="8,412", heart="72", distance="5.86", calories="486", floors="7", pai="64", stand="9",
                   fatburn="23", spo2="98%", stress="27", uvi="3", humidity="61%", aqi="42", sun="18:21", weather="18°",
                   resting="58", sleep="7:32", sleepscore="84", bodytemp="36.4°", vo2max="48", trainload="245",
                   recovery="36h", altitude="312m", pressure="1013", compass="312° NW", moon="73%", forecast="21/12°")
    w, h = L["slots"][0]["edit"]["w"], L["slots"][0]["edit"]["h"]
    f = F.pil_font(str(F.TEXT_FONT), 34, S)
    for metric, txt in samples.items():
        img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
        svg = weather_svg("partly_day") if metric in ("weather", "forecast") else METRIC_SVG[metric]("#%02x%02x%02x" % K.hexrgb(K.METRICS[metric][1]))
        icon = svg_to_image(svg, 28 * S)
        img.alpha_composite(icon, (img.width // 2 - icon.width // 2, P(8)))
        ImageDraw.Draw(img).text((img.width // 2, P(h - 14)), txt, font=f, fill=(244, 246, 248, 255), anchor="ms")
        save(down(img), f"edit/preview_{metric}.png")
    # theme + night previews
    tw, th_ = L["theme_edit"]["w"], L["theme_edit"]["h"]
    fs = F.pil_font(str(F.TEXT_FONT), 20, S)
    theme_previews = [
        ("color", "COLOR", (214,172,96)), ("mono", "MONO", (230,232,236)),
        ("mix", "MIX", (245,246,250)), ("blue", "BLUE", (69,158,255)),
        ("green", "GREEN", (66,217,160)), ("purple", "PURPLE", (179,140,255)),
        ("orange", "ORANGE", (255,173,97)), ("pink", "PINK", (255,128,174))]
    for name, label, col in theme_previews:
        img = Image.new("RGBA", (tw * S, th_ * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        circle = [P(tw / 2 - 16), P(14), P(tw / 2 + 16), P(46)]
        if name == "mix":
            for j, shade in enumerate(((61,220,132),(255,77,94),(61,165,255),(255,138,61))):
                d.pieslice(circle, start=90*j, end=90*(j+1), fill=shade+(255,))
        else:
            d.ellipse(circle, fill=col+(255,))
        d.text((img.width // 2, P(th_ - 16)), label, font=fs, fill=(244, 246, 248, 255), anchor="ms")
        save(down(img), f"edit/preview_theme_{name}.png")
    nw, nh = L["night_edit"]["w"], L["night_edit"]["h"]
    fm = F.pil_font(str(F.TEXT_FONT), 24, S)
    for name, label, col in (("auto", "NIGHT MODE: AUTO", (232, 44, 26)), ("off", "NIGHT MODE: OFF", (150, 160, 172))):
        img = Image.new("RGBA", (nw * S, nh * S), (0, 0, 0, 0))
        ImageDraw.Draw(img).text((img.width // 2, img.height // 2), label, font=fm, fill=col + (255,), anchor="mm")
        save(down(img), f"edit/preview_night_{name}.png")


# ============================================================================= main
def generate():
    F.build_fonts()
    # keep icon.png / cover.png (written by `npm run screenshots`), rebuild the rest
    OUT.mkdir(parents=True, exist_ok=True)
    for child in OUT.iterdir():
        if child.name in ("icon.png", "cover.png"):
            continue
        shutil.rmtree(child) if child.is_dir() else child.unlink()
    F.write_watch_font(OUT / "fonts" / F.TEXT_FONT_SUBSET_NAME)
    blueprint = json.loads((K.REPO / "studio" / "target-watchface.json").read_text())
    K.TIME_PX = next(e["fontSize"] for e in blueprint["elements"] if e["id"] == "clock")
    bg = make_backgrounds()
    tm = make_time_digits()
    make_icons()
    make_pod_weather_descriptions()
    make_rot_assets()
    L = build_layout(tm, bg)
    make_edit_assets(L)
    write_layout(L)
    return L
