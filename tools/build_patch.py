#!/usr/bin/env python3
"""Apply Nautic Palette themes and preserve the existing watchface layout."""
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
def edit(path, replacements):
    p=root/path
    txt=p.read_text()
    for old,new in replacements:
        n=txt.count(old)
        if n!=1: raise RuntimeError(f"{path}: expected one match, got {n}: {old[:90]!r}")
        txt=txt.replace(old,new,1)
    p.write_text(txt)
    print("Patched:",path)

palette = """
# Extra palettes for Nautic Palette.
THEMES["mix"] = dict(
    text=(248,249,252), muted=(181,185,193), accent=(244,246,250),
    desc=(239,242,247), divider=(69,73,83),
    band=((28,31,40),(8,10,16)), glow_lo=(20,23,30),
    time=((255,255,255),(222,230,241)),
    aod_time=(219,222,229), aod_text=(172,176,186),
    dim_factor=0.30, metric=(245,246,250), muted_icon=(116,122,133),
)
def _hue(primary, bright, muted, dark, glow, band):
    return dict(text=bright, muted=muted, accent=primary, desc=bright,
        divider=dark, band=(band,glow), glow_lo=glow,
        time=(bright,primary), aod_time=primary, aod_text=muted,
        dim_factor=0.30, metric=primary, muted_icon=dark)
THEMES.update({
    "blue": _hue((69,158,255),(199,229,255),(134,188,238),(38,72,108),(13,27,47),(19,48,84)),
    "green": _hue((66,217,160),(205,255,233),(139,214,182),(34,88,67),(10,35,27),(17,65,45)),
    "purple": _hue((179,140,255),(235,222,255),(188,164,231),(79,53,107),(29,19,46),(58,32,90)),
    "orange": _hue((255,173,97),(255,228,204),(237,182,133),(112,66,32),(44,22,13),(90,47,22)),
    "pink": _hue((255,128,174),(255,222,232),(239,162,192),(106,50,75),(45,18,32),(90,30,57)),
})
"""
edit("faces/sextant/design/config.py", [
 ("BATTERY_COLORS = {", palette+"\nBATTERY_COLORS = {")
])

edit("faces/sextant/design/assets.py", [
 ('THEME_NAMES = ["color", "mono", "night"]', "THEME_NAMES = list(K.THEMES)"),
 ('''    styles = {
        "color": K.THEMES["color"]["time"],
        "mono": K.THEMES["mono"]["time"],
        "night": K.THEMES["night"]["time"],
    }''',
  '''    styles = {name: K.THEMES[name]["time"] for name in THEME_NAMES}'''),
 ('''        acc = K.THEMES["night" if name == "night" else ("mono" if name == "mono" else "color")]["accent"]''',
  '''        acc = K.THEMES[name]["accent"]'''),
 ('''    if theme == "color":
        return K.hexrgb(K.METRICS[metric][1])''',
  '''    if theme in ("color", "mix"):
        return K.hexrgb(K.METRICS[metric][1])'''),
 ('''            img = centred(retint(svg_to_image(svg, K.GLANCE_SIZE), theme, K.THEMES[theme].get("metric")), K.GLANCE_SIZE)''',
  '''            status_tint = "mono" if theme == "mix" else theme
            img = centred(retint(svg_to_image(svg, K.GLANCE_SIZE), status_tint, K.THEMES[theme].get("metric")), K.GLANCE_SIZE)'''),
 ('''            off = centred(retint(svg_to_image(GLANCE_OFF_SVG[name], K.GLANCE_SIZE), theme, K.THEMES[theme].get("muted_icon")), K.GLANCE_SIZE)''',
  '''            off = centred(retint(svg_to_image(GLANCE_OFF_SVG[name], K.GLANCE_SIZE), status_tint, K.THEMES[theme].get("muted_icon")), K.GLANCE_SIZE)'''),
 ('''        colours[theme] = dict(text=hexint(t["text"]), muted=hexint(t["muted"]), accent=hexint(t["accent"]),''',
  '''        colours[theme] = dict(text=hexint(t["text"]), muted=hexint(t["muted"]), accent=hexint(t["accent"]),
                              colored_values=(theme == "mix"),'''),
 ('''    for name, label, col in (("color", "COLOR", (214, 172, 96)), ("mono", "MONO", (230, 232, 236))):''',
  '''    theme_previews = [
        ("color", "COLOR", (214,172,96)), ("mono", "MONO", (230,232,236)),
        ("mix", "MIX", (245,246,250)), ("blue", "BLUE", (69,158,255)),
        ("green", "GREEN", (66,217,160)), ("purple", "PURPLE", (179,140,255)),
        ("orange", "ORANGE", (255,173,97)), ("pink", "PINK", (255,128,174))]
    for name, label, col in theme_previews:'''),
 ('''        d.ellipse([P(tw / 2 - 16), P(14), P(tw / 2 + 16), P(46)], fill=col + (255,))''',
  '''        circle = [P(tw / 2 - 16), P(14), P(tw / 2 + 16), P(46)]
        if name == "mix":
            for j, shade in enumerate(((61,220,132),(255,77,94),(61,165,255),(255,138,61))):
                d.pieslice(circle, start=90*j, end=90*(j+1), fill=shade+(255,))
        else:
            d.ellipse(circle, fill=col+(255,))''')
])
edit("lib/py/zfkit/icons.py", [
 ('''    if theme == "color":
        return img''',
  '''    if theme in ("color", "mix"):
        return img''')
])
edit("faces/sextant/watchface/sextant.js", [
 ('''    editType(100102, ['Mono', '单色', '單色'], 'edit/preview_theme_mono.png', 'mono'),''',
  '''    editType(100102, ['Mono', '单色', '單色'], 'edit/preview_theme_mono.png', 'mono'),
    editType(100103, ['Mix', '混合', '混合'], 'edit/preview_theme_mix.png', 'mix'),
    editType(100104, ['Blue', '蓝色', '藍色'], 'edit/preview_theme_blue.png', 'blue'),
    editType(100105, ['Green', '绿色', '綠色'], 'edit/preview_theme_green.png', 'green'),
    editType(100106, ['Purple', '紫色', '紫色'], 'edit/preview_theme_purple.png', 'purple'),
    editType(100107, ['Orange', '橙色', '橙色'], 'edit/preview_theme_orange.png', 'orange'),
    editType(100108, ['Pink', '粉色', '粉色'], 'edit/preview_theme_pink.png', 'pink'),'''),
 ('''            text_size: px_(box.value.size), color: C.text, font: L.font,''',
  '''            text_size: px_(box.value.size), color: C.colored_values ? C.unit[id].on : C.text, font: L.font,'''),
 ('''          slot.value = this.text(box.value, { color: C.text });''',
  '''          slot.value = this.text(box.value, { color: C.colored_values ? C.unit[id].on : C.text });'''),
 ('''        text: r.text, text_size: px_(box.value.size), color: C.text, font: L.font,''',
  '''        text: r.text, text_size: px_(box.value.size),
        color: C.colored_values ? C.unit[slot.id].on : C.text, font: L.font,''')
])
manifest=root/"faces/sextant/app.json"
m=json.loads(manifest.read_text())
m["app"]["appId"]=21319240
m["app"]["appName"]="Nautic Palette"
m["app"]["vender"]="Nautic Palette"
m["app"]["description"]="Nautic Palette: customizable 480x480 watchface with Color, Mono, Mix, Blue, Green, Purple, Orange and Pink themes."
m["app"]["version"]={"code":1,"name":"0.1.0"}
for item in m["i18n"].values(): item["appName"]="Nautic Palette"
manifest.write_text(json.dumps(m,indent=2,ensure_ascii=False)+"\n")
data=json.loads((root/"faces/sextant/scenarios/day.json").read_text())
for name in ("mix","blue","green","purple","orange","pink"):
    scenario=json.loads(json.dumps(data))
    scenario["name"]="palette_"+name
    scenario["edit"][6]=name
    scenario["edit"][7]="off"
    scenario["expect_theme"]=name
    (root/"faces/sextant/scenarios"/("palette_"+name+".json")).write_text(json.dumps(scenario,indent=2)+"\n")
print("Sextant Nautic Palette patch complete.")
