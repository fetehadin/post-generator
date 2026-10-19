// Prototype helpers: theme switch (light → dark → mixed) and a shared icon sprite.
// ?theme=dark in the URL wins (used for screenshots); otherwise the last choice is kept.

const THEMES = ['light', 'dark', 'mixed']
const LABEL = { light: 'Light', dark: 'Dark', mixed: 'Mixed' }

function currentTheme() {
  const fromUrl = new URLSearchParams(location.search).get('theme')
  if (THEMES.includes(fromUrl)) return fromUrl
  try {
    const saved = localStorage.getItem('voxlace-theme')
    if (THEMES.includes(saved)) return saved
  } catch {}
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
    b.setAttribute('aria-label', `Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}`)
    b.title = b.getAttribute('aria-label')
    b.querySelector('use')?.setAttribute('href', `#i-theme-${theme}`)
  })
}

applyTheme(currentTheme())

const P = (d) => `<path d="${d}"/>`
const ICONS = {
  today: P('M4 6h16M4 12h10M4 18h7') + P('M17 15l3 3-3 3'),
  drafts: P('M7 3h8l4 4v14H7z') + P('M15 3v4h4') + P('M10 12h6M10 16h6'),
  calendar: P('M4 6h16v15H4z') + P('M4 10h16M9 3v4M15 3v4'),
  voice: P('M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2'),
  settings: P('M4 7h10M18 7h2M4 17h4M12 17h8') + '<circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  back: P('M15 6l-6 6 6 6'),
  sparkle: P('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'),
  history: P('M3 12a9 9 0 1 0 3-6.7L3 8') + P('M3 3v5h5M12 7v5l3 2'),
  check: P('M5 12l5 5 9-10'),
  send: P('M12 19V5M6 11l6-6 6 6'),
  pin: P('M9 4h6l-1 6 3 3H7l3-3zM12 13v7'),
  hide: P('M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.6M6.1 7.5A15 15 0 0 0 3 12s4 6 9 6a8.9 8.9 0 0 0 3.5-.7'),
  clock: '<circle cx="12" cy="12" r="9"/>' + P('M12 7v5l3 2'),
  plus: P('M12 5v14M5 12h14'),
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  layers: P('M12 3l9 5-9 5-9-5zM3 13l9 5 9-5'),
  quote: P('M7 7h4v4c0 3-2 5-4 6M14 7h4v4c0 3-2 5-4 6'),
  alert: P('M12 3l10 18H2z') + P('M12 10v5M12 18v.5'),
  trash: P('M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14'),
  'theme-light': '<circle cx="12" cy="12" r="4"/>' + P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
  'theme-dark': P('M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z'),
  'theme-mixed': '<circle cx="12" cy="12" r="8"/>' + '<path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
}

const sprite = Object.entries(ICONS)
  .map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`)
  .join('')
document.body.insertAdjacentHTML(
  'afterbegin',
  `<svg aria-hidden="true" style="display:none">${sprite}</svg>`,
)
applyTheme(document.documentElement.dataset.theme)

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-theme-toggle]')
  if (!btn) return
  const theme = document.documentElement.dataset.theme
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
  try {
    localStorage.setItem('voxlace-theme', next)
  } catch {}
  applyTheme(next)
})

// One sidebar and one mobile tab bar for every page: <div data-sidebar="today"></div>.
const NAV = [
  ['today', 'Today', 'today.html'],
  ['drafts', 'Drafts', 'editor.html'],
  ['calendar', 'Calendar', '#'],
  ['voice', 'Voice', '#'],
]
document.querySelectorAll('[data-sidebar]').forEach((slot) => {
  const current = slot.dataset.sidebar
  const items = NAV.map(
    ([id, label, href]) =>
      `<a class="nav__item" href="${href}"${id === current ? ' aria-current="page"' : ''}><svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg><span class="nav__label">${label}</span></a>`,
  ).join('')
  slot.outerHTML = `
  <aside class="sidebar"><div class="sidebar__card">
    <div class="brand"><a class="brand__name" href="today.html"><span class="brand__mark" aria-hidden="true"><svg class="icon"><use href="#i-check"/></svg></span><span>Voxlace</span></a></div>
    <a class="btn sidebar__new" href="today.html" aria-label="New post"><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>New post</span></a>
    <nav class="nav" aria-label="Main">${items}</nav>
    <details class="account">
      <summary aria-label="Account and settings"><span class="avatar" aria-hidden="true">F</span><span class="account__name">Fetehadin<small>Free plan</small></span></summary>
      <ul class="menu">
        <li><a class="btn btn--quiet" href="#"><svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg>Settings</a></li>
        <li><button class="btn btn--quiet" type="button" data-theme-toggle><svg class="icon" aria-hidden="true"><use href="#i-theme-light"/></svg>Theme</button></li>
        <li><hr></li>
        <li class="meta">12 of 30 drafts used today</li>
      </ul>
    </details>
  </div></aside>`
  document.querySelectorAll('[data-mobile-account]').forEach((m) => {
    m.outerHTML = `<details class="mobile-account mobile-only">
      <summary aria-label="Account and settings"><span class="avatar" aria-hidden="true">F</span></summary>
      <ul class="menu">
        <li><a class="btn btn--quiet" href="#">Settings</a></li>
        <li><button class="btn btn--quiet" type="button" data-theme-toggle>Theme</button></li>
        <li><hr></li>
        <li class="meta">12 of 30 drafts used today</li>
      </ul></details>`
  })
  document.body.insertAdjacentHTML(
    'beforeend',
    `<nav class="tabbar" aria-label="Main">${NAV.map(
      ([id, label, href]) =>
        `<a href="${href}"${id === current ? ' aria-current="page"' : ''}><svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>${label}</a>`,
    ).join('')}</nav>`,
  )
})
applyTheme(document.documentElement.dataset.theme)

// Editor: Edit / Preview switch.
document.querySelectorAll('[data-view-switch] button').forEach((b) =>
  b.addEventListener('click', () => {
    const view = b.dataset.view
    document.querySelectorAll('[data-view-switch] button').forEach((o) =>
      o.setAttribute('aria-pressed', String(o.dataset.view === view)),
    )
    document.body.dataset.view = view
  }),
)

// A new draft placeholder scrolls into view when generation starts (§7).
document.fonts.ready.then(() =>
  document.querySelector('[data-scroll-into-view]')?.scrollIntoView({ block: 'end' }),
)
