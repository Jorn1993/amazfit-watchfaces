"""Design constants for the Sextant watch face.

Everything the asset generator and the watch-face layout share lives here, so
the PNG assets and the generated JS layout can never drift apart.
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # faces/sextant
REPO = ROOT.parents[1]
FONT_DIR = REPO / "fonts"
# A face built from Sextant's generator (Twisted Sextant) sets SEXTANT_FACE_DIR to write
# its own assets and layout; its design/variant.json holds its overrides.
import os as _os0
OUT_FACE = Path(_os0.environ["SEXTANT_FACE_DIR"]) if _os0.environ.get("SEXTANT_FACE_DIR") else ROOT
ASSET_DIR = OUT_FACE / "assets" / "common.r"
LAYOUT_JS = OUT_FACE / "watchface" / "layout.generated.js"

# ----------------------------------------------------------------------------- screen
W = 480
C = W / 2

# ----------------------------------------------------------------------------- centre band
BAND_T, BAND_B = 160, 320                 # flat top / bottom edge of the band: exactly 1/3 of the height
BAND_IN = (BAND_T + 1, BAND_B - 1)         # inner edges of the 2px edge lines
MID = (BAND_T + BAND_B) / 2
BEND = (108, 372)                         # band edges are flat between these x, then flare
BAND_FLARE_SLOPE = math.tan(math.radians(10.85))   # flare solved so all six gauges are equal (19 ticks)

# separators inside the band (flared, same slope as the panel dividers)
SEP_X = (100, 380)                        # moved out from the band bend to give the time more room
SEP_INSET = 16                            # from band edge to separator end
SEP_FLARE_RUN = 30                        # vertical extent of each flared end

# ----------------------------------------------------------------------------- panel dividers
DIV_X = (186, 294)                        # vertical part of the dividers
ELBOW_Y = 110                             # complication layout reference (corner value tops sit here)
RIM_ANGLE = 248.5                         # top-left divider heads for this rim angle (PIL deg): centred
                                          #   in the gap between the gauges' end ticks (was 248.12)
DIV_START_GAP = 12                        # dividers stop this far from the band edge

# ----------------------------------------------------------------------------- outer ring
RING_R = 233                              # outer edge of the gauge ticks
TICK_MINOR, TICK_MAJOR = 6, 10            # tick lengths (inward from RING_R)
TICK_STEP = 2                             # degrees between ticks
TICK_MAJOR_EVERY = 10                     # a long tick every N degrees
SEG_GAP = 3.25                            # degrees of empty ring at each end of a gauge (was 6.5)
GAUGE_TRACK_R = 230                       # radius used to find where edges meet the ring

# ----------------------------------------------------------------------------- glances
GLANCE_SIZE = 22
GLANCES = ["disconnect", "dnd", "alarm", "lock"]

# ----------------------------------------------------------------------------- type
TIME_SIDE_GAP = 12                        # time size is solved so its widest value sits this far from each separator
# Layout: date left of the time, the time and condition text in the band, six
# complications (top-middle defaults to weather), and the status icons in pairs at the band
# in the top- and bottom-middle sections. Time and text are Roboto Condensed.
SECTION_GAP = 10                          # band edge -> status-icon pair
GLANCE_SECTIONS = (["alarm", "dnd"], ["disconnect", "lock"])   # top pair, bottom pair
GLANCE_PAIR_GAP = 14                      # gap between the two icons of a pair
RULE_FLAT = 64                            # rule between each pair and its metric: flat middle,
RULE_END_GAP = 6                          #   ends bent towards the rim (aimed at the divider
                                          #   elbows), stopping this far from the dividers
BRASS_FLOOR = 0.18                        # brass gradients (band edges, separators) keep at least
                                          #   this share of brass at their ends
# face options (Twisted Sextant sets these in its design/variant.json)
TURN_CORNERS = False                      # corner values run along their gauges, at the rim, with
                                          #   the icon inward (the top/bottom-middle layout turned)
DIAG_AT_GAUGE_MID = False                 # diagonal markers at the corner gauges' mid-points (43.5 deg)
                                          #   instead of 45.5, so they point at turned values
AOD_STROKE = 2.0                          # always-on outline digits (Zepp: at least 2px)
TIME_PX = None                            # (solved by the generator; tabular cells)
VALUE_PX = 34                             # complication values (Roboto Condensed Regular)
UNIT_PX = 16                              # Zepp's minimum text size
DATE_SMALL_PX, DATE_DAY_PX = 19, 29
BATTERY_VALUE_PX = 23
DESC_PX = 22
ICON_PX = 26
ICON_GAP = 10                             # icon box <-> value box
VISIBLE_ICON_GAP = 13.5                   # the same gap measured on the drawings (icons sit ~3.5px inside their box)
LINE_W = 3                                # dividers, separators, band edges (2 was too faint on the watch)
BATTERY_ICON_PX = 25

# ----------------------------------------------------------------------------- colours
def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

METRICS = {
    # id: (title, colour, has_progress)
    "battery":  ("Battery",        "#4DE982", True),
    "steps":    ("Steps",          "#3DDC84", True),
    "heart":    ("Heart rate",     "#FF4D5E", False),
    "distance": ("Distance",       "#3DA5FF", False),
    "calories": ("Calories",       "#FF8A3D", True),
    "floors":   ("Floors climbed", "#9D8CFF", True),
    "pai":      ("PAI",            "#2EE6C5", True),
    "stand":    ("Stand",          "#7FD1FF", True),
    "fatburn":  ("Fat burning",    "#FF7043", True),
    "spo2":     ("Blood oxygen",   "#FF6B8B", False),
    "stress":   ("Stress",         "#FFB13D", False),
    "uvi":      ("UV index",       "#D17BFF", False),
    "humidity": ("Humidity",       "#4FC3F7", False),
    "aqi":      ("Air quality",    "#A0D468", False),
    "sun":      ("Sunrise/sunset", "#FFC23D", False),
    "weather":  ("Weather",        "#8AB4F8", False),
    "resting":  ("Resting heart rate", "#FF8A95", False),
    "sleep":    ("Sleep",          "#8C9EFF", True),
    "sleepscore": ("Sleep score",  "#B39DFF", True),
    "bodytemp": ("Body temperature", "#FF9E80", False),
    "vo2max":   ("VO2 max",        "#4DD0E1", False),
    "trainload": ("Training load", "#FFD54F", False),
    "recovery": ("Recovery time",  "#81C784", False),
    "altitude": ("Altitude",       "#BCAAA4", False),
    "pressure": ("Air pressure",   "#90A4AE", False),
    "compass":  ("Compass",        "#E6C27A", False),
    "moon":     ("Moon phase",     "#E8E2C4", False),
    "forecast": ("Today's forecast", "#8AB4F8", False),
}
# editor titles in Simplified and Traditional Chinese (Zepp asks for English, SC and TC)
TITLES_ZH = {
    "battery": ("电池", "電池"), "steps": ("步数", "步數"), "distance": ("距离", "距離"), "calories": ("卡路里", "卡路里"),
    "floors": ("爬楼", "爬樓"), "stand": ("站立", "站立"), "fatburn": ("燃脂", "燃脂"), "pai": ("PAI", "PAI"),
    "heart": ("心率", "心率"), "resting": ("静息心率", "靜息心率"), "spo2": ("血氧", "血氧"),
    "stress": ("压力", "壓力"), "bodytemp": ("体温", "體溫"), "sleep": ("睡眠", "睡眠"),
    "sleepscore": ("睡眠评分", "睡眠評分"), "vo2max": ("最大摄氧量", "最大攝氧量"),
    "trainload": ("训练负荷", "訓練負荷"), "recovery": ("恢复时间", "恢復時間"), "weather": ("天气", "天氣"),
    "forecast": ("今日预报", "今日預報"), "uvi": ("紫外线", "紫外線"), "humidity": ("湿度", "濕度"),
    "aqi": ("空气质量", "空氣品質"), "altitude": ("海拔", "海拔"), "pressure": ("气压", "氣壓"),
    "compass": ("指南针", "指南針"), "sun": ("日出日落", "日出日落"), "moon": ("月相", "月相"),
}
# small unit letters some metrics draw after their value (in the metric's colour)
UNIT_CHARS = {"distance": "kmi", "recovery": "h", "altitude": "mft", "pressure": "hPa", "compass": "NESW"}
DEFAULT_SLOTS = ["steps", "calories", "battery", "weather", "distance", "heart"]   # TL, TR, BL, BM, BR, TM
EDIT_METRICS = None                       # metrics the editable slots offer (None: all)
FIXED_SLOTS = {}                          # {slot index: metric} for slots that aren't editable
DEMO_VALUES = None                        # mock-ups only: {metric: {"text", "unit", "progress", "icon"}}
                                          #   shown instead of sensor readings the emulator can't feed

THEMES = {
    "color": dict(
        text=(244, 246, 248), muted=(150, 160, 172), accent=(214, 172, 96),
        desc=(255, 214, 120), divider=(52, 59, 68),
        band=((20, 34, 58), (8, 13, 24)), glow_lo=(20, 24, 30),
        time=((255, 255, 255), (208, 228, 251)),          # brass gradient (top -> bottom)
        aod_time=(214, 176, 112), aod_text=(180, 186, 194),
        dim_factor=0.30,
    ),
    "mono": dict(
        text=(244, 246, 248), muted=(150, 156, 164), accent=(206, 210, 216),
        desc=(220, 224, 230), divider=(58, 62, 68),
        band=((30, 32, 36), (10, 11, 13)), glow_lo=(22, 24, 26),
        time=((255, 255, 255), (196, 204, 214)),
        aod_time=(210, 214, 220), aod_text=(170, 174, 180),
        dim_factor=0.30, metric=(236, 238, 240), muted_icon=(120, 124, 130),
    ),
    "night": dict(
        # each red is the dimmest that stays readable: 4.5:1 on black for text under 24px
        # (condition, units), 3:1 for the larger date and always-on text
        text=(232, 44, 26), muted=(174, 33, 20), accent=(205, 38, 22),
        desc=(224, 42, 25), divider=(60, 10, 6),
        band=None, glow_lo=(16, 3, 2),                  # no band fill: pure black for night vision
        time=((240, 52, 30), (190, 34, 20)),
        aod_time=(190, 34, 20), aod_text=(175, 30, 19),
        dim_factor=0.28, metric=(225, 41, 24), muted_icon=(120, 22, 12),
    ),
}


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

BATTERY_COLORS = {"high": "#3DDC84", "mid": "#FFB03D", "low": "#FF4D5E"}

# weather condition index (Zepp OS) -> (icon kind, description)
WEATHER = [
    ("partly_day", "PARTLY CLOUDY"),      # 0
    ("shower", "SHOWERS"),                # 1
    ("snow_light", "SNOW FLURRIES"),      # 2
    ("sunny", "SUNNY"),                   # 3
    ("overcast", "OVERCAST"),             # 4
    ("rain_light", "LIGHT RAIN"),         # 5
    ("snow_light", "LIGHT SNOW"),         # 6
    ("rain", "RAIN"),                     # 7
    ("snow", "SNOW"),                     # 8
    ("snow_heavy", "HEAVY SNOW"),         # 9
    ("rain_heavy", "HEAVY RAIN"),         # 10
    ("dust", "DUST STORM"),               # 11
    ("sleet", "SLEET"),                   # 12
    ("fog", "FOG"),                       # 13
    ("fog", "HAZE"),                      # 14
    ("thunder", "T-STORMS"),              # 15
    ("snow_heavy", "SNOWSTORM"),          # 16
    ("dust", "DUST"),                     # 17
    ("rain_heavy", "SEVERE STORM"),       # 18
    ("hail", "HAIL"),                     # 19
    ("thunder", "T-STORMS & HAIL"),       # 20
    ("rain_heavy", "HEAVY STORM"),        # 21
    ("dust", "SAND"),                     # 22
    ("dust", "SANDSTORM"),                # 23
    ("rain_heavy", "RAINSTORM"),          # 24
    ("unknown", ""),                      # 25
    ("partly_night", "PARTLY CLOUDY"),    # 26
    ("shower", "SHOWERS"),                # 27
    ("clear_night", "CLEAR"),             # 28
]


# ----------------------------------------------------------------------------- overrides
# SEXTANT_OVERRIDES='{"VALUE_PX": 42}' python3 design/generate.py
# builds a variant without editing this file (used for side-by-side mock-ups).
import json as _json
import os as _os
for _k, _v in _json.loads(_os.environ.get("SEXTANT_OVERRIDES", "{}")).items():
    if _k not in globals():
        raise KeyError(f"unknown override {_k}")
    globals()[_k] = _v
# derived values follow any overridden band edges
BAND_IN = (BAND_T + 1, BAND_B - 1)
MID = (BAND_T + BAND_B) / 2

