#!/usr/bin/env python3
"""Validate geometry from the *generated* WatchWit Orbit runtime layout.

Unlike the blueprint gate, this checks measured text boxes, icon locations,
clock and editing targets after the asset generator has run.
"""
import json
import sys
from pathlib import Path
p = Path(__file__).resolve().parents[1] / "faces/sextant/watchface/layout.generated.js"
if not p.exists():
    raise SystemExit("Missing generated runtime layout: run npm run assets")
s = p.read_text()
prefix = "export const LAYOUT = "
if prefix not in s:
    raise SystemExit("Unexpected layout format")
L = json.loads(s.split(prefix,1)[1].rsplit(";",1)[0])
centres = [(106,103),(374,103),(106,373),(240,373),(374,373),(240,103)]
errors = []
for i,(cx,cy) in enumerate(centres):
    slot = L["slots"][i]
    if abs(slot["cx"]-cx)>2:
        errors.append(f"slot {i} wrong X center: {slot['cx']}")
    for key in ("icon","value","edit"):
        box=slot[key]
        x,y=box["x"],box["y"]
        w=box.get("w",box.get("size"))
        h=box.get("h",box.get("size"))
        if x < cx-65 or x+w>cx+65 or y<cy-52 or y+h>cy+52:
            errors.append(f"slot {i} {key} exceeds capsule: {(x,y,w,h)}")
    icon=slot["icon"]
    value=slot["value"]
    if icon["y"]+icon["size"]>value["y"]+5:
        errors.append(f"slot {i}: icon/value overlap")
    if value["y"]+value["h"]>(130 if cy<200 else 404)+7:
        errors.append(f"slot {i}: value intrudes into caption")
for key in ("hour_x","minute_x","y"):
    if key not in L["time"]: errors.append("missing time coordinate "+key)
if L["time"]["hour_x"]<55 or L["time"]["minute_x"]>405:
    errors.append("time outside hero panel")
if len(L["gauge"]["segments"])!=6: errors.append("wrong gauge count")
if errors: raise SystemExit("ORBIT RUNTIME LAYOUT FAIL:\n"+"\n".join(errors))
print("Orbit generated layout PASS: six capsules, measured text boxes, hero time")
