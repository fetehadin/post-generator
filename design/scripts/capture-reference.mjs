// Capture public ScholarXIV pages as a design reference: screenshots + computed styles.
//
//   cd design && npm install && npx playwright install chromium && npm run capture
//
// Public pages only, no login, one request at a time, at most 6 pages.
// Output (git-ignored): design/reference/*.png and design/reference/styles.json

import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const SITE = 'https://www.scholarxiv.com'
const OUT = new URL('../reference/', import.meta.url).pathname
// Logged-out visitors get a 404 for app routes (/home, /chat, /paper/...), so the app
// shell comes from the team's own screenshots instead (see REFERENCE_SCHOLARXIV.md).
const CANDIDATES = [
  ['landing', '/'],
  ['pricing', '/pricing'],
  ['docs', '/developers/docs/papers-api'],
  ['docs-code', '/developers/docs/agent-api/quickstart'],
  ['not-found', '/home'],
]
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const PROPS = [
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color',
  'background-color', 'background-image', 'border', 'border-radius', 'box-shadow',
  'padding', 'margin', 'max-width', 'width', 'transition', 'backdrop-filter',
]
// What to measure: [label, CSS selector]. The first visible match is measured.
const TARGETS = [
  ['body', 'body'],
  ['h1', 'h1'],
  ['h2', 'h2'],
  ['h3', 'h3'],
  ['nav', 'nav, aside, header'],
  ['nav-item', 'nav a, nav button, aside a, aside button'],
  ['search-input', 'input[type=search], input[placeholder], textarea'],
  ['search-box', 'form:has(input), div:has(> input[placeholder]), div:has(> textarea)'],
  ['button-primary', 'button[type=submit], a[class*=bg-], button[class*=bg-primary], button'],
  ['button', 'button'],
  ['card', 'article, [class*=card], [class*=rounded-xl], [class*=rounded-2xl]'],
  ['list-item', 'li'],
  ['link', 'p a, main a'],
  ['reader-text', 'article p, main p, p'],
  ['chip', '[class*=rounded-full]'],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function measure(page) {
  return page.evaluate(
    ({ TARGETS, PROPS }) => {
      const visible = (el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
      }
      const pick = (el) => {
        const cs = getComputedStyle(el)
        const out = Object.fromEntries(PROPS.map((p) => [p, cs.getPropertyValue(p)]))
        const r = el.getBoundingClientRect()
        out._box = `${Math.round(r.width)}x${Math.round(r.height)}`
        out._text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
        return out
      }
      const elements = {}
      for (const [label, sel] of TARGETS) {
        let el
        try {
          el = [...document.querySelectorAll(sel)].find(visible)
        } catch {
          el = undefined
        }
        if (el) elements[label] = pick(el)
      }
      const root = getComputedStyle(document.documentElement)
      const vars = {}
      for (let i = 0; i < root.length; i++) {
        const name = root[i]
        if (name.startsWith('--')) vars[name] = root.getPropertyValue(name).trim()
      }
      return {
        html: { class: document.documentElement.className, theme: document.documentElement.dataset.theme },
        elements,
        rootVariables: vars,
      }
    },
    { TARGETS, PROPS },
  )
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const styles = {}

for (const [name, path] of CANDIDATES) {
  for (const mode of ['light', 'dark']) {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport, colorScheme: mode })
      // The site keeps its theme choice in localStorage (mode-watcher); set it before load.
      await context.addInitScript((m) => localStorage.setItem('mode-watcher-mode', m), mode)
      const page = await context.newPage()
      try {
        await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 45000 })
      } catch {
        await page.waitForTimeout(3000)
      }
      // The landing page shows a splash loader first; wait for real headings.
      await page.locator('h1, h2').first().waitFor({ timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(2500)
      const finalUrl = page.url()
      if (/login|sign-?in|auth/i.test(finalUrl)) {
        console.log(`skip ${name}: redirects to ${finalUrl}`)
        await context.close()
        break
      }
      const file = `${name}-${vpName}-${mode}.png`
      await page.screenshot({ path: OUT + file })
      if (vpName === 'desktop') {
        styles[`${name}/${mode}`] = { url: finalUrl, screenshot: file, ...(await measure(page)) }
      }
      console.log(`${file} ← ${finalUrl}`)
      await context.close()
      await sleep(1000) // be polite: one request at a time
    }
  }
}

await writeFile(OUT + 'styles.json', JSON.stringify(styles, null, 1))
await browser.close()
console.log(`styles.json: ${Object.keys(styles).length} page/theme entries`)
