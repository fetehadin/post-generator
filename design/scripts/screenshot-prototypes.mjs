// Screenshot the prototypes at the reference sizes, in every theme.
//   cd design && npm run shots   →   design/prototypes/screenshots/*.png (git-ignored)

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const DIR = new URL('../prototypes/', import.meta.url)
const OUT = new URL('screenshots/', DIR).pathname
const PAGES = ['today', 'editor', 'states']
const THEMES = ['light', 'dark', 'mixed']
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
for (const name of PAGES) {
  for (const theme of THEMES) {
    for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage({ viewport })
      await page.goto(new URL(`${name}.html?theme=${theme}`, DIR).href)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}${name}-${vp}-${theme}.png`, fullPage: name === 'states' })
      if (name === 'editor' && vp === 'mobile') {
        await page.getByRole('button', { name: 'Preview' }).click()
        await page.screenshot({ path: `${OUT}${name}-${vp}-${theme}-preview.png` })
      }
      await page.close()
    }
  }
}
await browser.close()
console.log('screenshots in', OUT)
