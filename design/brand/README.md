# Voxlace logo

The "talking o" wordmark: `voxlace` in Outfit Bold, outlined, with the o as a speech bubble. Chosen by Fetehadin on 19 Nov 2026.

Open `assets/sheet.html` in a browser to see the full brand sheet: how it's built, colors, icons and examples.

## The idea

- The o keeps Outfit's own curve and inner hole. Only its lower-left quarter is squared off, and that corner is the bubble's tail. So the bubble has exactly the same stroke weight as every other letter.
- The single-storey a has the same flat corner, on the right. The two letters echo each other.
- **In use: black and white** (chosen 20 Nov 2026): the whole logo in one colour, ink on light and paper on dark. See DESIGN.md §5, Logo.
- An alternative kept for later: only the o in teal, `#2B6B5B` (light theme) or `#72C4AE` (dark theme), the AI colour (`--thread`).
- The app icon is the o alone in a rounded square shaped like a phone app icon. It sits slightly up and to the right of center, because the tail makes the lower left look heavier.

## Files (`assets/`)

| File | Use |
|---|---|
| `voxlace-wordmark-teal.svg` | Main logo on light backgrounds |
| `voxlace-wordmark-teal-dark.svg` | Main logo on dark backgrounds |
| `voxlace-wordmark.svg` / `-white.svg` | One color: ink or white |
| `voxlace-mark.svg` | The bubble o alone |
| `voxlace-app-icon.svg` / `-teal.svg` | App icon; the teal one is for social avatars |
| `favicon.svg` | Browser tab (the o is a little bigger so it reads at 16 px) |
| `apple-touch-icon.png` | iPhone home screen, 180 px |
| `voxlace-app-icon-512.png`, `voxlace-wordmark-teal.png` | Bitmaps for places that don't take SVG |
| `voxlace-logo-ink-512.png` | **In use:** square app logo, white bubble-o on ink (GitHub app logo, avatars) |
| `voxlace-logo-teal-512.png` | The same in teal (alternative) |
| `og-image.svg` | Source of `frontend/public/og-image.png` (link previews) |

**Rules:** keep clear space around the logo equal to one o. Don't use the wordmark smaller than 72 px wide; below that, use the icon. Don't stretch it, recolor letters other than the o, or set "voxlace" in a font instead of using these files.

## Rebuilding

The SVGs are made from the font's outlines, so a change of weight, spacing or tail is a re-run, not hand editing.

```bash
cd design/brand
python3 -m venv .venv && .venv/bin/pip install fonttools skia-pathops
mkdir -p fonts && curl -L -o fonts/Outfit.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/Outfit%5Bwght%5D.ttf"
.venv/bin/python final.py   # writes assets/paths.json
.venv/bin/python sheet.py   # writes the SVGs and sheet.html
```

- `wordmark.py`: takes the letters from the font and builds the bubble o with path booleans (union with a corner square, then subtract the original inner hole).
- `final.py`: the chosen settings: weight 700, letter spacing −0.035 em, tip radius 2%, hand spacing for v–o, o–x, x–l and a–c.
- `sheet.py`: writes every SVG file and the brand sheet.

Outfit is under the SIL Open Font License, which allows its use in a logo. `fonts/` is git-ignored.
