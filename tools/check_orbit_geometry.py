#!/usr/bin/env python3
"""Geometry gate for WatchWit Orbit at its native 480x480 resolution.

Run: python3 tools/check_orbit_geometry.py
This validates the intended visual blueprint, not a screenshot or the watch OS
renderer. A screenshot comparison and real-watch inspection are still required.
"""
from dataclasses import dataclass

W = H = 480
SAFE = 12
MIN_GAP = 8

@dataclass(frozen=True)
class Region:
    name: str
    x: int
    y: int
    w: int
    h: int

    @property
    def right(self):
        return self.x + self.w

    @property
    def bottom(self):
        return self.y + self.h


regions = [
    Region("top-left complication", 45, 54, 122, 98),
    Region("top-center complication", 179, 54, 122, 98),
    Region("top-right complication", 313, 54, 122, 98),
    Region("hero clock", 49, 171, 382, 142),
    Region("bottom-left complication", 45, 324, 122, 98),
    Region("bottom-center complication", 179, 324, 122, 98),
    Region("bottom-right complication", 313, 324, 122, 98),
    Region("branding", 150, 442, 180, 20),
]

def separation(a, b):
    """Non-negative axis gaps; both zero means the regions collide."""
    dx = max(a.x - b.right, b.x - a.right, 0)
    dy = max(a.y - b.bottom, b.y - a.bottom, 0)
    return dx, dy

def validate(rs=regions):
    errors = []
    for r in rs:
        if min(r.x, r.y) < SAFE or r.right > W - SAFE or r.bottom > H - SAFE:
            errors.append(f"{r.name}: out of {SAFE}px screen safe area")
    for i, a in enumerate(rs):
        for b in rs[i+1:]:
            dx, dy = separation(a, b)
            if dx == 0 and dy == 0:
                errors.append(f"{a.name} overlaps {b.name}")
            elif dx < MIN_GAP and dy < MIN_GAP:
                errors.append(f"{a.name} too close to {b.name}: {dx}px / {dy}px")
    return errors

if __name__ == "__main__":
    issues = validate()
    if issues:
        raise SystemExit("Geometry validation FAILED:\n" + "\n".join(issues))
    print(f"Orbit blueprint geometry PASS ({len(regions)} regions, {MIN_GAP}px minimum spacing)")
