// After `vite build`: render the public legal pages to dist/<name>.html (see src/prerender.tsx).
// Caddy serves /privacy from dist/privacy.html (try_files {path}.html), with the app's own
// scripts, so the page still turns into the normal app once JavaScript runs.
import { readFile, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

const outDir = 'dist-ssr'
await build({
  logLevel: 'warn',
  build: { ssr: 'src/prerender.tsx', outDir, emptyOutDir: true },
})
const { pages, render } = await import(pathToFileURL(`${outDir}/prerender.js`).href)

const shell = await readFile('dist/index.html', 'utf8')
if (!shell.includes('<div id="root"></div>')) throw new Error('dist/index.html has no empty root')
for (const name of Object.keys(pages)) {
  const html = shell
    .replace('<div id="root"></div>', `<div id="root">${render(name)}</div>`)
    .replace(/<title>.*<\/title>/, `<title>${pages[name].title}</title>`)
  await writeFile(`dist/${name}.html`, html)
  console.log(`prerendered dist/${name}.html`)
}
await rm(outDir, { recursive: true })
