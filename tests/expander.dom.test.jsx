// @vitest-environment jsdom
//
// Q4 — the accordion's grid-template-rows migration. The Expander slides open/closed by tweening
// its one grid row 0fr⇄1fr (index.css .expander rules), replacing the old measured max-height
// clamp. These tests pin the structure the CSS keys off — the grid wrapper class, the open-state
// modifier, the single row div, and the always-mounted content contract (dotDiagram.dom relies on
// closed sections staying queryable) — plus the index.css rules themselves (jsdom applies no
// stylesheets, so the source is the only place to assert them) and the two cross-module timing
// contracts hung off the .28s duration: it must fit inside the CODES_CLOSE_MS freeze window
// (lib/constants), and the GuideSection triangle must spin on the same calc so both finish
// together. The motion itself is layout-engine truth jsdom cannot see — verified on-device
// (uniform speed across panels of very different lengths, no end-of-close dead time).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Expander from '../src/components/Expander.jsx'
import { GuideSection } from '../src/components/GuidePage.jsx'
import { CODES_CLOSE_MS } from '../src/lib/constants.js'

afterEach(cleanup)

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'),
  'utf8',
)

describe('Expander structure (grid wrapper + row)', () => {
  it('closed: renders div.expander (no open modifier) wrapping a single row div, children mounted', () => {
    const { container } = render(
      <Expander open={false}>
        <p>panel body</p>
      </Expander>,
    )
    const wrapper = container.firstElementChild
    expect(wrapper.className).toBe('expander')
    expect(wrapper.children).toHaveLength(1)
    const row = wrapper.firstElementChild
    expect(row.tagName).toBe('DIV')
    // Always-mounted contract: closed content stays in the DOM (clipped by CSS, never unmounted).
    expect(row.textContent).toBe('panel body')
  })
  it('open: adds the expander-open modifier (the class the CSS tweens the row 0fr→1fr off)', () => {
    const { container } = render(
      <Expander open>
        <p>panel body</p>
      </Expander>,
    )
    expect(container.firstElementChild.className).toBe('expander expander-open')
  })
  it('toggling open flips ONLY the modifier class — the content node survives both directions', () => {
    const { container, rerender } = render(
      <Expander open={false}>
        <p>panel body</p>
      </Expander>,
    )
    const row = container.firstElementChild.firstElementChild
    const content = row.firstElementChild
    rerender(
      <Expander open>
        <p>panel body</p>
      </Expander>,
    )
    expect(container.firstElementChild.className).toBe('expander expander-open')
    expect(row.firstElementChild).toBe(content)
    rerender(
      <Expander open={false}>
        <p>panel body</p>
      </Expander>,
    )
    expect(container.firstElementChild.className).toBe('expander')
    expect(row.firstElementChild).toBe(content)
  })
})

describe('index.css expander rules (the styles the structure above keys into)', () => {
  it('the wrapper is a one-row grid — minmax(0,1fr) column, 0fr row, --motion-scale transition', () => {
    expect(css).toContain(
      '.expander{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:0fr;' +
        'transition:grid-template-rows calc(.28s * var(--motion-scale)) ease-in-out}',
    )
    expect(css).toContain('.expander-open{grid-template-rows:1fr}')
  })
  it('the row div clips (overflow:hidden) and can shrink below its content (min-height:0)', () => {
    expect(css).toContain('.expander>div{min-height:0;overflow:hidden}')
  })
  it('the max-height machinery is gone — no max-height or will-change in any expander rule', () => {
    const expanderRules = css.match(/^\.expander[^{]*\{[^}]*\}/gm) ?? []
    expect(expanderRules.length).toBeGreaterThanOrEqual(3)
    for (const rule of expanderRules) {
      expect(rule).not.toMatch(/max-height|will-change/)
    }
  })
})

describe('cross-module timing contracts on the .28s duration', () => {
  // The CSS-declared slide duration in ms, extracted from the .expander rule itself.
  const durationMs =
    parseFloat(css.match(/\.expander\{[^}]*transition:grid-template-rows calc\(([\d.]+)s \*/)[1]) *
    1000
  it('the close finishes inside the CODES_CLOSE_MS freeze window (codes panel contract)', () => {
    // MethodBreakdownSection holds its frozen inputs for CODES_CLOSE_MS after Hide Codes; the
    // slide must complete first or the panel's contents would change while still visible.
    expect(durationMs).toBeLessThan(CODES_CLOSE_MS)
  })
  it('the GuideSection triangle spins on the same duration calc, so both finish together', () => {
    const { container } = render(
      <GuideSection id="s" title="Section" openId={null} onToggle={() => {}}>
        <p>body</p>
      </GuideSection>,
    )
    const triangle = [...container.querySelectorAll('button span')].find(
      (s) => s.textContent === '▼',
    )
    const inline = triangle.getAttribute('style')
    const declared = parseFloat(inline.match(/transition-duration:\s*calc\(([\d.]+)s \*/)[1]) * 1000
    expect(inline).toContain('var(--motion-scale)')
    expect(declared).toBe(durationMs)
  })
})

describe('GuideSection wiring into the Expander', () => {
  it('an open section carries expander-open; a closed one does not', () => {
    const { container: openC } = render(
      <GuideSection id="s" title="Section" openId="s" onToggle={() => {}}>
        <p>body</p>
      </GuideSection>,
    )
    expect(openC.querySelector('.expander').classList.contains('expander-open')).toBe(true)
    const { container: closedC } = render(
      <GuideSection id="s" title="Section" openId={null} onToggle={() => {}}>
        <p>body</p>
      </GuideSection>,
    )
    expect(closedC.querySelector('.expander').classList.contains('expander-open')).toBe(false)
  })
})
