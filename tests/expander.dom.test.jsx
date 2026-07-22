// @vitest-environment jsdom
//
// Q4 — the accordion's grid-template-rows migration; Q8 (round 7) — the motion clock split.
// The Expander slides open/closed by tweening its one grid row 0fr⇄1fr (index.css .expander
// rules), replacing the old measured max-height clamp. Q8 moved the duration onto the
// --expander-ms var (a per-toggle value the guide's coordinator stamps via the new Expander
// durationMs prop; every non-opted panel keeps the .28s fallback) and unified the easing on
// the Material standard curve (ACCORDION_EASE_CSS, lib/accordionMotion). These tests pin the
// structure the CSS keys off — the grid wrapper class, the open-state modifier, the single
// row div, and the always-mounted content contract (dotDiagram.dom relies on closed sections
// staying queryable) — plus the index.css rules themselves (jsdom applies no stylesheets, so
// the source is the only place to assert them), the cross-module timing contracts hung off
// the DEFAULT duration (it must fit inside the CODES_CLOSE_MS freeze window, and the
// GuideSection triangle must run the same var, fallback, and curve so all finish together),
// the aria-expanded/aria-controls accordion contract, and the coordinator's shared clock
// (one --expander-ms per toggle, stamped on every section). The motion itself is
// layout-engine truth jsdom cannot see — verified on-device (distance-scaled speed across
// panels of very different lengths, the scroll riding the panels' own clock).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Expander from '../src/components/Expander.jsx'
import GuidePage, { GuideSection } from '../src/components/GuidePage.jsx'
import { ACCORDION_EASE_CSS } from '../src/lib/accordionMotion.js'
import { CODES_CLOSE_MS } from '../src/lib/constants.js'

afterEach(cleanup)

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css'),
  'utf8',
)

// The curve with whitespace/serialization noise removed — jsdom's CSSOM may reformat an
// inline cubic-bezier (spaces, leading zeros), and only the numbers are the contract.
const normalizeEase = (s) => s.replace(/\s+/g, '').replace(/\b0\./g, '.')

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

describe('Expander durationMs prop (Q8 — the per-toggle --expander-ms clock)', () => {
  it('stamps the inline --expander-ms var when given', () => {
    const { container } = render(
      <Expander open durationMs={350}>
        <p>panel body</p>
      </Expander>,
    )
    expect(container.firstElementChild.style.getPropertyValue('--expander-ms')).toBe('350ms')
  })
  it('leaves the var unset without the prop, so the CSS .28s fallback governs (the codes panels)', () => {
    const { container } = render(
      <Expander open>
        <p>panel body</p>
      </Expander>,
    )
    expect(container.firstElementChild.style.getPropertyValue('--expander-ms')).toBe('')
  })
})

describe('index.css expander rules (the styles the structure above keys into)', () => {
  it('the wrapper is a one-row grid — minmax(0,1fr) column, 0fr row, var-clocked standard-curve transition', () => {
    expect(css).toContain(
      '.expander{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:0fr;' +
        `transition:grid-template-rows calc(var(--expander-ms,.28s) * var(--motion-scale)) ${ACCORDION_EASE_CSS}}`,
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
  it('the guide-scoped overflow-anchor kill pairs with the coordinator (no engine anchors against it)', () => {
    expect(css).toContain('html[data-doc-scroll] *{overflow-anchor:none}')
  })
})

describe('cross-module timing contracts on the default (.28s fallback) duration', () => {
  // The CSS-declared DEFAULT slide duration in ms — the --expander-ms fallback in the
  // .expander rule itself, which every panel without the durationMs prop runs at.
  const durationMs =
    parseFloat(
      css.match(
        /\.expander\{[^}]*transition:grid-template-rows calc\(var\(--expander-ms,([\d.]+)s\) \*/,
      )[1],
    ) * 1000
  it('the default close finishes inside the CODES_CLOSE_MS freeze window (codes panel contract)', () => {
    // MethodBreakdownSection holds its frozen inputs for CODES_CLOSE_MS after Hide Codes; the
    // slide must complete first or the panel's contents would change while still visible. The
    // codes panels never pass durationMs, so the fallback IS their close time.
    expect(durationMs).toBeLessThan(CODES_CLOSE_MS)
  })
  it('the GuideSection triangle runs the same var, the same fallback, and the same curve', () => {
    const { container } = render(
      <GuideSection id="s" title="Section" openId={null} onToggle={() => {}}>
        <p>body</p>
      </GuideSection>,
    )
    const triangle = [...container.querySelectorAll('button span')].find(
      (s) => s.textContent === '▼',
    )
    const inline = triangle.style.transitionDuration
    expect(inline).toContain('var(--motion-scale)')
    const fallback = parseFloat(inline.match(/var\(--expander-ms,\s*([\d.]+)s\)/)[1]) * 1000
    expect(fallback).toBe(durationMs)
    expect(normalizeEase(triangle.style.transitionTimingFunction)).toBe(
      normalizeEase(ACCORDION_EASE_CSS),
    )
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
  it('durationMs reaches BOTH consumers: the panel (via the Expander prop) and the chevron (via the button)', () => {
    const { container } = render(
      <GuideSection id="s" title="Section" openId={null} onToggle={() => {}} durationMs={329}>
        <p>body</p>
      </GuideSection>,
    )
    expect(container.querySelector('.expander').style.getPropertyValue('--expander-ms')).toBe(
      '329ms',
    )
    expect(container.querySelector('button').style.getPropertyValue('--expander-ms')).toBe('329ms')
  })
  it('null durationMs (pre-first-toggle) stamps nothing — the CSS fallback governs', () => {
    const { container } = render(
      <GuideSection id="s" title="Section" openId={null} onToggle={() => {}} durationMs={null}>
        <p>body</p>
      </GuideSection>,
    )
    expect(container.querySelector('.expander').style.getPropertyValue('--expander-ms')).toBe('')
    expect(container.querySelector('button').style.getPropertyValue('--expander-ms')).toBe('')
  })
})

describe('GuideSection accordion contract (Q8 — aria + coordinator landmarks)', () => {
  it('the header button announces state and points at the panel body it controls', () => {
    const { container } = render(
      <GuideSection id="overview" title="Section" openId={null} onToggle={() => {}}>
        <p>body</p>
      </GuideSection>,
    )
    const button = container.querySelector('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe('guide-panel-overview')
    const panel = document.getElementById('guide-panel-overview')
    expect(panel).not.toBeNull()
    expect(panel.textContent).toBe('body')
  })
  it('aria-expanded tracks the open state', () => {
    const { container } = render(
      <GuideSection id="overview" title="Section" openId="overview" onToggle={() => {}}>
        <p>body</p>
      </GuideSection>,
    )
    expect(container.querySelector('button').getAttribute('aria-expanded')).toBe('true')
  })
  it('the section wrapper carries the lookup id and the under-bar scroll margin', () => {
    const { container } = render(
      <GuideSection id="overview" title="Section" openId={null} onToggle={() => {}}>
        <p>body</p>
      </GuideSection>,
    )
    const wrapper = container.firstElementChild
    expect(wrapper.id).toBe('guide-sec-overview')
    expect(wrapper.classList.contains('scroll-mt-[calc(var(--bar-h)+8px)]')).toBe(true)
  })
})

describe('GuidePage toggle coordinator (Q8 — the shared clock, exclusive open)', () => {
  const headers = (container) => [...container.querySelectorAll('button[aria-controls]')]
  it('a toggle stamps ONE shared --expander-ms on every section and opens exactly the tapped one', () => {
    const { container } = render(<GuidePage />)
    const all = headers(container)
    fireEvent.click(all[0])
    // jsdom lays out at zero height, so the distance-scaled clock lands on its 240ms floor —
    // and the SAME value reaches every section (the twin-toggle shared-clock contract).
    for (const h of all) {
      expect(h.style.getPropertyValue('--expander-ms')).toBe('240ms')
    }
    expect(all[0].getAttribute('aria-expanded')).toBe('true')
    expect(all.filter((h) => h.getAttribute('aria-expanded') === 'true')).toHaveLength(1)
  })
  it('tapping another section switches the single open panel; re-tapping closes it', () => {
    const { container } = render(<GuidePage />)
    const all = headers(container)
    fireEvent.click(all[0])
    fireEvent.click(all[3])
    expect(all[0].getAttribute('aria-expanded')).toBe('false')
    expect(all[3].getAttribute('aria-expanded')).toBe('true')
    expect(all.filter((h) => h.getAttribute('aria-expanded') === 'true')).toHaveLength(1)
    fireEvent.click(all[3])
    expect(all.filter((h) => h.getAttribute('aria-expanded') === 'true')).toHaveLength(0)
  })
})
