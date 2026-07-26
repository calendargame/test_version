// @vitest-environment jsdom
//
// lookupCard.dom.test.jsx — LookupCard's BEHAVIOUR (round-8 Q2). The component had no behaviour
// test at all before this: scrollRegion.dom pins its geometry classes, progress.* pins the saved
// shape, but nothing described what the card actually does when you type into it.
//
// Two contracts are locked here.
//
// 1. The RESULT SLOT is always present, at a constant height, in every state. Before Q2 the
//    result line rendered only when there was a result, so the panel below it jumped by a line
//    the moment you pressed Lookup and jumped back when you pressed Clear. Now the slot always
//    exists: it shows the hint when there is nothing to say, and the answer or the error when
//    there is. (The HEIGHT is a class contract — jsdom lays nothing out — so the test asserts the
//    reserving class is on the node, plus that the node itself never disappears.)
//
// 2. The result sentence is DERIVED, never stored. The live bug this replaces: the history rows
//    re-rendered under the current Date Format while the result line above them kept the format
//    the lookup was made in, so the same date read two different ways on one screen. The
//    regression pin is the last test — an entry saved under one format renders its result in the
//    format that is live NOW.
//
// The card keeps all of its state in the parent, so these tests drive it through a small
// controlled host that wires the props to real state, exactly as App does.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as React from 'react'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import LookupCard from '../src/components/LookupCard.jsx'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'
import { fmt } from '../src/lib/format.js'

const HINT = 'Enter a date to see its weekday.'
const GAP = 'October 5–14, 1582 never existed — 10 days skipped in the Gregorian switch.'

// The controlled host: the same prop wiring App uses, with `lookupOutput` exposed so the tests can
// assert on it directly (isFullyReset in main.tsx reads it as "" to dim/lock Full Reset).
function Host({ dateFormat = 'written-mdy', useJulian = false, initialHistory = [] }) {
  const [history, setHistory] = React.useState(initialHistory)
  const [input, setInput] = React.useState('')
  const [output, setOutput] = React.useState('')
  const [calcDate, setCalcDate] = React.useState(null)
  const [selectedId, setSelectedId] = React.useState(null)
  const [calcOpen, setCalcOpen] = React.useState(false)
  const fmtDate = React.useCallback((y, m, d) => fmt(y, m, d, dateFormat), [dateFormat])
  return (
    <>
      <output data-testid="lookup-output">{output}</output>
      <LookupCard
        history={history}
        onAddHistory={(e) => setHistory((prev) => [e, ...prev].slice(0, 20))}
        onMoveHistory={(id) =>
          setHistory((prev) => {
            const i = prev.findIndex((e) => e.id === id)
            if (i <= 0) return prev
            return [prev[i], ...prev.slice(0, i), ...prev.slice(i + 1)]
          })
        }
        onClearHistory={() => setHistory([])}
        inputValue={input}
        onInputChange={setInput}
        outputValue={output}
        onOutputChange={setOutput}
        calcDate={calcDate}
        onCalcDateChange={setCalcDate}
        selectedHistoryId={selectedId}
        onSelectedHistoryIdChange={setSelectedId}
        calcOpen={calcOpen}
        onCalcOpenChange={setCalcOpen}
        fmtDate={fmtDate}
        dateFormat={dateFormat}
        useJulian={useJulian}
      />
    </>
  )
}

// The slot is the only min-h-10 node in the card — found by class so the test doesn't depend on
// which of its several possible strings is currently showing.
const slot = (container) => container.querySelector('.min-h-10')
const lookup = (container, text) => {
  fireEvent.change(container.querySelector('input'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Lookup' }))
}

describe('Lookup result slot — always rendered, constant height (round-8 Q2)', () => {
  afterEach(cleanup)

  it('a fresh card shows the hint, in the dimmer tone, in a two-line slot', () => {
    const { container } = render(<Host />)
    const node = slot(container)
    expect(node).not.toBeNull()
    expect(node.textContent).toBe(HINT)
    expect(node.className).toContain('min-h-10') // 2.5rem = two text-sm lines, fluid-root-scaled
    expect(node.className).toContain('text-(--tx-200-70)') // hint tone, not answer tone
  })

  it('an answer replaces the hint and takes the brighter answer tone', () => {
    const { container } = render(<Host dateFormat="numeric-mdy" />)
    lookup(container, '7/4/1776')
    const node = slot(container)
    expect(node.textContent).toBe('7/4/1776 is a Thursday.')
    expect(node.className).toContain('text-(--tx-100-90)')
  })

  it('every error family lands in the SAME slot node — the card never changes height', () => {
    const { container } = render(<Host dateFormat="numeric-mdy" />)
    const node = slot(container)
    lookup(container, 'not a date')
    expect(slot(container)).toBe(node)
    expect(node.textContent).toBe('Enter date as m/d/y, e.g. 3/14/1592')
    lookup(container, '7/4/99999')
    expect(node.textContent).toBe('Year must be between 1 and 10000')
    lookup(container, '13/4/1776')
    expect(node.textContent).toBe('Month must be 1–12')
    lookup(container, '2/30/1776')
    expect(node.textContent).toBe('Day must be 1–29 for February')
    expect(slot(container)).toBe(node) // same node throughout: nothing was mounted or unmounted
  })

  it('Clear restores the hint (and Clear History does too)', () => {
    const { container } = render(<Host dateFormat="numeric-mdy" />)
    lookup(container, '7/4/1776')
    expect(slot(container).textContent).toBe('7/4/1776 is a Thursday.')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(slot(container).textContent).toBe(HINT)
    lookup(container, '7/4/1776')
    fireEvent.click(screen.getByRole('button', { name: 'Clear History' }))
    expect(slot(container).textContent).toBe(HINT)
    expect(screen.getByText('No lookups yet')).toBeTruthy()
  })

  // The HARD constraint from Q2: the hint is a render-time fallback, never state. main.tsx
  // computes isFullyReset from lookupOutput === "" — if the hint were ever written into that
  // state, the Full Reset button would silently unlock on a brand-new, untouched app.
  it('lookupOutput stays "" while the hint shows, and while an ANSWER shows', () => {
    const { container } = render(<Host dateFormat="numeric-mdy" />)
    const out = screen.getByTestId('lookup-output')
    expect(slot(container).textContent).toBe(HINT)
    expect(out.textContent).toBe('') // fresh card: isFullyReset still holds
    lookup(container, '7/4/1776')
    expect(out.textContent).toBe('') // the answer is derived from the selection, not stored
    lookup(container, 'not a date')
    expect(out.textContent).toBe('Enter date as m/d/y, e.g. 3/14/1592') // errors DO live there
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(out.textContent).toBe('')
  })
})

describe('Lookup — the Oct 5–14, 1582 gap (round-8 Q2)', () => {
  afterEach(cleanup)

  it('answers with the short message; the long version lives in the How-to-Play guide', () => {
    const { container } = render(<Host dateFormat="numeric-mdy" />)
    lookup(container, '10/10/1582')
    expect(slot(container).textContent).toBe(GAP)
    expect(screen.getByText('Does Not Exist')).toBeTruthy() // the history row's weekday column
  })

  it('re-looking-up a gap date replays the same message from history', () => {
    const { container } = render(<Host dateFormat="numeric-mdy" />)
    lookup(container, '10/10/1582')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(slot(container).textContent).toBe(HINT)
    lookup(container, '10/10/1582')
    expect(slot(container).textContent).toBe(GAP)
    expect(screen.getAllByText('Does Not Exist')).toHaveLength(1) // replayed, not duplicated
  })
})

describe('Lookup — the result sentence is derived, not stored (round-8 Q2 regression pin)', () => {
  afterEach(cleanup)

  // THE bug: an entry saved under one Date Format kept its rendered sentence, so after the user
  // switched formats the result line read the old way while the history row right below it read
  // the new way. Both come from {y,m,d} now, so both follow the live setting.
  it('an entry stored under one Date Format renders its result in the CURRENT format', () => {
    const stored = { id: 'e1', y: 1776, m: 7, d: 4 }
    const { container } = render(
      <Host dateFormat="written-mdy" initialHistory={[stored]} useJulian={false} />,
    )
    // Select it from history: the sentence is built now, in the format that is live now.
    fireEvent.click(container.querySelector('ul button'))
    expect(slot(container).textContent).toBe('July 4, 1776 is a Thursday.')

    cleanup()
    // Same stored entry, different live format — same date, re-rendered, no stale copy anywhere.
    const second = render(<Host dateFormat="numeric-dmy" initialHistory={[stored]} />)
    fireEvent.click(second.container.querySelector('ul button'))
    expect(slot(second.container).textContent).toBe('4.7.1776 is a Thursday.')
    expect(second.container.querySelector('ul button').textContent).toContain('4.7.1776')
  })

  // The pin above proves derivation across two MOUNTS. This one changes the format on a LIVE
  // mount, which is the only path a user can actually take — and the one that was broken: the
  // format-change effect cleared the selection, so the answer line did not update, it VANISHED
  // back to the hint. Both the changelog and the How-to-Play guide promise that "changing the
  // Date Format updates the answer line and the whole list together", so this is that sentence,
  // executable.
  it('changing the Date Format on a LIVE card updates the answer line — it does not clear it', () => {
    const stored = { id: 'e1', y: 1776, m: 7, d: 4 }
    const { container, rerender } = render(
      <Host dateFormat="written-mdy" initialHistory={[stored]} />,
    )
    fireEvent.click(container.querySelector('ul button'))
    expect(slot(container).textContent).toBe('July 4, 1776 is a Thursday.')

    act(() => {
      rerender(<Host dateFormat="numeric-dmy" initialHistory={[stored]} />)
    })
    expect(slot(container).textContent).toBe('4.7.1776 is a Thursday.') // updated, not cleared
    expect(container.querySelector('ul button').textContent).toContain('4.7.1776') // together
    // The input is always NUMERIC, and its separator and field order just changed, so it is
    // rewritten in place rather than emptied — the box still holds the date you are looking at.
    expect(container.querySelector('input').value).toBe('4.7.1776')
  })

  // The other half of the same rule: with nothing selected there is no date to re-render, and a
  // half-typed value in the old format would not parse — so that, and only that, is cleared.
  it('with nothing selected, a Date Format change clears the typed input and any error', () => {
    const { container, rerender } = render(<Host dateFormat="written-mdy" />)
    lookup(container, 'nonsense')
    expect(slot(container).textContent).toContain('Enter date as')
    expect(container.querySelector('input').value).toBe('nonsense')

    act(() => {
      rerender(<Host dateFormat="numeric-dmy" />)
    })
    expect(container.querySelector('input').value).toBe('')
    expect(slot(container).textContent).toBe(HINT) // the stale error named the old format
  })

  it('a Julian-eligible date names the calendar it was read under, live from the setting', () => {
    const stored = { id: 'e1', y: 1500, m: 3, d: 1 }
    const greg = render(<Host dateFormat="numeric-mdy" initialHistory={[stored]} />)
    fireEvent.click(greg.container.querySelector('ul button'))
    expect(slot(greg.container).textContent).toBe('3/1/1500 is a Thursday (Gregorian).')
    cleanup()

    const jul = render(<Host dateFormat="numeric-mdy" initialHistory={[stored]} useJulian />)
    fireEvent.click(jul.container.querySelector('ul button'))
    expect(slot(jul.container).textContent).toBe('3/1/1500 is a Sunday (Julian).')
    // …and the history row's weekday column agrees with the sentence above it.
    expect(jul.container.querySelector('ul button').textContent).toContain('Sunday')
  })
})

// ── The isFullyReset contract, at App level (round-8 Q2) ─────────────────────────────────────
// The Full Reset footer button is dimmed and locked exactly while the whole app sits at launch
// state, and App reads `lookupOutput === ""` as one of the terms. Q2 changed who writes that
// state: a successful lookup used to store its result sentence there and now stores nothing (the
// sentence is derived from the selected history entry). This test is the direct consequence pin —
// a real lookup must still light Full Reset, through the OTHER Lookup terms (history, input,
// selection, calcDate) — and it fails if a later change ever writes the hint string into that
// state, which would unlock Full Reset on an untouched app. Pristine settings, no overrides, so
// isFullyReset can actually be true. Mirrors the C3a freshness pin in blitz.dom.
const mountApp = () => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}
const isDisabled = (btn) => btn.className.includes('pointer-events-none')

describe('Lookup — Full Reset freshness (isFullyReset reads lookupOutput)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  // isFullyReset also requires the launch mode, so every check below is made from Classic — which
  // is the honest question anyway: after a trip through Lookup, is the app back at launch state?
  const fullReset = () => screen.getByRole('button', { name: /Full Reset/ })
  const toggleSettings = () =>
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))

  it('visiting Lookup and reading the hint leaves nothing behind — Full Reset stays dimmed', () => {
    mountApp()
    act(() => fireEvent.keyDown(window, { key: 'L' })) // to Lookup
    expect(screen.getByText(HINT)).toBeTruthy() // the hint IS on screen…
    act(() => fireEvent.keyDown(window, { key: 'K' })) // …back to Classic
    toggleSettings()
    expect(isDisabled(fullReset())).toBe(true) // …and it was only ever text
  })

  it('a real lookup lights Full Reset; Clear + Clear History dim it again', () => {
    mountApp()
    act(() => fireEvent.keyDown(window, { key: 'L' }))
    const input = document.querySelector('input[placeholder^="e.g.,"]')
    // The input takes the numeric form of the live Date Format; the ANSWER comes back written.
    act(() => fireEvent.change(input, { target: { value: '7/4/1776' } }))
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Lookup' })))
    expect(screen.getByText('July 4, 1776 is a Thursday.')).toBeTruthy()
    act(() => fireEvent.keyDown(window, { key: 'K' }))
    toggleSettings()
    expect(isDisabled(fullReset())).toBe(false) // the lookup registered, without lookupOutput
    toggleSettings() // close the panel
    act(() => fireEvent.keyDown(window, { key: 'L' }))
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Clear' })))
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Clear History' })))
    expect(screen.getByText(HINT)).toBeTruthy()
    act(() => fireEvent.keyDown(window, { key: 'K' }))
    toggleSettings()
    expect(isDisabled(fullReset())).toBe(true)
  })
})
