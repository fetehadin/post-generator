"""Write the final SVG files and the brand sheet (HTML) from out/paths.json."""

import json
from pathlib import Path

OUT = Path(__file__).parent / "assets"
P = json.loads((OUT / "paths.json").read_text())
wm, mark, sq = P["wm"], P["mark"], P["squircle"]
INK, PAPER, DARK = "#09090B", "#FAFAFA", "#171717"
TEAL, TEAL_D = "#2B6B5B", "#72C4AE"
W, H = wm["w"], wm["h"]
MW, MH = mark["w"], mark["h"]
o_d = wm["parts"][1]
rest_d = " ".join(p for i, p in enumerate(wm["parts"]) if i != 1)


def wordmark_svg(ink=INK, o=None):
    o = o or ink
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
        f'<path fill="{ink}" d="{rest_d}"/><path fill="{o}" d="{o_d}"/></svg>'
    )


def icon_svg(bg=INK, fg=PAPER, scale=0.56):
    # optical centre: the square tip adds weight bottom-left, so nudge up and right
    s = 100 * scale / max(MW, MH)
    tx = (100 - MW * s) / 2 + 1.2
    ty = (100 - MH * s) / 2 - 1.2
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'<path fill="{bg}" d="{sq}"/>'
        f'<path fill="{fg}" transform="translate({tx:.2f} {ty:.2f}) scale({s:.5f})" d="{mark["d"]}"/>'
        f"</svg>"
    )


files = {
    "voxlace-wordmark.svg": wordmark_svg(),
    "voxlace-wordmark-white.svg": wordmark_svg(PAPER),
    "voxlace-wordmark-teal.svg": wordmark_svg(INK, TEAL),
    "voxlace-wordmark-teal-dark.svg": wordmark_svg(PAPER, TEAL_D),
    "voxlace-mark.svg": f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MW} {MH}"><path fill="{INK}" d="{mark["d"]}"/></svg>',
    "voxlace-app-icon.svg": icon_svg(),
    "voxlace-app-icon-teal.svg": icon_svg(TEAL, "#FFFFFF"),
    "favicon.svg": icon_svg(scale=0.64),
}
for name, svg in files.items():
    (OUT / name).write_text(svg)

# ---------- brand sheet ----------
SYM = f"""<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="vx-rest" viewBox="0 0 {W} {H}"><path d="{rest_d}"/></symbol>
<symbol id="vx-o" viewBox="0 0 {W} {H}"><path d="{o_d}"/></symbol>
<symbol id="vx-mark" viewBox="0 0 {MW} {MH}"><path d="{mark["d"]}"/></symbol>
<symbol id="vx-sq" viewBox="0 0 100 100"><path d="{sq}"/></symbol>
</defs></svg>"""


def wm_use(cls, ink, o):
    return (
        f'<svg class="{cls}" viewBox="0 0 {W} {H}" role="img" aria-label="voxlace">'
        f'<use href="#vx-rest" fill="{ink}"/><use href="#vx-o" fill="{o}"/></svg>'
    )


def icon_use(px, bg, fg, scale=0.56, radius_shape="sq"):
    s = 100 * scale / max(MW, MH)
    tx = (100 - MW * s) / 2 + 1.2
    ty = (100 - MH * s) / 2 - 1.2
    shape = (
        f'<use href="#vx-sq" fill="{bg}"/>'
        if radius_shape == "sq"
        else f'<circle cx="50" cy="50" r="50" fill="{bg}"/>'
    )
    return (
        f'<svg width="{px}" height="{px}" viewBox="0 0 100 100" aria-hidden="true">{shape}'
        f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.5f})"><path fill="{fg}" d="{mark["d"]}"/></g></svg>'
    )


# construction drawing in mark units
cx, cy, rx, ry = MW / 2, MH / 2, MW / 2, MH / 2
base = mark["baseline"]
pad = 70
CONSTRUCT = f"""<svg class="construct" viewBox="{-pad} {-pad} {MW + 2 * pad} {MH + 2 * pad}" aria-label="How the o is built">
<defs><pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="16" fill="{TEAL}" opacity=".55"/></pattern></defs>
<clipPath id="oclip"><path d="{mark["d"]}"/></clipPath>
<path fill="var(--foreground)" opacity=".92" d="{mark["d"]}"/>
<rect x="0" y="{cy}" width="{cx}" height="{MH - cy}" fill="url(#hatch)" clip-path="url(#oclip)"/>
<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{TEAL_D}" stroke-width="5" stroke-dasharray="14 12"/>
<line x1="{-pad}" x2="{MW + pad}" y1="{base}" y2="{base}" stroke="{TEAL_D}" stroke-width="3"/>
<line x1="{-pad}" x2="{MW + pad}" y1="0" y2="0" stroke="{TEAL_D}" stroke-width="3" stroke-dasharray="6 8"/>
<line x1="{cx}" x2="{cx}" y1="{-pad}" y2="{MH + pad}" stroke="{TEAL_D}" stroke-width="2" stroke-dasharray="4 8"/>
<line x1="{-pad}" x2="{MW + pad}" y1="{cy}" y2="{cy}" stroke="{TEAL_D}" stroke-width="2" stroke-dasharray="4 8"/>
</svg>"""

CSS = """
.vx{display:flex;flex-direction:column;gap:22px;font-family:var(--font-sans)}
.vx svg{display:block}
.lab{font:600 11px/1 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted-foreground)}
.sec{display:flex;flex-direction:column;gap:10px}
.sec>p{margin:0;font-size:13.5px;line-height:1.55;color:var(--muted-foreground);max-width:62ch}
.hero{border-radius:var(--radius);padding:16px;background:#fff;border:1px solid #E4E4E7;display:grid;place-items:center;height:250px;position:relative}
.hero .w{width:min(78%,440px)}
.hero .tag{position:absolute;left:16px;bottom:14px;font:500 12px/1.3 var(--font-sans);color:#71717A}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
@media (max-width:600px){.grid4{grid-template-columns:repeat(2,minmax(0,1fr))}.grid2{grid-template-columns:1fr}}
.tile{border-radius:var(--radius);padding:16px;height:118px;display:flex;flex-direction:column;justify-content:space-between}
.tile .w{width:82%;align-self:center;margin-top:18px}
.tile small{font:500 11.5px/1.3 var(--font-sans)}
.t-light{background:#fff;border:1px solid #E4E4E7;color:#71717A}
.t-dark{background:#171717;border:1px solid #2E2E2E;color:#A1A1AA}
.t-teal{background:#2B6B5B;color:#CFE7E0}
.t-sunk{background:#F4F4F5;border:1px solid #E4E4E7;color:#71717A}
.build{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:16px;align-items:center;border:1px solid var(--border);border-radius:var(--radius);padding:16px}
@media (max-width:600px){.build{grid-template-columns:1fr}}
.construct{width:100%;max-width:260px;justify-self:center}
.notes{display:flex;flex-direction:column;gap:12px;margin:0;padding:0;list-style:none}
.notes li{display:grid;grid-template-columns:22px 1fr;gap:8px;font-size:13.5px;line-height:1.5}
.notes b{display:block;font-weight:600;color:var(--foreground)}
.notes span.k{width:14px;height:14px;border-radius:4px;margin-top:3px}
.notes span.t{color:var(--muted-foreground)}
.icons{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-end;border:1px solid var(--border);border-radius:var(--radius);padding:16px}
.ic{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:11.5px;color:var(--muted-foreground)}
.tabs{display:flex;gap:2px;align-items:flex-end}
.tab{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px 10px 0 0;font:12px system-ui,sans-serif;width:150px}
.tab.on{background:#fff;color:#09090B;border:1px solid #E4E4E7;border-bottom:0}
.tab.off{background:#E4E4E7;color:#52525B}
.ctx{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:start}
@media (max-width:600px){.ctx{grid-template-columns:1fr}}
.side{border-radius:var(--radius);background:#fff;border:1px solid #E4E4E7;padding:16px;display:flex;flex-direction:column;gap:6px;font:13px/1 Archivo,system-ui,sans-serif;color:#52525B}
.side .top{display:flex;align-items:center;justify-content:space-between;padding:2px 2px 12px}
.side .w{width:104px}
.nav{padding:9px 10px;border-radius:8px}
.nav.cur{background:#F4F4F5;color:#09090B;font-weight:600}
.newbtn{margin-top:6px;background:#18181B;color:#FAFAFA;border-radius:8px;padding:10px;text-align:center;font-weight:600}
.og{border-radius:var(--radius);overflow:hidden;border:1px solid #2E2E2E;background:#171717;display:flex;flex-direction:column}
.og .img{aspect-ratio:1.91/1;max-width:100%;background:#171717;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:0 9%;position:relative;overflow:hidden}
.og .img .w{width:58%}
.og .img p{margin:0;color:#A1A1AA;font:500 13px/1.4 var(--font-sans);max-width:30ch}
.og .img .glyph{position:absolute;right:-9%;bottom:-24%;width:46%;opacity:.09}
.og .meta{padding:10px 14px;border-top:1px solid #2E2E2E;font:12px/1.4 system-ui,sans-serif;color:#A1A1AA}
.og .meta b{display:block;color:#FAFAFA;font-weight:600}
.spec{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
@media (max-width:600px){.spec{grid-template-columns:repeat(2,minmax(0,1fr))}}
.spec div{background:var(--background);padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.spec b{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.ba{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:12px;align-items:center}
.ba .tile{height:96px}
.ba .arrow{color:var(--muted-foreground);font-size:18px}
.old{font:900 34px/1 Nunito,sans-serif;letter-spacing:-.03em;color:#09090B;align-self:center;margin-top:12px;display:flex;align-items:baseline}
.old svg{width:.7em;height:.7em;margin:0 .01em;transform:translateY(.07em)}
"""

old_o = '<svg viewBox="0 0 48 48"><path fill="#09090B" fill-rule="evenodd" d="M24 4a20 20 0 1 1-12.6 35.5L4 43l2.8-8.3A20 20 0 0 1 24 4zm0 8.6a11.4 11.4 0 1 0 0 22.8 11.4 11.4 0 0 0 0-22.8z"/></svg>'

HTML = f"""<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600&family=Nunito:wght@900&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>{SYM}
<div class="vx">

<div class="hero">{wm_use("w", INK, TEAL)}<span class="tag">Primary lockup · ink with the teal o</span></div>

<section class="sec"><span class="lab">The idea</span>
<p>The o is the speech bubble. It keeps the typeface's own o and squares off one corner as the bubble's tail, so it sits on the baseline like any other letter and has exactly the same weight.</p>
<div class="build">{CONSTRUCT}
<ul class="notes">
<li><span class="k" style="border:2px dashed {TEAL_D}"></span><div><b>Outfit's own o</b><span class="t">Same curve and counter as the font, so the bubble has the same weight as v, x and l.</span></div></li>
<li><span class="k" style="background:{TEAL};opacity:.45"></span><div><b>One square corner</b><span class="t">The lower-left quarter becomes the tail. The single-storey a has the same flat corner, on the other side.</span></div></li>
<li><span class="k" style="background:{TEAL_D};height:3px;margin-top:9px"></span><div><b>Sits on the baseline</b><span class="t">The tail points down-left at whoever is speaking, the way a chat bubble does. In Voxlace, that's you.</span></div></li>
</ul></div></section>

<section class="sec"><span class="lab">Color</span>
<p>Teal is the color the app already uses for the AI. On the o it says one thing: this is where your voice comes from. Use the all-ink and all-white versions anywhere one color is needed.</p>
<div class="grid4">
<div class="tile t-light">{wm_use("w", INK, TEAL)}<small>Ink + teal</small></div>
<div class="tile t-dark">{wm_use("w", PAPER, TEAL_D)}<small>Paper + light teal</small></div>
<div class="tile t-sunk">{wm_use("w", INK, INK)}<small>One color, ink</small></div>
<div class="tile t-teal">{wm_use("w", "#FFFFFF", "#FFFFFF")}<small>One color, white</small></div>
</div></section>

<section class="sec"><span class="lab">App icon and small sizes</span>
<p>The o alone is the icon, in a continuous-curve square like a phone's home screen. It's nudged slightly up and right because the tail adds weight to the lower left.</p>
<div class="icons">
<div class="ic">{icon_use(84, INK, PAPER)}App icon</div>
<div class="ic">{icon_use(84, TEAL, "#FFFFFF")}Teal</div>
<div class="ic">{icon_use(84, "#F4F4F5", INK)}Light</div>
<div class="ic">{icon_use(56, INK, PAPER, 0.6, "circle")}X avatar</div>
<div class="ic"><div style="display:flex;gap:10px;align-items:center">{icon_use(32, INK, PAPER, 0.64)}{icon_use(16, INK, PAPER, 0.64)}</div>32 · 16 px</div>
<div class="ic"><div class="tabs"><div class="tab on">{icon_use(16, INK, PAPER, 0.64)}Voxlace · Drafts</div><div class="tab off">● Inbox</div></div>Browser tab</div>
</div></section>

<section class="sec"><span class="lab">In use</span>
<div class="ctx">
<div class="side"><div class="top">{wm_use("w", INK, TEAL)}<span>☾</span></div>
<div class="nav cur">Today</div><div class="nav">Drafts</div><div class="nav">Calendar</div><div class="nav">Profile</div>
<div class="newbtn">New chat</div></div>
<div class="og"><div class="img"><svg class="glyph" viewBox="0 0 {MW} {MH}"><use href="#vx-mark" fill="{TEAL_D}"/></svg>{wm_use("w", PAPER, TEAL_D)}<p>Posts for X, LinkedIn and Telegram, written in your own voice.</p></div>
<div class="meta"><b>Voxlace</b>voxlace.fetehadin.com</div></div>
</div></section>

<section class="sec"><span class="lab">Spec</span>
<div class="spec">
<div><span class="lab">Typeface</span><b>Outfit Bold</b></div>
<div><span class="lab">Letter spacing</span><b>−35 / 1000</b></div>
<div><span class="lab">Clear space</span><b>1 × the o</b></div>
<div><span class="lab">Smallest</span><b>72 px wide</b></div>
</div></section>

<section class="sec"><span class="lab">Before and after</span>
<div class="ba">
<div class="tile t-light"><div class="old">v{old_o}xlace</div><small>Option 4: a drawn ring next to font letters</small></div>
<span class="arrow">→</span>
<div class="tile t-light">{wm_use("w", INK, TEAL)}<small>Final: one family, outlined, spaced by hand</small></div>
</div></section>

</div></body></html>"""
(OUT / "sheet.html").write_text(HTML)
print(len(HTML))
