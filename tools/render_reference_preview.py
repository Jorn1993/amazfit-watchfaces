#!/usr/bin/env python3
"""Render the generated Zepp assets at 480x480 for visual QA.

This preview deliberately uses the actual generated digit/icon/background PNGs.
System-bound values on real hardware can differ in glyph metrics; this tool is
a pre-device quality gate, not a Zepp emulator replacement.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "faces/sextant/assets/common.r"
LAYOUT = ROOT / "faces/sextant/watchface/layout.generated.js"
OUT = ROOT / "site/preview"
DATA = json.loads(LAYOUT.read_text().split("=", 1)[1].strip().rstrip(";"))
BLUEPRINT = json.loads((ROOT / "studio/target-watchface.json").read_text())
assert BLUEPRINT["canvas"]["width"] == 480
assert len(DATA["slots"]) == 6

def asset(rel):
    return Image.open(ASSETS / rel).convert("RGBA")

def font(size):
    path = ROOT / "tools/.build/RobotoCondensed-Regular.ttf"
    if not path.is_file():
        path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(str(path), round(size))

def draw_text(draw, value, box, color, max_width=None):
    size = box["size"]
    f = font(size)
    width = max_width if max_width is not None else box["w"]
    if draw.textbbox((0, 0), value, font=f)[2] > width:
        raise AssertionError("Text exceeds its assigned rectangle: " + repr(value))
    cx = box["x"] + box["w"] / 2
    cy = box["y"] + box["h"] / 2
    draw.text((cx, cy), value, font=f, fill=color, anchor="mm")

def make():
    img = asset("bg/color.png")
    draw = ImageDraw.Draw(img)
    samples = ["8,560", "420", "85%", "24°", "6.2", "72"]
    labels = ["STEPS", "CAL", "BATTERY", "WEATHER", "KM", "BPM"]
    symbols = ["steps", "calories", "battery", "weather_0", "distance", "heart"]
    for idx, (slot, value, label, icon) in enumerate(zip(DATA["slots"], samples, labels, symbols)):
        loc = slot["icon"]
        sprite = asset("icons/color/" + icon + ".png")
        img.alpha_composite(sprite, (round(loc["x"]), round(loc["y"])))
        valbox = slot["value"]
        draw_text(draw, value, valbox, "#f3f7fd")
        cx = slot["cx"]
        y = 139 if idx in (0,1,5) else 401
        textfont = font(15)
        width = draw.textbbox((0,0), label, font=textfont)[2]
        assert width < 106, label
        draw.text((cx,y+8.5),label,font=textfont,fill="#a7b9ce",anchor="mm")
    for key,val,color in (("dow","MON","#36d7ff"),("month","APR","#f3f7fd"),("day","28","#f3f7fd")):
        draw_text(draw,val,DATA["date"][key],color)
    T = DATA["time"]
    for i,num in enumerate("10"):
        digit = asset("time/color/" + num + ".png")
        img.alpha_composite(digit, (round(T["hour_x"] + i * T["cell_w"]), round(T["y"])))
    colon = asset("time/color/colon.png")
    img.alpha_composite(colon, (round(T["colon_x"]), round(T["y"])))
    for i,num in enumerate("08"):
        digit = asset("time_minute/color/" + num + ".png")
        img.alpha_composite(digit, (round(T["minute_x"] + i * T["cell_w"]), round(T["y"])))
    OUT.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT / "watchwit-reference-preview.png", optimize=True)
    print("Rendered real 480x480 generated assets to", OUT / "watchwit-reference-preview.png")

if __name__ == "__main__":
    make()
