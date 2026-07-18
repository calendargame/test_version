// @vitest-environment jsdom
//
// AoX mode — characterization tests (Stage C, Step 6, Step 5). AoX is the headline dedup: it
// has its OWN near-duplicate engine (timer / stats / Override / Back-Forward / Show Codes) plus
// a unique "average of N" (Ao-N) RUN layer — a run of N solves that completes on the Nth, fails
// on a mistake (when Allow Mistakes is off), tracks Best Average / Best Median per config, and
// supports One-by-One (date hidden until you reveal it). These lock TODAY's observable behavior
// before folding the common engine onto the shared useGameEngine. Written against the current
// <App/> (AoX already renders via AoxMode) as a black box, so they stay valid before AND after.
//
// Determinism: AoX answers are weekdays, exactly like Classic — read the shown date back and
// compute the correct weekday with the already-tested wday(), on a pinned Gregorian range +
// numeric-ymd format. Short runs (Ao2) make "complete the run" reachable in two clicks.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'
import { useProgress } from '../src/store/progress.js'
import { wday } from '../src/lib/calendar.js'
import { DAY } from '../src/lib/format.js'

// ── Harness ──────────────────────────────────────────────────────────────────
function mountApp() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}
function isHidden(el) {
  for (let n = el; n; n = n.parentElement) if (n.style && n.style.display === 'none') return true
  return false
}
const ctrl = (name) => screen.getByRole('button', { name })
const dayBtn = (name) => screen.getByRole('button', { name })
const isDisabled = (btn) => btn.className.includes('pointer-events-none')

function switchToAox() {
  act(() => {
    fireEvent.keyDown(window, { key: 'A' })
  })
}
function click(name) {
  act(() => {
    fireEvent.click(ctrl(name))
  })
}
// AoX date is the only VISIBLE numeric-ymd leaf div (other modes are display:none; AoX shows
// "—" when the date is hidden — idle / One-by-One-not-yet-revealed).
function readDate() {
  const els = Array.from(document.querySelectorAll('div')).filter(
    (e) => e.children.length === 0 && /^-?\d+-\d+-\d+$/.test(e.textContent.trim()) && !isHidden(e),
  )
  if (els.length !== 1)
    throw new Error(
      `expected one visible ymd date, found ${els.length}: ${els.map((e) => e.textContent)}`,
    )
  const [y, m, d] = els[0].textContent.trim().split('-').map(Number)
  return { y, m, d }
}
const correctName = ({ y, m, d }) => DAY[wday(y, m, d)]
const wrongName = ({ y, m, d }) => DAY[(wday(y, m, d) + 1) % 7]
function answerCorrect() {
  act(() => {
    fireEvent.click(dayBtn(correctName(readDate())))
  })
}
function answerWrong() {
  act(() => {
    fireEvent.click(dayBtn(wrongName(readDate())))
  })
}
// Stat value by visible label span (other modes' strips are display:none).
function statValue(label) {
  const labelSpan = Array.from(document.querySelectorAll('span')).find(
    (s) => s.textContent.trim() === label && !isHidden(s),
  )
  if (!labelSpan) throw new Error(`stat "${label}" not found`)
  const spans = labelSpan.parentElement.querySelectorAll('span')
  return spans[spans.length - 1].textContent.trim()
}
// Best Average / Best Median VALUE ("1.23s" or "—"). Picks the innermost "Best X:" line and
// extracts just the time, ignoring the new-best ★ and the sibling Median/Average sub-line.
function bestVal(which) {
  const els = Array.from(document.querySelectorAll('div')).filter(
    (e) => !isHidden(e) && e.textContent.trim().startsWith(`Best ${which}:`),
  )
  els.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)
  const m = els[0]?.textContent.match(/Best \w+:\s*(—|\d+\.\d{2}s)/)
  return m ? m[1] : null
}
// The Ao-N size input (the only visible text input in the AoX panel).
function setN(val) {
  const input = Array.from(document.querySelectorAll('input[type="text"]')).find(
    (i) => !isHidden(i),
  )
  act(() => {
    fireEvent.change(input, { target: { value: String(val) } })
    fireEvent.blur(input)
  })
}
const dayState = (name) => {
  const c = dayBtn(name).className
  if (c.includes('btn-correct-persist')) return 'correct'
  if (c.includes('btn-wrong-persist')) return 'wrong-latest'
  if (c.includes('btn-override-wrong')) return 'override-wrong'
  return 'idle'
}

function pin() {
  localStorage.clear()
  const s = useSettings.getState()
  s.resetSettings()
  s.setRandomFormat(false)
  s.setDateFormat('numeric-ymd')
  s.setMinY(1583)
  s.setMaxY(10000)
}

// ── Batch 1: a clean Ao2 run (Allow Mistakes off, default) ──────────────────────
describe('AoX — characterization (batch 1: a clean Ao2 run)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('idle: Begin shown, Score 0/0, date hidden, Best Average —', () => {
    mountApp()
    switchToAox()
    expect(ctrl('Begin')).toBeInTheDocument()
    expect(statValue('Score')).toBe('0/0')
    expect(bestVal('Average')).toBe('—')
    // Back/Forward/Reveal/Override all disabled in idle.
    expect(isDisabled(ctrl('<'))).toBe(true)
    expect(isDisabled(ctrl('Reveal'))).toBe(true)
    expect(isDisabled(ctrl('Override'))).toBe(true)
  })

  it('Begin reveals the date and arms the run (Reset shown)', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    expect(ctrl('Reset')).toBeInTheDocument()
    expect(readDate().y).toBeGreaterThanOrEqual(1583)
    expect(statValue('Score')).toBe('0/0')
  })

  it('first correct counts + advances; the Nth correct completes the run and records a Best', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect() // 1/1, advance to the 2nd question
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Streak')).toBe('1/1')
    expect(ctrl('Reset')).toBeInTheDocument() // still running
    answerCorrect() // 2/2 → run completes
    expect(statValue('Score')).toBe('2/2')
    expect(statValue('Streak')).toBe('2/2')
    // Run done: a Best Average is now recorded (a time, not —), and a solve time shows.
    expect(bestVal('Average')).toMatch(/^\d+\.\d{2}s$/)
    expect(statValue('Average')).toMatch(/^\d+\.\d{2}s$/)
  })

  it('Reset returns to idle (Score 0/0, Begin shown) but keeps the recorded Best', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect()
    answerCorrect() // run done, best recorded
    const best = bestVal('Average')
    expect(best).toMatch(/^\d+\.\d{2}s$/)
    click('Reset')
    expect(ctrl('Begin')).toBeInTheDocument()
    expect(statValue('Score')).toBe('0/0')
    expect(bestVal('Average')).toBe(best) // best value persists across Reset (same config)
  })
})

// ── Batch 2: mistakes — failed run vs Allow Mistakes ────────────────────────────
describe('AoX — characterization (batch 2: mistakes)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Allow Mistakes OFF: a wrong answer fails the run (locks, marks the correct day)', () => {
    mountApp()
    switchToAox()
    setN(3)
    click('Begin')
    const d = readDate()
    answerWrong() // wrong → run fails
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(dayState(correctName(d))).toBe('correct') // correct day revealed on fail
    expect(ctrl('Reset')).toBeInTheDocument()
    expect(isDisabled(dayBtn(correctName(d)))).toBe(true) // grid locked
  })

  it('Allow Mistakes ON: a wrong answer keeps the run going (retry on the same date)', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes') // toggle on (off by default)
    setN(3)
    click('Begin')
    const d = readDate()
    answerWrong() // counted, streak 0, still running
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(readDate()).toEqual(d) // same date — try again
    expect(ctrl('Reset')).toBeInTheDocument()
    // Now answer it right: no credit for the late-correct, but it advances.
    answerCorrect()
    expect(statValue('Score')).toBe('0/1')
    expect(readDate()).not.toEqual(d) // advanced
  })
})

// ── Batch 3: Override ───────────────────────────────────────────────────────────
describe('AoX — characterization (batch 3: Override)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Override after a first-try correct (retro-flip): undoes the credit (1/1 → 0/1)', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes') // on, so the run survives the flip instead of failing
    setN(3)
    click('Begin')
    answerCorrect() // 1/1, advance to a fresh live question
    expect(statValue('Score')).toBe('1/1')
    expect(isDisabled(ctrl('Override'))).toBe(false)
    click('Override') // retro-flip the just-credited entry to wrong
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
  })

  it('Override after a wrong (Allow Mistakes on): credits it and advances (0/1 → 1/1)', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes')
    setN(3)
    click('Begin')
    answerWrong() // 0/1, still running
    expect(statValue('Score')).toBe('0/1')
    expect(isDisabled(ctrl('Override'))).toBe(false)
    click('Override') // retroactive credit
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Streak')).toBe('1/1')
  })
})

// ── Batch 3b: Best rollback when an override undoes the run that set it ──────────
describe('AoX — characterization (batch 3b: Best rollback)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Override on a completed run undoes the last solve and rolls the Best Average back to —', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect()
    answerCorrect() // run done; Best Average recorded
    expect(bestVal('Average')).toMatch(/^\d+\.\d{2}s$/)
    expect(isDisabled(ctrl('Override'))).toBe(false) // the completing solve is reversible
    click('Override') // undo the last solve → its Best was this run's, so it rolls back
    expect(statValue('Score')).toBe('1/2') // one solve undone, both attempts still counted
    expect(bestVal('Average')).toBe('—') // Best rolled back (it was set by this now-undone run)
    expect(ctrl('Reset')).toBeInTheDocument() // run is over (failed) → locked
  })
})

// ── Batch 4: Back/Forward after a run ends ──────────────────────────────────────
describe('AoX — characterization (batch 4: Back/Forward review)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Back/Forward is locked during a run, available after it completes', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    expect(isDisabled(ctrl('<'))).toBe(true) // no browsing mid-run
    const q1 = readDate()
    answerCorrect() // 1/1, advance
    expect(isDisabled(ctrl('<'))).toBe(true) // still running → still locked
    answerCorrect() // 2/2, run done
    expect(isDisabled(ctrl('<'))).toBe(false) // now reviewable
    click('<') // back to the first question
    expect(readDate()).toEqual(q1)
    expect(screen.getByText('Q1')).toBeInTheDocument()
    click('>') // forward to the completed last question
    expect(isDisabled(ctrl('>'))).toBe(true)
  })
})

// ── Batch 5: One-by-One ─────────────────────────────────────────────────────────
describe('AoX — characterization (batch 5: One-by-One)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('One-by-One hides the date after the first question until Continue reveals it', () => {
    mountApp()
    switchToAox()
    click('One-by-One')
    setN(3)
    click('Begin')
    answerCorrect() // 1/1 → next question is hidden (One-by-One)
    expect(statValue('Score')).toBe('1/1')
    // Date hidden now → Continue is offered, and no visible ymd date is present.
    expect(ctrl('Continue')).toBeInTheDocument()
    const visibleYmd = Array.from(document.querySelectorAll('div')).filter(
      (e) =>
        e.children.length === 0 && /^-?\d+-\d+-\d+$/.test(e.textContent.trim()) && !isHidden(e),
    )
    expect(visibleYmd.length).toBe(0)
    click('Continue') // reveal the next date
    expect(readDate().y).toBeGreaterThanOrEqual(1583)
    answerCorrect()
    expect(statValue('Score')).toBe('2/2')
  })
})

// ── Batch 6: Reveal + Show Codes (both burn the question) ────────────────────────
describe('AoX — characterization (batch 6: Reveal + Show Codes)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Reveal (Allow Mistakes off) shows the answer, counts a miss, fails the run', () => {
    mountApp()
    switchToAox()
    setN(3)
    click('Begin')
    const d = readDate()
    click('Reveal')
    expect(dayState(correctName(d))).toBe('correct')
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(ctrl('Reset')).toBeInTheDocument() // failed → locked
  })

  it('Show Codes (Allow Mistakes on) counts a miss + reveals, run continues', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes')
    setN(3)
    click('Begin')
    const d = readDate()
    click('Show Codes')
    expect(statValue('Score')).toBe('0/1') // counted as a played miss
    expect(statValue('Streak')).toBe('0/0')
    expect(dayState(correctName(d))).toBe('correct')
    expect(ctrl('Hide Codes')).toBeInTheDocument() // panel open
  })

  // C2 Q4 + the reveal-flash refinement: Reveal with Allow Mistakes ON (and One-by-One OFF) counts a
  // miss, FLASHES the answer briefly, then AUTO-ADVANCES — no pause/Next button (the run flows
  // date-to-date on its own). Before the fix a revealed question was a locked dead-end.
  it('Reveal (Allow Mistakes on, One-by-One off) counts a miss, flashes the answer, then auto-advances', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes')
    setN(3)
    click('Begin')
    const d1 = readDate()
    click('Reveal')
    expect(statValue('Score')).toBe('0/1') // counted as a played miss
    expect(statValue('Streak')).toBe('0/0')
    expect(dayState(correctName(d1))).toBe('correct') // the answer is shown during the flash
    expect(readDate()).toEqual(d1) // still on the revealed date during the flash window
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull() // no pause — it auto-advances
    act(() => {
      vi.advanceTimersByTime(700)
    }) // flash window elapses → auto-advance
    const d2 = readDate()
    expect(d2).not.toEqual(d1) // advanced to a fresh date — the run continues
    answerCorrect() // the grid is live again
    expect(statValue('Score')).toBe('1/2')
    expect(statValue('Streak')).toBe('1/1')
  })

  // One-by-One reveals DO pause (One-by-One pauses between dates by design) — a "Next" button, so you
  // see the answer before the next hidden date.
  it('Reveal (Allow Mistakes on, One-by-One on) pauses on a Next button', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes')
    click('One-by-One')
    setN(3)
    click('Begin')
    const d1 = readDate()
    click('Reveal')
    expect(statValue('Score')).toBe('0/1')
    expect(dayState(correctName(d1))).toBe('correct')
    expect(readDate()).toEqual(d1) // stays — no auto-advance under One-by-One
    expect(ctrl('Next')).toBeInTheDocument() // pauses on Next
    click('Next') // advance → the next date is hidden (One-by-One), Continue offered
    expect(ctrl('Continue')).toBeInTheDocument()
  })

  // Show Codes must function the SAME as Reveal under Allow Mistakes ON: count a miss, open the codes
  // to read, then Next advances (it's no longer a dead-end once you close/continue).
  it('Show Codes (Allow Mistakes on) counts a miss and a Next button continues the run', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes')
    setN(3)
    click('Begin')
    const d1 = readDate()
    click('Show Codes')
    expect(statValue('Score')).toBe('0/1') // counted as a played miss
    expect(ctrl('Hide Codes')).toBeInTheDocument() // panel open to read the codes
    expect(ctrl('Next')).toBeInTheDocument() // Next offered (same as Reveal)
    click('Next') // advances + closes the panel
    const d2 = readDate()
    expect(d2).not.toEqual(d1)
    expect(ctrl('Show Codes')).toBeInTheDocument() // panel closed on the new date
    answerCorrect()
    expect(statValue('Score')).toBe('1/2')
  })
})

// ── Batch 6c: completing an AoX run via Override stays on the Nth question (no phantom extra) ──────
// With Allow Mistakes off, Reveal fails the run and Override credits it + resumes. When that credit is
// the COMPLETING solve (good reaches N), the run must complete ON that question — not advance to a
// phantom Q(N+1). Before the fix, the Override credit always advanced, so an Ao10 completed via
// Reveal+Override showed Q11 (owner-reported). A normal final correct answer uses `complete` to stay
// put; this gives the Override-completion the same behavior.
describe('AoX — bug fix (Override-completed run stays on the Nth question, C2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  // The completing-on-Nth fix must hold for EVERY way the final question becomes a counted wrong —
  // a wrong answer, a Reveal, or a Show Codes (owner: "regardless of … pressed the wrong answer,
  // revealed, or showed codes") — and with Save Stats on (the default `pin()` here). All three set
  // countedWrong → Path 3 → the completing-credit hold. Ao2: finish Q1 to reach good=1, then complete
  // Q2 the given way; the run must end ON Q2 (not Q3).
  const completeQ1 = () => {
    click('Reveal')
    click('Override') // Q1 credited (good 1), advance to Q2
    expect(statValue('Score')).toBe('1/1')
  }
  it('final question via WRONG ANSWER + Override completes on Q2', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    completeQ1()
    answerWrong() // Q2 wrong → run fails (good 1)
    click('Override') // credit Q2 → good 2 = N → completes, stays on Q2
    expect(statValue('Score')).toBe('2/2')
    expect(ctrl('Reset')).toBeInTheDocument()
    expect(screen.getByText('Q2')).toBeInTheDocument()
    expect(screen.queryByText('Q3')).toBeNull()
  })
  it('final question via REVEAL + Override completes on Q2', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    completeQ1()
    click('Reveal') // Q2 miss → run fails
    click('Override') // credit Q2 → completes, stays on Q2
    expect(statValue('Score')).toBe('2/2')
    expect(screen.getByText('Q2')).toBeInTheDocument()
    expect(screen.queryByText('Q3')).toBeNull()
    expect(isDisabled(ctrl('Reveal'))).toBe(true) // done → can't keep going
  })
  it('final question via SHOW CODES + Override completes on Q2', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    completeQ1()
    click('Show Codes') // Q2 counted miss → run fails (panel open)
    click('Override') // credit Q2 → completes, stays on Q2
    expect(statValue('Score')).toBe('2/2')
    expect(screen.getByText('Q2')).toBeInTheDocument()
    expect(screen.queryByText('Q3')).toBeNull()
  })
})

// ── Batch 6e: reveal-flash race — Override DURING the flash window cancels the pending auto-advance ──
// onReveal (Allow Mistakes on, One-by-One off) flashes the answer then auto-advances ~FLASH_MS later
// via a setTimeout (revealAdvanceRef). If the player credits the revealed miss via Override inside that
// window, the stale timer must be cancelled — else it fires an extra doNew() that SKIPS a question, or
// at the final question RE-OPENS the phantom-Q(N+1) overshoot the completion fix closed. (Found 2026-06-20.)
describe('AoX — reveal-flash race (Override during the flash cancels the pending auto-advance)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('final question: Reveal then Override completes on Q2 — the stale flash timer does NOT overshoot to Q3', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes')
    setN(2)
    click('Begin')
    answerCorrect() // Q1 correct → good 1, advance to Q2
    click('Reveal') // Q2 revealed miss → arms the FLASH_MS auto-advance timer; doneCount still 1 (=n-1)
    click('Override') // completeViaOverride → HOLD, run completes ON Q2
    expect(statValue('Score')).toBe('2/2')
    expect(screen.getByText('Q2')).toBeInTheDocument()
    expect(screen.queryByText('Q3')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(700)
    }) // the stale flash timer would fire doNew() here
    expect(statValue('Score')).toBe('2/2')
    expect(screen.getByText('Q2')).toBeInTheDocument()
    expect(screen.queryByText('Q3')).toBeNull() // NOT overshot to a phantom Q3
  })

  it('non-final question: Reveal then Override advances exactly once — the stale timer does NOT skip a question', () => {
    mountApp()
    switchToAox()
    click('Allow Mistakes')
    setN(3)
    click('Begin')
    click('Reveal') // Q1 revealed miss → arms the flash timer
    click('Override') // Path 3 credit → advances to Q2 (good 1)
    expect(statValue('Score')).toBe('1/1')
    const q2 = readDate()
    act(() => {
      vi.advanceTimersByTime(700)
    }) // the stale flash timer would fire doNew() → skip Q2
    expect(readDate()).toEqual(q2) // still on Q2 — not skipped to Q3
    expect(statValue('Score')).toBe('1/1')
  })
})

// ── Batch 6b: C2 Q2-B — practice mode (Save Stats off) lets Override rescue a misclick-ended run ──
// AoX already always-tracks internally, so the off-gate on Override was the only thing stopping a
// fat-finger rescue in practice mode. Now Override is available specifically to continue a run a
// misclick ended (Allow Mistakes off), even with stats hidden.
describe('AoX — C2 Q2-B (Save Stats off: Override rescues a misclick-failed run)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
    useSettings.getState().setSaveStats(false) // practice mode
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    useSettings.getState().setSaveStats(true)
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('a misclick fails the run, but Override is available (and continues it) even with Save Stats off', () => {
    mountApp()
    switchToAox()
    setN(3) // Allow Mistakes off by default
    click('Begin')
    const d = readDate()
    answerWrong() // misclick → run fails (the failed date is shown)
    expect(ctrl('Reset')).toBeInTheDocument() // run is over
    expect(isDisabled(ctrl('Override'))).toBe(false) // rescuable in practice mode (the off-gate fix)
    click('Override') // credit + resume
    const d2 = readDate()
    expect(d2).not.toEqual(d) // advanced to a fresh date — the run continues
    answerCorrect() // and the grid is live again
    expect(d2).not.toEqual(readDate())
  })
})

// ── Batch 7: bug #2 fix — override-to-wrong fails the run (Allow Mistakes off) ───
// The deliberate fix (the unified session-end rule, applied at the component level by the fold):
// with Allow Mistakes off, flipping a correct answer to wrong via Override is a mistake and must
// FAIL the run — exactly like a wrong answer. Previously the retro-flip path didn't. The batch-3
// Override tests use Allow Mistakes ON precisely to avoid this, so they don't cover it.
describe('AoX — bug #2 fix (override-to-wrong fails the run, Allow Mistakes off)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('retro-flipping a credited answer to wrong fails the run (locks the grid)', () => {
    mountApp()
    switchToAox()
    setN(3) // Allow Mistakes is OFF by default
    click('Begin')
    answerCorrect() // 1/1, advances to a fresh live question; the credited entry is now retro-overridable
    expect(statValue('Score')).toBe('1/1')
    expect(isDisabled(ctrl('Override'))).toBe(false)
    click('Override') // retro-flip the credited answer to wrong
    expect(statValue('Score')).toBe('0/1') // credit removed
    expect(statValue('Streak')).toBe('0/0')
    expect(isDisabled(dayBtn('Sunday'))).toBe(true) // run FAILED → grid locked (the bug: it used to stay running)
  })
})

// ── Batch 8: bug fix — Show Codes on a COMPLETED run is review-only (C2) ─────────
// A completing solve credits good but stays on the question (locked, reversible). Opening Show Codes
// to review the method on the FINISHED run must NOT burn it. The reducer's SHOW_CODES penalty assumed
// an unanswered live question; a completing solve is already-answered-correct, so reviewing its codes
// is read-only. Before the fix, opening the codes turned a finished 2/2 run into 2/3 with the streak
// reset to 0/2 (a phantom played) — found by the aox-strong strong-oracle fuzz profile.
describe('AoX — bug fix (Show Codes on a completed run is review-only, C2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('opening Show Codes on a completed run does not change the score', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect() // 1/1
    answerCorrect() // 2/2 → run completes (held), Best recorded
    expect(statValue('Score')).toBe('2/2')
    expect(statValue('Streak')).toBe('2/2')
    click('Show Codes') // review the codes on the finished run
    // No phantom played, no streak reset — the score is untouched (was 2/3, streak 0/2).
    expect(statValue('Score')).toBe('2/2')
    expect(statValue('Streak')).toBe('2/2')
    expect(ctrl('Hide Codes')).toBeInTheDocument() // the codes panel opened
  })
})

// ── Batch 9: bug fix — a post-completion Override reconciles the Best (C2, AoX run layer) ───────
// A completed run records its Best, but its history stays browsable and overridable — and a
// back-browse Override (Path 1) can retract one of the run's n credited solves. Before the fix, only
// the LIVE-edge reversal of the completing solve rolled the Best back (rollbackBest was gated on
// !inBack), so a back-browse un-credit left the recorded Best standing on a run that no longer has
// n credits — a fabricated Best (the AoX analog of the Blitz cross-round rollback bug, and the same
// "stale-or-absent snapshot" family). The fix reconciles the Best continuously while the run's
// stats change post-completion, exactly like Blitz's timerDone effect: still standing (good ≥ n) →
// the pre-run record improved by the standing avg/med; no longer standing → the pre-run record.
describe('AoX — bug fix (post-completion Override reconciles the Best, C2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('back-browse Override on a completed run rolls the Best back (the credit was retracted)', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect() // 1/1, advance
    answerCorrect() // 2/2 → run completes, Best recorded
    expect(bestVal('Average')).toMatch(/^\d+\.\d{2}s$/)
    click('<') // review the first solve
    expect(isDisabled(ctrl('Override'))).toBe(false)
    click('Override') // Path-1 un-credit: retract the first solve (2/2 → 1/2)
    expect(statValue('Score')).toBe('1/2')
    // The run no longer stands at 2 credits, so its recorded Best must not stand either.
    expect(bestVal('Average')).toBe('—')
    expect(bestVal('Median')).toBe('—')
  })

  it('retracting a later run restores the EARLIER run’s Best, not empty (cross-run floor)', () => {
    // Controlled solve clock: the engine times answers via performance.now() deltas.
    let fakeNow = 0
    vi.spyOn(performance, 'now').mockImplementation(() => fakeNow)
    const tick = (ms) => {
      fakeNow += ms
    }
    mountApp()
    switchToAox()
    setN(2)
    // Run 1: two 2.0s solves → Best Average 2.00s.
    click('Begin')
    tick(2000)
    answerCorrect()
    tick(2000)
    answerCorrect()
    expect(bestVal('Average')).toBe('2.00s')
    click('Reset')
    // Run 2: two 0.5s solves → a new record, 0.50s (overwriting the stored value).
    click('Begin')
    tick(500)
    answerCorrect()
    tick(500)
    answerCorrect()
    expect(bestVal('Average')).toBe('0.50s')
    // Retract one of run 2's solves: run 2 no longer stands → run 1's 2.00s must come back —
    // not '—' (lost) and not 0.50s (fabricated).
    click('<')
    click('Override')
    expect(statValue('Score')).toBe('1/2')
    expect(bestVal('Average')).toBe('2.00s')
    expect(bestVal('Median')).toBe('2.00s')
  })

  it('a mid-done settings change cannot strand the rollback under the wrong key', () => {
    // Settings stay editable while a run sits done, and the year range is part of the Best key — so
    // the panel's bestKey can MOVE between the recording and a later rollback. The reconcile must
    // target the key the run RECORDED under (the old rollbackBest bailed on the key mismatch and
    // left the fabricated record standing).
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect()
    answerCorrect() // run done; Best recorded under the begin-time key
    const oldKey = '2|false|numeric-ymd|random|random|random|1583-10000|true'
    expect(useProgress.getState().aoxBest[oldKey]?.avg).toEqual(expect.any(Number)) // recorded here
    act(() => {
      useSettings.getState().setMinY(3000) // DIRECT store change (NOT via the ⚙ popover) — isolates the reconcile-key path; a real popover-close change now resets the done run (see "AoX — Q2")
    })
    expect(isDisabled(ctrl('Override'))).toBe(false)
    click('Override') // reverse the completing solve at the live edge → the run no longer stands
    expect(statValue('Score')).toBe('1/2')
    // The record under the RUN's key rolled back to its pre-run (empty) floor.
    expect(useProgress.getState().aoxBest[oldKey]?.avg ?? null).toBeNull()
  })
})

// ── C2: the mode-switch contract (characterization — completes the cross-mode net) ──────────────
// Every timer mode tears down a RUNNING round/run when you leave it (the original App's rule;
// Blitz's missing teardown was fixed this pass) while an ENDED one survives the detour. Pin AoX's
// half: a running run resets to idle on switch-away; a done run (and its recorded Best) survives.
describe('AoX — C2: mode switch mid-run resets, done state survives', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('switching away mid-run and back lands on a FRESH idle AoX (run reset)', () => {
    mountApp()
    switchToAox()
    setN(3)
    click('Begin')
    answerCorrect() // 1/1, running
    expect(statValue('Score')).toBe('1/1')
    act(() => {
      fireEvent.keyDown(window, { key: 'K' }) // detour into Classic mid-run
    })
    switchToAox()
    expect(ctrl('Begin')).toBeInTheDocument() // back to idle
    expect(statValue('Score')).toBe('0/0')
  })

  it('a COMPLETED run (and its recorded Best) survives the same detour', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect()
    answerCorrect() // run done, Best recorded
    const best = bestVal('Average')
    expect(best).toMatch(/^\d+\.\d{2}s$/)
    act(() => {
      fireEvent.keyDown(window, { key: 'K' })
    })
    switchToAox()
    expect(statValue('Score')).toBe('2/2') // the finished run's summary is still there
    expect(bestVal('Average')).toBe(best)
    expect(ctrl('Reset')).toBeInTheDocument()
  })
})

// ── Q2 (2026-06-21): a config change on the ⚙ popover CLOSE resets a running OR ended AoX run ───────
// So the run on screen always matches the current settings (the recorded Best is config-keyed). Deferred
// to popover close; an open→close with no change is a no-op. (The old "done run left alone" test above
// uses a DIRECT store change to isolate the reconcile-key path — the real popover path resets, here.)
describe('AoX — Q2 (a config change on popover close resets a done/failed run)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })
  // /^Settings/ — the gear's accessible name flips to "Settings (modified)" once any
  // setting diverges from the effective defaults (the Q8 indicator), which these tests do.
  const toggleSettings = () =>
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))

  it('a DONE run resets to Begin when a config setting changes on close', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect()
    answerCorrect() // run done
    expect(ctrl('Reset')).toBeInTheDocument() // done → Reset shown
    toggleSettings() // open ⚙ → snapshot
    act(() => useSettings.getState().setMinY(1700)) // change a config setting while open
    expect(ctrl('Reset')).toBeInTheDocument() // still done while open (deferred)
    toggleSettings() // close ⚙ → fire → reset()
    expect(ctrl('Begin')).toBeInTheDocument() // done run reset to idle
  })

  it('opening + closing settings with NO change leaves a done run intact', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect()
    answerCorrect() // run done
    toggleSettings()
    toggleSettings() // no change → no reset
    expect(ctrl('Reset')).toBeInTheDocument() // still done
    expect(statValue('Score')).toBe('2/2')
  })

  // Q9: the close-fired reset REMOUNTS the answer grid (keyed on the engine's gridEpoch, which
  // RESET bumps) — fresh DOM nodes have no prior green to CSS-transition from, so the cleared
  // grid snaps to idle instead of fading. Node identity is the observable remount proof.
  it('the settings-close reset REMOUNTS the answer grid (Q9: fresh nodes, cleared green)', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect() // Q1 → advance
    const green = correctName(readDate()) // Q2's correct day — its green persists on the held solve
    answerCorrect() // run done
    expect(dayState(green)).toBe('correct')
    const before = DAY.map((nm) => dayBtn(nm))
    toggleSettings()
    act(() => useSettings.getState().setMinY(1700))
    toggleSettings() // close → reset() → RESET bumps gridEpoch → the keyed grid remounts
    DAY.forEach((nm, i) => expect(dayBtn(nm)).not.toBe(before[i])) // all-new nodes
    expect(dayState(green)).toBe('idle') // and the green is gone
  })

  it('a manual Reset tap REMOUNTS the answer grid too (Q9: same RESET mechanism)', () => {
    mountApp()
    switchToAox()
    setN(2)
    click('Begin')
    answerCorrect()
    const green = correctName(readDate())
    answerCorrect() // run done → Reset shown
    const before = DAY.map((nm) => dayBtn(nm))
    click('Reset') // reset() → eng.resetStats() → RESET bumps gridEpoch
    expect(ctrl('Begin')).toBeInTheDocument() // back to idle
    DAY.forEach((nm, i) => expect(dayBtn(nm)).not.toBe(before[i])) // remounted — snap, no fade
    expect(dayState(green)).toBe('idle')
  })
})

// ── Q18: the run-length field (the shared boxed-numeric idiom + the one clamp) ────
describe('AoX — Q18 (the run-length field shares the popup N field validation trio)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pin()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })
  // The field gained its aria-label in the same batch (a Q18 gap-fill) — an accessible-name
  // lookup here is itself the regression test for it.
  const nField = () => screen.getByRole('textbox', { name: 'AoX run length' })

  it('rejects non-digits outright and normalize-commits on blur/Enter/Escape (normalizeAoxN)', () => {
    mountApp()
    switchToAox()
    // Seed a known committed value first (the modePrefs singleton carries state across tests).
    act(() => {
      fireEvent.change(nField(), { target: { value: '10' } })
      fireEvent.blur(nField())
    })
    // The flagged Q18 behavior change: letters never ENTER the field (the popup N field's
    // contract) — previously they were accepted raw and only clamped away on commit.
    act(() => fireEvent.change(nField(), { target: { value: 'abc' } }))
    expect(nField().value).toBe('10')
    act(() => fireEvent.change(nField(), { target: { value: '' } }))
    act(() => fireEvent.blur(nField()))
    expect(nField().value).toBe('10') // empty commits to the fallback
    act(() => fireEvent.change(nField(), { target: { value: '2000' } }))
    act(() => fireEvent.keyDown(nField(), { key: 'Enter' }))
    expect(nField().value).toBe('1000') // Enter commits with the shared 2–1000 clamp
    act(() => fireEvent.change(nField(), { target: { value: '1' } }))
    act(() => fireEvent.keyDown(nField(), { key: 'Escape' }))
    expect(nField().value).toBe('2') // Escape commits the clamped current value too
  })
})
