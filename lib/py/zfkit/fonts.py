"""Shared font instancing, subsetting and measurement (used by every face).

The repo ships the OFL variable font Roboto Condensed in /fonts. We cut a static Regular
instance from it, used for the time digits (rendered to images) and for all other text
(bundled, subset, as a TTF for TEXT widgets).
"""
from functools import lru_cache
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset as ft_subset
from PIL import ImageFont, Image, ImageDraw

REPO = Path(__file__).resolve().parents[3]
FONT_DIR = REPO / "fonts"
BUILD = REPO / "tools" / ".build"
TEXT_FONT = BUILD / "RobotoCondensed-Regular.ttf"
TEXT_FONT_SUBSET_NAME = "RobotoCondensed-Regular.ttf"

# characters the watch can ever draw with the bundled font
WATCH_CHARSET = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "°%·–—’" + "ÀÁÂÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÖÙÚÛÜàáâäåçèéêëìíîïñòóôöùúûüßÆæØø"
)


def build_fonts():
    BUILD.mkdir(parents=True, exist_ok=True)
    if not TEXT_FONT.exists():
        f = TTFont(FONT_DIR / "RobotoCondensed[wght].ttf")
        instantiateVariableFont(f, {"wght": 400}).save(TEXT_FONT)


def write_watch_font(dest: Path):
    """Subset Roboto Condensed Regular to the characters the face uses."""
    opts = ft_subset.Options()
    opts.layout_features = ["kern", "liga", "tnum"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = TTFont(TEXT_FONT, recalcTimestamp=False)   # same bytes on every build
    sub = ft_subset.Subsetter(opts)
    sub.populate(text=WATCH_CHARSET)
    sub.subset(font)
    dest.parent.mkdir(parents=True, exist_ok=True)
    font.save(dest)
    # the OFL requires the licence to travel with the font
    (dest.parent / "OFL.txt").write_text((FONT_DIR / "OFL-RobotoCondensed.txt").read_text())


@lru_cache(maxsize=None)
def pil_font(path, px, scale=1):
    return ImageFont.truetype(str(path), int(round(px * scale)))


@lru_cache(maxsize=None)
def vmetrics(path):
    """(ascender, descender) as fractions of the em, from hhea."""
    f = TTFont(path)
    upm = f["head"].unitsPerEm
    return f["hhea"].ascent / upm, -f["hhea"].descent / upm


def ink_extent(path, px, text, scale=4):
    """Ink bbox of `text` relative to the pen origin on the baseline (px units)."""
    f = pil_font(str(path), px, scale)
    m = Image.new("L", (int(px * scale * (len(text) + 2)), int(px * scale * 3)), 0)
    ox, oy = int(px * scale), int(px * scale * 2)
    ImageDraw.Draw(m).text((ox, oy), text, font=f, fill=255, anchor="ls")
    b = m.getbbox()
    if not b:
        return (0, 0, 0, 0)
    return ((b[0] - ox) / scale, (b[1] - oy) / scale, (b[2] - ox) / scale, (b[3] - oy) / scale)


def advance(path, px, text, scale=4):
    return pil_font(str(path), px, scale).getlength(text) / scale


# Measured in the Zepp OS emulator (Balance 2 firmware, see docs/development.md):
# the firmware draws text this fraction of the text size lower than the line-box model.
FIRMWARE_TEXT_DY = 0.0


def text_box_for_ink_centre(path, px, ink_cy, sample="0123456789"):
    """Return (box_y, box_h) for a vertically centred TEXT widget so that the ink of
    `sample`-like glyphs is centred on ink_cy.

    Model (matches how Zepp OS centres a single line, documented in
    docs/development.md): the line box (ascender + descender) is centred in the
    widget box, and the baseline sits `ascender` below the line box top.
    """
    asc, desc = vmetrics(str(path))
    line_h = (asc + desc) * px
    _, top, _, bot = ink_extent(path, px, sample)
    ink_mid_from_baseline = (top + bot) / 2          # negative = above baseline
    # baseline y such that ink is centred on ink_cy
    baseline = ink_cy - ink_mid_from_baseline
    line_top = baseline - asc * px
    box_h = int(round(line_h + 8))
    box_y = line_top - (box_h - line_h) / 2 - FIRMWARE_TEXT_DY * px
    return int(round(box_y)), box_h
