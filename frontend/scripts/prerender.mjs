// After `vite build`: render the public pages to plain HTML (see src/prerender.tsx), each with
// the app's own scripts, so it still turns into the normal app once JavaScript runs.
// - privacy, terms → dist/<name>.html (Caddy: try_files {path}.html)
// - home → dist/index.html itself (Caddy serves it for / and as every other route's fallback;
//   the inline script in index.html empties it there and for logged-in visitors)
import { readFile, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

const outDir = 'dist-ssr'
await build({
  logLevel: 'warn',
  build: { ssr: 'src/prerender.tsx', outDir, emptyOutDir: true },
})
const { pages, render } = await import(pathToFileURL(`${outDir}/prerender.js`).href)

// Read the empty shell once, before index.html itself is overwritten with the home page.
const shell = await readFile('dist/index.html', 'utf8')
if (!shell.includes('<div id="root"></div>')) throw new Error('dist/index.html has no empty root')
for (const name of Object.keys(pages)) {
  const file = name === 'home' ? 'dist/index.html' : `dist/${name}.html`
  const html = shell
    .replace('<div id="root"></div>', `<div id="root">${render(name)}</div>`)
    .replace(/<title>.*<\/title>/, `<title>${pages[name].title}</title>`)
  await writeFile(file, html)
  console.log(`prerendered ${file}`)
}
await rm(outDir, { recursive: true })
