#!/usr/bin/env python3
"""Build a selector/gallery preview from *generated watchface layout and assets*.

Unlike a decorative mockup, this composites the exact generated background,
numeric glyph PNGs, icon PNGs, and positions used by the watchface.
The Zepp firmware may render text bindings differently; final screenshots must
still be checked on a device. Never silently fall back to a background-only art.
"""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SAMPLES = {
 "steps":("8,560",""), "calories":("420",""), "heart":("72",""),
 "distance":("6.2","km"), "stand":("11",""), "weather":("24°",""),
 "battery":("85%",""), "pai":("65",""), "fatburn":("23",""),
 "floors":("7",""), "sun":("18:21",""), "stress":("27",""),
}
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--face",default="faces/sextant")
    parser.add_argument("--output",default=None)
    args=parser.parse_args()
    face=Path(args.face)
    asset=face/"assets/common.r"
    data=(face/"watchface/layout.generated.js").read_text()
    layout=json.loads(data.split("export const LAYOUT = ",1)[1].rsplit(";",1)[0])
    bg=Image.open(asset/"bg/color.png").convert("RGBA")
    if bg.size!=(480,480): raise ValueError("Expected 480x480 generated background")
    draw=ImageDraw.Draw(bg)
    fontpath=Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    def font(size):
        return ImageFont.truetype(str(fontpath),round(size))
    def put(box,value,color="#f2f7ff"):
        f=font(box["size"])
        cx=box["x"]+box["w"]/2;cy=box["y"]+box["h"]/2
        draw.text((cx,cy),value,anchor="mm",font=f,fill=color)
    def sprite(rel,x,y,required=True):
        path=asset/rel
        if not path.exists():
            if required: raise FileNotFoundError(f"Missing generated preview sprite: {path}")
            return
        bg.alpha_composite(Image.open(path).convert("RGBA"),(round(x),round(y)))
    theme=layout["colors"]["color"]
    for slot,metric in zip(layout["slots"],layout["default_slots"]):
        val,unit=SAMPLES.get(metric,("72",""))
        icon=slot["icon"]
        iconname="weather_0" if metric=="weather" else metric
        sprite(f"icons/color/{iconname}.png",icon["x"],icon["y"])
        put(slot["value"],val)
        if unit:
            ub=slot["unit"]
            f=font(ub["size"])
            valuewidth=draw.textbbox((0,0),val,font=font(slot["value"]["size"]))[2]
            x=slot["cx"]+valuewidth/2+3
            draw.text((x,ub["y"]+ub["h"]/2),unit,font=f,fill="#90b4cc",anchor="lm")
    # Dynamic date exactly at the generated system widget positions.
    for part,value in (("dow","MON"),("day","28"),("month","APR")):
        put(layout["date"][part],value,"#95d9fb" if part=="dow" else "#f0f6ff")
    bat=layout["battery"]
    sprite("battery/color/high.png",bat["icon"]["x"],bat["icon"]["y"])
    put(bat["text"],"85%")
    # Draw the live time from the same pre-rendered numeral PNGs as the ZPK.
    t=layout["time"]
    for k,d in enumerate("10"):
        sprite(f"time/color/{d}.png",t["hour_x"]+k*t["cell_w"],t["y"])
    sprite("time/color/colon.png",t["colon_x"],t["y"])
    for k,d in enumerate("08"):
        minute=f"time_minute/color/{d}.png"
        if not (asset/minute).exists(): minute=f"time/color/{d}.png"
        sprite(minute,t["minute_x"]+k*t["cell_w"],t["y"])
    output=Path(args.output) if args.output else asset/"cover.png"
    output.parent.mkdir(parents=True,exist_ok=True)
    bg.convert("RGB").save(output,optimize=True)
    print(f"Rendered watchface preview from live generated assets: {output}")
if __name__=="__main__":
    main()
