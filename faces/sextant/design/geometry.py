"""Shared geometry: band outline, dividers, gauge segments, ticks, glance slots.

Angles in this module use PIL's convention (0 deg = 3 o'clock, clockwise) unless a
function name says `zepp`. Zepp OS arcs use 0 deg = 12 o'clock, clockwise, so
zepp = pil + 90.
"""
import math
from .config import (C, W, BAND_T, BAND_B, BEND, BAND_FLARE_SLOPE, SEP_X, SEP_INSET,
                     SEP_FLARE_RUN, DIV_X, ELBOW_Y, RIM_ANGLE, RING_R, TICK_STEP,
                     SEG_GAP, GAUGE_TRACK_R)


def to_zepp(a):
    return (a + 90) % 360


# ----------------------------------------------------------------------------- band
def band_top_y(x):
    if x < BEND[0]:
        return BAND_T - BAND_FLARE_SLOPE * (BEND[0] - x)
    if x > BEND[1]:
        return BAND_T - BAND_FLARE_SLOPE * (x - BEND[1])
    return BAND_T


def band_bot_y(x):
    return W - band_top_y(x)


def band_polygon(scale=1.0, steps=241):
    xs = [-60 + i * (W + 120) / (steps - 1) for i in range(steps)]
    top = [(x, band_top_y(x)) for x in xs]
    bot = [(x, band_bot_y(x)) for x in reversed(xs)]
    return [(x * scale, y * scale) for x, y in top + bot]


# ----------------------------------------------------------------------------- dividers
# The bend sits where the radius at RIM_ANGLE crosses the vertical part, so the outer run
# lies on that radius, parallel to the bezel ticks.
DIV_ELBOW_Y = C + (DIV_X[0] - C) * math.tan(math.radians(RIM_ANGLE))


def divider_points(side, top):
    """Polyline (band edge -> elbow -> beyond rim) for one panel divider."""
    sx = -1 if side == "L" else 1
    ex = C + sx * (C - DIV_X[0])
    a = math.radians(RIM_ANGLE if side == "L" else 540 - RIM_ANGLE)
    rx, ry = C + 250 * math.cos(a), C + 250 * math.sin(a)
    pts = [(ex, BAND_T), (ex, DIV_ELBOW_Y), (rx, ry)]
    if not top:
        pts = [(x, W - y) for x, y in pts]
    return pts


# original divider flare slope (bend at ELBOW_Y), kept for the band separators
_ex, _ey = DIV_X[0], ELBOW_Y
_rx = C + 250 * math.cos(math.radians(RIM_ANGLE))
_ry = C + 250 * math.sin(math.radians(RIM_ANGLE))
DIVIDER_SLOPE = (_ex - _rx) / (_ey - _ry)


def separator_points(i):
    """Flared separator inside the band; i = 0 (left) or 1 (right)."""
    x = SEP_X[i]
    outward = -1 if i == 0 else 1
    top, bot = BAND_T + SEP_INSET, BAND_B - SEP_INSET
    ox = outward * SEP_FLARE_RUN * DIVIDER_SLOPE
    return [(x + ox, top), (x, top + SEP_FLARE_RUN), (x, bot - SEP_FLARE_RUN), (x + ox, bot)]


# ----------------------------------------------------------------------------- ring segments
def _first_hit_on_edge(fn, x0, x1, r):
    n = 6000
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        y = fn(x)
        if math.hypot(x - C, y - C) >= r:
            return math.degrees(math.atan2(y - C, x - C)) % 360
    raise ValueError("edge never reaches ring")


def _divider_hit(pts, r):
    (x1, y1), (x2, y2) = pts[1], pts[2]
    n = 4000
    for i in range(n + 1):
        t = i / n
        x, y = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
        if math.hypot(x - C, y - C) >= r:
            return math.degrees(math.atan2(y - C, x - C)) % 360
    raise ValueError("divider never reaches ring")


def ring_segments():
    """Six gauge segments as (start, end) in PIL degrees, in fill order.

    Index: 0 top-left, 1 top-middle (date / compass), 2 top-right,
           3 bottom-left, 4 bottom-middle, 5 bottom-right.
    Corner gauges start beside the top- or bottom-middle panel and fill outward to the
    band; the bottom-middle gauge fills left to right, the top-middle one right to left.
    """
    r = GAUGE_TRACK_R
    g = SEG_GAP
    l_up = _first_hit_on_edge(band_top_y, BEND[0], 0, r)        # ~199 deg
    tl = _divider_hit(divider_points("L", True), r)             # ~246 deg
    tr = 540 - tl
    r_up = 540 - l_up
    bl, br = 360 - tl, 360 - tr
    l_dn, r_dn = 360 - l_up, 360 - r_up
    return [
        (tl - g, l_up + g),      # TL: date side -> band (counter-clockwise)
        (tr - g, tl + g),        # TM: right -> left (mirrors the bottom-middle gauge)
        (tr + g, r_up - g),      # TR: date side -> band (clockwise)
        (bl + g, l_dn - g),      # BL: calories side -> band (clockwise)
        (bl - g, br + g),        # BM: left -> right (counter-clockwise)
        (br - g, r_dn + g),      # BR: calories side -> band (counter-clockwise)
    ]


SLOT_SEGMENT = [0, 2, 3, 4, 5, 1]  # slot order TL, TR, BL, BM, BR, TM -> segment index


def segment_ticks(seg):
    """Tick angles (PIL deg, multiples of TICK_STEP) inside a segment, in fill order."""
    a0, a1 = seg
    lo, hi = min(a0, a1), max(a0, a1)
    first = math.ceil(lo / TICK_STEP) * TICK_STEP
    ticks = []
    a = first
    while a <= hi + 1e-9:
        ticks.append(a)
        a += TICK_STEP
    return ticks if a0 <= a1 else list(reversed(ticks))


def tick_arc(pil_deg):
    """Integer (start, end) Zepp angles for a 1-degree tick at a whole-degree position.

    The firmware truncates arc angles to whole degrees (and arcs under 1 degree don't
    draw), so a tick centred on c can't be drawn. Each tick covers the degree on the side
    away from the nearer of the two centre-line points (12 and 6 o'clock), so the bezel is
    symmetric left/right and top/bottom: the ticks either side of both markers sit 2.5
    degrees from them. Ticks on the centre line itself return None (markers go there)."""
    z = round(to_zepp(pil_deg)) % 360
    if z in (0, 180):
        return None
    away_clockwise = (0 < z < 90) or (180 < z < 270)
    return (z, z + 1) if away_clockwise else (z - 1, z)
