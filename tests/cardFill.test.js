// tests/cardFill.test.js — THE CARD FILL IS SOLID, IN EVERY THEME.
//
// `.card` is the surface of the ⚙ menu and of every popup card, and --card-bg is its fill. It was a
// few percent see-through for the app's whole life, which let the page ghost through the ⚙ menu and
// the ⚙ menu ghost through a popup; the owner had it made solid. A solid fill is one character away
// from a see-through one (an `a` after `rgb`, two more hex digits), and nothing else in the suite
// looks at a colour's alpha, so this file does.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// The DECLARATIONS only — index.css's comments quote the rules they explain.
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

const themeRows = [...css.matchAll(/(:root|\[data-theme="(\w+)"\])\{([^}]*)\}/g)]
  .map((m) => ({ theme: m[2] ?? 'default', body: m[3] }))
  .filter((r) => r.body.includes('--panel-bg:'))

describe('index.css — the card fill', () => {
  it('every theme row sets it (the default row and the four named themes that restyle it)', () => {
    expect(themeRows.map((r) => r.theme).sort()).toEqual(
      ['default', 'dusk', 'light', 'midnight', 'parchment'].sort(),
    )
    for (const r of themeRows) expect(r.body, r.theme).toMatch(/--card-bg:/)
  })

  it('is a six-digit hex colour everywhere — a form that cannot carry alpha', () => {
    const fills = [...css.matchAll(/--card-bg:([^;}]+)/g)].map((m) => m[1].trim())
    expect(fills).toHaveLength(themeRows.length)
    for (const fill of fills) expect(fill).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('is what .card paints, with nothing layered into the declaration', () => {
    expect(css).toMatch(/\.card\{background:var\(--card-bg\);/)
  })
})
