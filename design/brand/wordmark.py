"""Build the Voxlace "talking o" wordmark from real font outlines.

The o keeps the typeface's own outer curve and counter; one quadrant of its outer
shape is squared off into a speech-bubble corner (pathops booleans), so the bubble
has exactly the font's stroke weight. Output: SVG paths, no font needed to render.
"""

import functools
import json
import sys
from pathlib import Path

import pathops
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = Path(__file__).parent


@functools.cache
def load(font: str, wght: int) -> TTFont:
    f = TTFont(HERE / "fonts" / f"{font}.ttf")
    if "fvar" in f:
        f = instancer.instantiateVariableFont(f, {"wght": wght})
    return f


def glyph_path(f: TTFont, ch: str) -> pathops.Path:
    gs = f.getGlyphSet()
    name = f.getBestCmap()[ord(ch)]
    p = pathops.Path()
    gs[name].draw(p.getPen())
    return p


def contours(p: pathops.Path) -> list[pathops.Path]:
    out = []
    for c in p.contours:
        q = pathops.Path()
        pen = q.getPen()
        c.draw(pen)
        out.append(q)
    return out


def area(p: pathops.Path) -> float:
    return abs(p.area)


def rounded_corner_rect(x0, y0, x1, y1, r, corner):
    """Rectangle with only `corner` (bl/br/tl) rounded by r; the bubble's tip."""
    p = pathops.Path()
    pen = p.getPen()
    k = 0.5523  # quarter-circle bezier constant
    pts = {"bl": (x0, y0), "br": (x1, y0), "tl": (x0, y1)}
    cx, cy = pts[corner]
    # walk the rectangle counter-clockwise, rounding only the chosen corner
    seq = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    i = seq.index((cx, cy))
    seq = seq[i:] + seq[:i]
    (ax, ay), nxt, _, prv = seq
    dx1 = (nxt[0] - ax) and (r if nxt[0] > ax else -r)
    dy1 = (nxt[1] - ay) and (r if nxt[1] > ay else -r)
    dx0 = (prv[0] - ax) and (r if prv[0] > ax else -r)
    dy0 = (prv[1] - ay) and (r if prv[1] > ay else -r)
    start = (ax + dx0, ay + dy0)
    end = (ax + dx1, ay + dy1)
    pen.moveTo(end)
    for pt in seq[1:]:
        pen.lineTo(pt)
    pen.lineTo(start)
    pen.curveTo(
        (start[0] - dx0 * k, start[1] - dy0 * k),
        (end[0] - dx1 * k, end[1] - dy1 * k),
        end,
    )
    pen.closePath()
    return p


def bubble_o(f: TTFont, corner: str, radius: float) -> pathops.Path:
    o = glyph_path(f, "o")
    cs = sorted(contours(o), key=area, reverse=True)
    outer, inner = cs[0], cs[1]
    x0, y0, x1, y1 = outer.bounds
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if corner == "bl":
        rect = rounded_corner_rect(x0, y0, cx, cy, radius, "bl")
    elif corner == "br":
        rect = rounded_corner_rect(cx, y0, x1, cy, radius, "br")
    else:
        rect = rounded_corner_rect(x0, cy, cx, y1, radius, "tl")
    shape = pathops.op(outer, rect, pathops.PathOp.UNION)
    return pathops.op(shape, inner, pathops.PathOp.DIFFERENCE)


def to_svg_d(p: pathops.Path, dx: float, flip_y: float) -> str:
    pen = SVGPathPen(None, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    tp = TransformPen(pen, (1, 0, 0, -1, dx, flip_y))
    p.draw(tp)
    return pen.getCommands()


def build(
    font,
    wght,
    tracking=-0.02,
    corner="bl",
    radius=0.0,
    kern=None,
    word="voxlace",
    o_only=False,
):
    f = load(font, wght)
    upm = f["head"].unitsPerEm
    hmtx = f["hmtx"]
    cmap = f.getBestCmap()
    asc = f["OS/2"].sCapHeight or f["hhea"].ascent
    xh = f["OS/2"].sxHeight
    kern = kern or {}
    # o metrics, for the radius and the mark
    o_glyph = glyph_path(f, "o")
    ox0, oy0, ox1, oy1 = o_glyph.bounds
    r = radius * (ox1 - ox0)
    paths, x = [], 0.0
    letters = "o" if o_only else word
    for i, ch in enumerate(letters):
        p = bubble_o(f, corner, r) if ch == "o" else glyph_path(f, ch)
        if i:
            x += kern.get(letters[i - 1] + ch, 0) * upm
        paths.append((p, x))
        x += hmtx[cmap[ord(ch)]][0] + tracking * upm
    # tight bounds
    bx0 = min(p.bounds[0] + dx for p, dx in paths)
    bx1 = max(p.bounds[2] + dx for p, dx in paths)
    by0 = min(p.bounds[1] for p, _ in paths)
    by1 = max(p.bounds[3] for p, _ in paths)
    parts = [to_svg_d(p, dx - bx0, by1) for p, dx in paths]
    d = " ".join(parts)
    return {
        "d": d,
        "parts": parts,
        "w": round(bx1 - bx0, 1),
        "h": round(by1 - by0, 1),
        "baseline": round(by1, 1),  # y of the baseline inside the viewBox
        "xheight": xh,
        "upm": upm,
        "stem": None,
        "cap": asc,
    }


if __name__ == "__main__":
    spec = json.loads(sys.argv[1])
    print(json.dumps(build(**spec)))
