#!/usr/bin/env python3
"""Regenerate Sextant's assets (assets/common.r) and watchface/layout.generated.js."""
import sys
from pathlib import Path

FACE = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(FACE), str(FACE.parents[1] / "lib" / "py")]
from design.assets import generate  # noqa: E402

if __name__ == "__main__":
    n = generate()["_notes"]
    print(f"sextant: time {n['time_px']}px (gap to separators {n['time_gap_side']}px, condition gaps {n['time_gap_vertical']}px); "
          f"corner x={n['side_value_x']}, '99,999' {n['width_99999']}px wide, {n['gap_99999_to_divider']}px from divider")
