#!/usr/bin/env node
// Headless-Chromium driver for the Voxlace web app. Reads one command per line from stdin
// (or from args joined by ';'), runs them in order, stops at the first failure (exit 1).
//
//   node .claude/skills/run-voxlace/driver.mjs <<'EOF'
//   nav /drafts/x
//   wait-for text=Drafts
//   shot drafts-x
//   errors
//   EOF
//
// Commands:
//   nav <path|url>            go to http://localhost:5173<path> (or a full URL)
//   wait-for <selector>       wait until visible (Playwright selector: text=..., role=..., css)
//   click <selector>          click
//   fill <selector> <text>    replace the field's text (fires React onChange)
//   press <key>               keyboard press on the focused element (Enter, Control+Enter, ...)
//   wait <ms>                 fixed sleep (prefer wait-for)
//   viewport <w> <h>          resize (default 1280x800)
//   theme <light|dark>        emulate prefers-color-scheme
//   shot [name]               full-page screenshot -> $SHOTS/<name>.png (default /tmp/voxlace-shots)
//   text <selector>           print the element's innerText
//   url                       print the current URL
//   errors                    print console errors + failed /api responses; exit 1 if any
//
// Playwright is loaded from $VOXLACE_DRIVER_DEPS (default ~/.cache/voxlace-driver), so it isn't
// a frontend dependency. Install once: npm i --prefix ~/.cache/voxlace-driver playwright@1.64.1
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const deps = process.env.VOXLACE_DRIVER_DEPS || join(homedir(), '.cache/voxlace-driver')
const { chromium } = createRequire(join(deps, 'package.json'))('playwright')
const BASE = process.env.VOXLACE_URL || 'http://localhost:5173'
const SHOTS = process.env.SHOTS || '/tmp/voxlace-shots'
mkdirSync(SHOTS, { recursive: true })

const script = process.argv.length > 2 ? process.argv.slice(2).join(' ').split(';') : readFileSync(0, 'utf8').split('\n')
const lines = script.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.setDefaultTimeout(Number(process.env.TIMEOUT || 15000))
const problems = []
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('response', (r) => r.url().includes('/api/') && r.status() >= 400 && problems.push(`api ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`))

let n = 0
const split = (s) => { const i = s.indexOf(' '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1).trim()] }
try {
  for (const line of lines) {
    const [cmd, rest] = split(line)
    console.log(`> ${line}`)
    switch (cmd) {
      case 'nav': await page.goto(rest.startsWith('http') ? rest : BASE + rest); break
      case 'wait-for': await page.locator(rest).first().waitFor({ state: 'visible' }); break
      case 'click': await page.locator(rest).first().click(); break
      case 'fill': { const [sel, text] = split(rest); await page.locator(sel).first().fill(text); break }
      case 'press': await page.keyboard.press(rest); break
      case 'wait': await page.waitForTimeout(Number(rest)); break
      case 'viewport': { const [w, h] = rest.split(/\s+/).map(Number); await page.setViewportSize({ width: w, height: h }); break }
      case 'theme': await page.emulateMedia({ colorScheme: rest }); break
      case 'shot': { const f = join(SHOTS, `${rest || `shot-${++n}`}.png`); await page.screenshot({ path: f, fullPage: true }); console.log(f); break }
      case 'text': console.log(await page.locator(rest).first().innerText()); break
      case 'url': console.log(page.url()); break
      case 'errors':
        if (problems.length) { console.log(problems.join('\n')); throw new Error(`${problems.length} problem(s)`) }
        console.log('no errors'); break
      default: throw new Error(`unknown command: ${cmd}`)
    }
  }
} catch (e) {
  console.error(`FAILED: ${e.message.split('\n')[0]}`)
  await page.screenshot({ path: join(SHOTS, 'failure.png'), fullPage: true }).catch(() => {})
  console.error(`failure screenshot: ${join(SHOTS, 'failure.png')}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
