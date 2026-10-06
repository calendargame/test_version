// @vitest-environment jsdom
//
// THE DASHED OUTLINE — "these numbers are for this session only" (Amnesic).
//
// What is temporary is marked on the page itself (it replaced an "A" beside the preset's name):
//
//                      stats strip      Best readouts (MoX, Blitz)
//   Off                plain            plain
//   Stats Only         DASHED           plain   — they are being kept
//   Full               DASHED           DASHED
//   …with Save Stats off, the strip is DIMMED and never dashed (nothing is being recorded at all,
//   so there are no numbers on it to mark); the Best readouts keep theirs on Full.
//
// This file pins that table in every mode, the words that say the same thing to a screen reader,
// and — as far as a test without a layout engine can — that the outline cannot move a pixel.
// ⚠ WHAT IT CANNOT SEE: jsdom lays nothing out and paints nothing. That the outline looks calm and
// unmistakable in all five themes, and that the strip and the readouts measure the same with it as
// without, were checked in a real browser at 390×844 (the round's gate); what is pinned here is the
// STRUCTURE those results rest on: which element carries the class, and that the class's rules
// declare nothing that takes part in layout.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import StatPanel from '../src/components/StatPanel.jsx'
import BestReadout from '../src/components/BestReadout.jsx'
import { setPresetAmnesic, createPreset, switchPreset } from '../src/store/presetControl.js'
import { useSettings } from '../src/store/settings.js'
import { useModePrefs } from '../src/store/modePrefs.js'
import { resetAppState, mountApp, tap } from './helpers/settingsPanel.jsx'

const STRIP_WORDS = 'These stats are for this session only'
const BEST_WORDS = 'Bests are for this session only'
const DIM_WORDS = 'Stats are not being saved'

const isHidden = (el) => {
  for (let n = el; n; n = n.parentElement) if (n.style && n.style.display === 'none') return true
  return false
}
// THE VISIBLE strip (all five mode screens stay mounted): found from its value spans up, never by
// the class under test.
const strip = () => {
  const value = [...document.querySelectorAll('[data-statval]')].find((el) => !isHidden(el))
  return value.closest('.panel')
}
// THE VISIBLE Best readout — the row that holds a "Best …:" label — or null in a mode without one.
const bestReadout = () => {
  const label = [...document.querySelectorAll('div')].find(
    (el) => !isHidden(el) && /^s*Best (Score|Mean):/.test(el.firstChild?.nodeValue ?? ''),
  )
  if (!label) return null
  for (let n = label; n; n = n.parentElement) if (/(^|\s)mt-3(\s|$)/.test(n.className)) return n
  throw new Error('a Best label with no readout row round it')
}
const dashed = (el) => el.classList.contains('session-only')
const says = (el, words) =>
  [...el.querySelectorAll('.sr-only')].some((s) => s.textContent === words)
const press = (key) => act(() => fireEvent.keyDown(window, { key }))
const setAmnesic = (mode) => act(() => setPresetAmnesic(1, mode))
const unmount = () => {
  cleanup()
  document.getElementById('root')?.remove()
}

// Each mode's screen, and how to get to it (its keyboard letter). Blitz has three Best readouts —
// one per sub-mode — and each is its own markup, so each is a row here.
const SCREENS = [
  { name: 'Classic', go: () => press('K'), hasBests: false },
  { name: 'Deduction', go: () => press('D'), hasBests: false },
  { name: 'Flash', go: () => press('F'), hasBests: false },
  { name: 'MoX', go: () => press('A'), hasBests: true },
  { name: 'Blitz, Per Round', go: () => press('B'), hasBests: true },
  {
    name: 'Blitz, Per Question + Allow Mistakes',
    go: () => {
      act(() => useModePrefs.getState().setBlitzPerQ(true))
      press('B')
    },
    hasBests: true,
  },
  {
    name: 'Blitz, Per Question sudden death',
    go: () => {
      act(() => {
        useModePrefs.getState().setBlitzPerQ(true)
        useModePrefs.getState().setBlitzAllowMistakes(false)
      })
      press('B')
    },
    hasBests: true,
  },
]

describe('the dashed outline, mode by mode and value by value', () => {
  beforeEach(() => resetAppState())
  afterEach(unmount)

  for (const { name, go, hasBests } of SCREENS)
    it(`${name}: the strip is dashed on Stats Only and Full; the Bests only on Full`, () => {
      mountApp()
      go()
      expect(bestReadout() !== null).toBe(hasBests) // the row under test is really on this screen

      const seen = {}
      for (const mode of ['off', 'stats', 'full', 'off']) {
        setAmnesic(mode)
        seen[mode] = {
          strip: dashed(strip()),
          stripSays: says(strip(), STRIP_WORDS),
          bests: hasBests ? dashed(bestReadout()) : null,
          bestsSay: hasBests ? says(bestReadout(), BEST_WORDS) : null,
        }
      }
      const none = hasBests ? false : null
      expect(seen).toEqual({
        off: { strip: false, stripSays: false, bests: none, bestsSay: none },
        stats: { strip: true, stripSays: true, bests: none, bestsSay: none },
        full: {
          strip: true,
          stripSays: true,
          bests: hasBests ? true : null,
          bestsSay: hasBests ? true : null,
        },
      })
    })

  // ★ NOTHING IS RECORDED AT ALL with Save Stats off, so the dim is the whole truth about the strip
  // and the outline stands down — one cue, never two stacked. The Best readouts still show real
  // records, and on Full those are still the session's.
  for (const mode of ['stats', 'full'])
    it(`${mode} with Save Stats off: the strip is dimmed and NOT dashed; the dim's own words are the ones said`, () => {
      mountApp()
      press('B')
      setAmnesic(mode)
      expect(dashed(strip())).toBe(true)
      act(() => useSettings.getState().setSaveStats(false))
      expect(dashed(strip())).toBe(false)
      expect(strip().className).toContain('opacity-50')
      expect(says(strip(), DIM_WORDS)).toBe(true)
      expect(says(strip(), STRIP_WORDS)).toBe(false)
      expect(dashed(bestReadout())).toBe(mode === 'full')
      // …and it comes straight back with Save Stats.
      act(() => useSettings.getState().setSaveStats(true))
      expect(dashed(strip())).toBe(true)
      expect(says(strip(), DIM_WORDS)).toBe(false)
    })

  it('it follows the preset you are on, not the one you left', () => {
    mountApp()
    let p2
    act(() => {
      p2 = createPreset('Guest')
      setPresetAmnesic(p2.id, 'full')
    })
    press('B')
    expect([dashed(strip()), dashed(bestReadout())]).toEqual([false, false])
    act(() => switchPreset(p2.id))
    press('B')
    expect([dashed(strip()), dashed(bestReadout())]).toEqual([true, true])
    act(() => switchPreset(1))
    press('B')
    expect([dashed(strip()), dashed(bestReadout())]).toEqual([false, false])
  })

  // When a round has ended the whole strip is ONE BUTTON, whose aria-label replaces its content as
  // its name — so the words have to reach a screen reader as the button's DESCRIPTION.
  it('an ended round’s strip — one button — is described by the words, not just holding them', () => {
    mountApp()
    press('B')
    setAmnesic('stats')
    tap(screen.getByRole('button', { name: 'Begin' }))
    tap(screen.getByRole('button', { name: 'Reveal' })) // ends the round: 0 of 1
    const button = screen.getByRole('button', { name: 'Show round breakdown' })
    expect(button).toBe(strip())
    expect(dashed(button)).toBe(true)
    const described = document.getElementById(button.getAttribute('aria-describedby'))
    expect(described.textContent).toBe(STRIP_WORDS)
    expect(button.contains(described)).toBe(true)
  })
})

// ── The two components on their own ───────────────────────────────────────────────────────────
describe('the outline costs no layout', () => {
  beforeEach(() => resetAppState())
  afterEach(cleanup)

  const STATS = [
    { label: 'Score', value: '3/4' },
    { label: 'Accuracy', value: '75%' },
  ]
  // Everything about an element that could size or place it, as jsdom can see it: its tag, its
  // class list with the two outline classes set aside, and its children that are in the flow.
  const shape = (el) => ({
    tag: el.tagName,
    classes: [...el.classList].filter((c) => !c.startsWith('session-only')).sort(),
    inFlow: [...el.children]
      .filter((c) => !c.classList.contains('sr-only'))
      .map((c) => c.outerHTML),
  })

  it('the strip is the same element, classes and cells with the outline as without', () => {
    const plain = shape(render(<StatPanel stats={STATS} dimmed={false} />).container.firstChild)
    cleanup()
    act(() => setPresetAmnesic(1, 'stats'))
    const root = render(<StatPanel stats={STATS} dimmed={false} />).container.firstChild
    expect(dashed(root)).toBe(true)
    expect(shape(root)).toEqual(plain)
    // The only thing added is positioned out of the flow.
    const added = [...root.children].filter((c) => c.classList.contains('sr-only'))
    expect(added.map((c) => c.textContent)).toEqual([STRIP_WORDS])
  })

  it('a Best readout is the same element, classes and content with the outline as without', () => {
    const row = (
      <BestReadout>
        <div>Best Score: 12</div>
      </BestReadout>
    )
    const plain = shape(render(row).container.firstChild)
    cleanup()
    act(() => setPresetAmnesic(1, 'full'))
    const root = render(row).container.firstChild
    expect(dashed(root)).toBe(true)
    expect(shape(root)).toEqual(plain)
    cleanup()
    act(() => setPresetAmnesic(1, 'stats')) // kept on Stats Only: no outline
    expect(dashed(render(row).container.firstChild)).toBe(false)
  })

  // ★ THE RULES THEMSELVES. The frame is a ::after box positioned out of the flow; the host gains
  // `position:relative` and nothing else, and on a .panel only the border's COLOUR changes. Nothing
  // here may declare a width, a padding, a margin, a border-width or an outline on the host.
  it('the class’s rules declare nothing that takes part in layout', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const rule = (selector) => {
      const at = css.indexOf(`\n${selector}{`)
      expect(at, selector).toBeGreaterThan(-1)
      return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
    }
    expect(rule('.session-only')).toBe('position:relative')
    expect(rule('.panel.session-only')).toBe('border-color:transparent')
    const frame = Object.fromEntries(
      rule('.session-only::after')
        .split(';')
        .map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]),
    )
    expect(frame.position).toBe('absolute') // out of the flow: it cannot push anything
    expect(frame['pointer-events']).toBe('none') // and it never takes a tap meant for the strip
    expect(frame.border).toMatch(/dashed/) // dashed — the keyboard's focus ring is solid
    expect(frame['border-radius']).toBe('inherit')
    // The readouts' frame is drawn AROUND the row, in the gaps already there.
    expect(rule('.session-only-outset::after')).toMatch(/^inset:-/)
    // …and every rule with the class in its selector is one of the four above.
    const selectors = [...css.matchAll(/\n([^\n{}]*session-only[^\n{}]*)\{/g)].map((m) => m[1])
    expect(selectors.sort()).toEqual(
      [
        '.panel.session-only',
        '.session-only',
        '.session-only-outset::after',
        '.session-only::after',
      ].sort(),
    )
  })
})
