# Design research

Static prototypes and the tools that made them. **Not part of the app:** nothing in `frontend/` imports from here.

| Path | What |
|---|---|
| `prototypes/today.html`, `editor.html`, `states.html` | The Today screen, the draft editor and every §7 state. Open them in a browser. The theme button cycles light → dark → mixed, and `?theme=dark` in the URL picks one. |
| `prototypes/tokens.css` | The design tokens from DESIGN.md §5 (the source the app copies) |
| `REFERENCE_SCHOLARXIV.md` | What we learned from ScholarXIV and what we didn't take |
| `scripts/capture-reference.mjs` | Captures the reference site's public pages: screenshots and computed styles |
| `scripts/screenshot-prototypes.mjs` | Screenshots the prototypes at 1440×900 and 390×844 in all themes |

```bash
cd design
npm install
npx playwright install chromium   # once
npm run shots                      # → prototypes/screenshots/ (git-ignored)
npm run capture                    # → reference/ (git-ignored: third-party screenshots stay local)
```

Prototype text comes from `samples/` (anonymised), plus one Amharic line to check Ethiopic rendering.
