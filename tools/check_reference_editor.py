#!/usr/bin/env python3
"""Fail the Zepp build if the on-watch editor loses option coverage/assets."""
import json
import re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
assets=root/"faces/sextant/assets/common.r"
layout=(root/"faces/sextant/watchface/layout.generated.js").read_text()
L=json.loads(layout.split("export const LAYOUT = ",1)[1].rsplit(";",1)[0])
metrics=(root/"lib/js/metrics.js").read_text()
runtime=(root/"faces/sextant/watchface/sextant.js").read_text()
names=re.search(r"export const METRIC_IDS = \[(.*?)\];",metrics,re.S)
assert names,"METRIC_IDS list missing"
ids=re.findall(r"'([a-z0-9_]+)'",names.group(1))
errors=[]
if len(ids)<25 or len(set(ids))!=len(ids): errors.append("insufficient or duplicate metric options")
for metric in ids:
 for path in [f"icons/color/{metric}.png",f"edit/preview_{metric}.png"]:
  if not (assets/path).is_file(): errors.append("missing editor asset "+path)
if "select_list:" not in runtime or "icon: `icons/color/${id}.png`" not in runtime:
 errors.append("full-screen picker or list icons removed")
if len(L["slots"])!=6: errors.append("wrong number of selectable complications")
for slot in L["slots"]:
 box=slot["edit"]
 for prefix in ("select","unselect"):
  path=assets/f"edit/{prefix}_{box['w']}x{box['h']}.png"
  if not path.is_file(): errors.append("missing selection art "+str(path))
 for k in ("value","icon","edit"):
  v=slot[k]
  if v["x"]<0 or v["y"]<0: errors.append("negative widget coordinate")
for theme in ("color","mono","mix","blue","green","purple","orange","pink"):
 if not (assets/f"bg/{theme}.png").is_file(): errors.append("missing theme "+theme)
if "resume_call:" not in runtime: errors.append("resume after editor not handled")
if errors: raise SystemExit("EDITOR QUALITY CHECK FAILED:\n"+"\n".join(errors))
print(f"PASS: {len(ids)} complication choices, 6 editable slots, 8 themes, icons and previews verified")
