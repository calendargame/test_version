// @vitest-environment jsdom
//
// Blitz mode — characterization tests (Stage C, Step 6, Step 3) + the C3a sub-mode suite.
// Blitz runs a countdown (Per Round, 60s) or per-question (Per Question, 10s) timer, with
// Best Score / Best Streak records. Per Question splits by Allow Mistakes (C3a): AM off is
// sudden death (a wrong ends the round, score-only Best); AM on keeps the round going — the
// question clock keeps draining while you retry, and only a correct answer advances with a
// fresh clock (score+streak Best, its own silo). The characterization batches lock the
// original behavior; the C3a describe below pins the new sub-mode.
//
// Fake timers keep the rAF countdown frozen for the answer-behavior tests (the 60s drain is
// impractical to sit through). The fake-timer clock DOES drive requestAnimationFrame and
// performance.now in lockstep, so the C3a expiry tests fast-forward the per-question clock
// deliberately with vi.advanceTimersByTime (qSec=1 via the modePrefs store).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'
import { useModePrefs } from '../src/store/modePrefs.js'
import { useUserDefaults } from '../src/store/userDefaults.js'
import { useProgress } from '../src/store/progress.js'
import { wday } from '../src/lib/calendar.js'
import { DAY } from '../src/lib/format.js'

function mountApp() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}
function switchToBlitz() {
  act(() => {
    fireEvent.keyDown(window, { key: 'B' })
  })
}
function isHidden(el) {
  for (let n = el; n; n = n.parentElement) if (n.style && n.style.display === 'none') return true
  return false
}
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
const wrongName2 = ({ y, m, d }) => DAY[(wday(y, m, d) + 2) % 7] // a SECOND distinct wrong day
// Fast-forward the faked clock (rAF frames + performance.now advance in lockstep) inside act,
// so the countdown loop's state updates are flushed. Used by the C3a expiry tests.
const tick = (ms) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const dayBtn = (name) => screen.getByRole('button', { name })
const ctrl = (name) => screen.getByRole('button', { name })
const isDisabled = (btn) => btn.className.includes('pointer-events-none')
// A text match on the VISIBLE screen, and the reason a plain screen.getByText won't do: every
// screen but Lookup is always-mounted — the five game modes, and How to Play since Q6 (round 9) —
// so their markup sits in the DOM under display:none while another mode is up. The guide's Blitz
// section names the "Same Round" tag in prose, which a global query matches as readily as the tag
// itself. Same visibility filter statValue and hasStat use, in the shape getByText has.
const visibleText = (text) => {
  const els = screen.getAllByText(text).filter((el) => !isHidden(el))
  if (els.length !== 1) throw new Error(`expected one visible "${text}", found ${els.length}`)
  return els[0]
}
// Find a stat cell via its label <span>, scoped to the visible panel (the hidden Classic/Flash/
// AoX panels also contain "Score" spans). The value is the cell's last <span>. The scoring trio
// (Score/Accuracy/Streak) cells are <div>s; the timing trio (Last/Average/Median) cells are
// <button>s since Q8 (the visual-only hide toggle) — statValue reads either the same way.
function statValue(label) {
  const labelSpan = Array.from(document.querySelectorAll('span')).find(
    (s) => s.textContent.trim() === label && !isHidden(s),
  )
  if (!labelSpan) throw new Error(`stat "${label}" not found`)
  const spans = labelSpan.parentElement.querySelectorAll('span')
  return spans[spans.length - 1].textContent.trim()
}
// Tap a stat cell (Q8: the timing-trio cells are buttons that toggle the visual-only hide). The
// cell is the label span's parent (a <button> for the timing trio); clicking it fires the toggle.
function clickStat(label) {
  const labelSpan = Array.from(document.querySelectorAll('span')).find(
    (s) => s.textContent.trim() === label && !isHidden(s),
  )
  if (!labelSpan) throw new Error(`stat "${label}" not found`)
  act(() => {
    fireEvent.click(labelSpan.parentElement)
  })
}
// Whether a stat cell with this label is rendered at all (visible) — for the C3a
// streak-visibility pins (per-Q sudden death hides Streak; per-Q + AM shows it).
function hasStat(label) {
  return !!Array.from(document.querySelectorAll('span')).find(
    (s) => s.textContent.trim() === label && !isHidden(s),
  )
}
function begin() {
  act(() => {
    fireEvent.click(ctrl('Begin'))
  })
}
function click(name) {
  act(() => {
    fireEvent.click(dayBtn(name))
  })
}
function clickText(text) {
  act(() => {
    fireEvent.click(ctrl(text))
  })
}

describe('Blitz — characterization (batch 1: Per Round)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('idle: shows Begin, hidden date, Score 0/0, Best Score —', () => {
    mountApp()
    switchToBlitz()
    expect(ctrl('Begin')).toBeInTheDocument()
    expect(statValue('Score')).toBe('0/0')
    // Best Score is shown as a plain label/value (— when unset).
    expect(screen.getByText(/Best Score:/)).toBeInTheDocument()
  })

  it('Begin reveals the date and arms the round (Reset shown)', () => {
    mountApp()
    switchToBlitz()
    begin()
    expect(ctrl('Reset')).toBeInTheDocument()
    const d = readDate()
    expect(d.y).toBeGreaterThanOrEqual(1583)
  })

  it('per-round correct answers advance and accumulate the round score', () => {
    mountApp()
    switchToBlitz()
    begin()
    click(correctName(readDate())) // 1/1
    click(correctName(readDate())) // 2/2
    expect(statValue('Score')).toBe('2/2')
    expect(statValue('Streak')).toBe('2/2')
  })

  it('per-round wrong (Allow Mistakes on) counts a miss but keeps the round going', () => {
    mountApp()
    switchToBlitz()
    begin()
    const d = readDate()
    click(correctName(d)) // 1/1
    click(wrongName(readDate())) // wrong → 1/2, still live
    expect(statValue('Score')).toBe('1/2')
    expect(ctrl('Reset')).toBeInTheDocument() // round still live (Reset, not Begin)
  })

  it('per-round with Allow Mistakes OFF: a wrong answer ends the round', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // toggle off (it is on by default)
    begin()
    const d = readDate()
    click(wrongName(d)) // wrong → round ends
    // Round over: the grid locks (the correct day is shown) and stats froze at 0/1.
    expect(statValue('Score')).toBe('0/1')
    expect(dayBtn(correctName(d)).className).toContain('btn-correct-persist')
    expect(isDisabled(dayBtn(correctName(d)))).toBe(true)
  })

  it('Best Score records the round result when a round ends', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // off → a wrong ends the round
    begin()
    click(correctName(readDate())) // round score 1
    click(wrongName(readDate())) // wrong → round ends with good = 1
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
  })
})

describe('Blitz — characterization (batch 2: Per Question / sudden death)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Per Question (Allow Mistakes off): a correct answer advances, a wrong answer ends the round', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round') // toggle to Per Question (button shows the current mode)
    clickText('Allow Mistakes') // off → sudden death (independent toggles since C3a — no auto-off)
    begin()
    click(correctName(readDate())) // 1/1, next question
    expect(statValue('Score')).toBe('1/1')
    const d = readDate()
    click(wrongName(d)) // wrong → sudden death, round ends
    expect(statValue('Score')).toBe('1/2')
    expect(dayBtn(correctName(d)).className).toContain('btn-correct-persist')
    expect(isDisabled(dayBtn(correctName(d)))).toBe(true) // locked (round over)
  })
})

describe('Blitz — characterization (batch 3: Override)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('per-round Override after a wrong credits the round (0/1 → 1/1) and advances', () => {
    mountApp()
    switchToBlitz()
    begin()
    const d = readDate()
    click(wrongName(d)) // miss → round score 0/1, still live
    expect(statValue('Score')).toBe('0/1')
    expect(isDisabled(ctrl('Override'))).toBe(false)
    act(() => {
      fireEvent.click(ctrl('Override'))
    })
    expect(statValue('Score')).toBe('1/1') // credited
    expect(ctrl('Reset')).toBeInTheDocument() // still live (advanced to next Q)
  })

  it('Best Score rolls back when a completed-round correct answer is overridden to wrong', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // off → wrong ends the round
    begin()
    click(correctName(readDate())) // round score 1
    const last = readDate()
    click(wrongName(last)) // wrong → round ends; good = 1
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    // Back-browse to the credited answer and Override it to wrong → round score + Best drop to 0.
    act(() => {
      fireEvent.click(ctrl('<'))
    })
    expect(isDisabled(ctrl('Override'))).toBe(false)
    act(() => {
      fireEvent.click(ctrl('Override'))
    })
    expect(screen.getByText(/Best Score: 0\b/)).toBeInTheDocument()
  })
})

// Deliberate behavior fixes (2026-06-01) — the unified session-end rule. See PROJECT.md.
describe('Blitz — bug fixes (override-to-wrong + Show Codes end the round)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  // Bug #1: with Allow Mistakes off, flipping a correct answer to wrong via Override is a
  // mistake and must end the round (like a real wrong answer). It used to leave the round live.
  it('Allow Mistakes OFF: overriding a correct answer to wrong ends the round', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // off
    begin()
    click(correctName(readDate())) // Q1 correct → 1/1, advances to a fresh Q2
    expect(statValue('Score')).toBe('1/1')
    expect(isDisabled(ctrl('Override'))).toBe(false) // retro-override of Q1 is available
    act(() => {
      fireEvent.click(ctrl('Override'))
    }) // flip Q1 correct → wrong
    expect(statValue('Score')).toBe('0/1') // credit removed
    expect(isDisabled(dayBtn('Sunday'))).toBe(true) // round ended → answer grid locked
  })

  // Bug #3: opening Show Codes mid-round must end the round (so Best Score records and the
  // countdown stops), like Reveal. The migration dropped the round-end (Best was never saved).
  it('Show Codes during an active round ends the round and records Best Score', () => {
    mountApp()
    switchToBlitz()
    begin()
    click(correctName(readDate())) // round score 1
    act(() => {
      fireEvent.click(ctrl('Show Codes'))
    }) // open codes mid-round → ends the round
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument() // Best recorded (was the bug)
    expect(isDisabled(dayBtn('Sunday'))).toBe(true) // round ended → answer grid locked
  })
})

// C2 fuzz/read pass (2026-06-08): the Best Score/Streak rollback dropped the Best below a PREVIOUS
// round's score. The reconcile tracks only ONE best record + its round id, and on rollback set
// Best = the (overridden-down) current round's good — with no memory of the earlier round that the
// record had overwritten. AoX's rollback snapshots + restores the PRIOR best (correct); Blitz lacked
// that snapshot. Same "restore from a stale/absent snapshot" family as the engine bugs.
describe('Blitz — Best Score cross-round rollback (C2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('overriding a later round below an earlier one keeps Best Score at the earlier round', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // OFF → a wrong ends the round (lets us end rounds without the timer)
    // Round A → good 1 (sets Best Score 1)
    begin()
    click(correctName(readDate())) // 1/1
    click(wrongName(readDate())) // wrong → round A ends, good = 1
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    // Round B → good 2 (beats A, overwrites the Best record with round B's id)
    clickText('Reset') // round A ended → back to idle so Begin shows again (Best 1 persists)
    begin()
    click(correctName(readDate())) // 1
    click(correctName(readDate())) // 2
    click(wrongName(readDate())) // wrong → round B ends, good = 2
    expect(screen.getByText(/Best Score: 2\b/)).toBeInTheDocument()
    // Override round B's two correct answers to wrong → good 2 → 1 → 0 (below round A's 1).
    act(() => fireEvent.click(ctrl('<'))) // browse B's 2nd correct
    act(() => fireEvent.click(ctrl('Override'))) // → wrong, good 2→1
    act(() => fireEvent.click(ctrl('<'))) // browse B's 1st correct
    act(() => fireEvent.click(ctrl('Override'))) // → wrong, good 1→0
    // Round A's 1 still stands as the real best — Best Score must be 1, NOT round B's dropped 0.
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
  })
})

// ── C2 fix: leaving Blitz mid-round ABANDONS the round (the hidden countdown must not keep
// draining). The original App discarded an active round on switch-away (blitzLeavingMidRound →
// stacks unsaved, snap nulled, arm() on return); AoX resets a hidden running run and Flash stops a
// live flash the same way — but the Blitz migration carried no visibility teardown, so the rAF
// countdown kept running behind display:none: a per-question timeout would count a phantom MISS in
// absentia, and the round would end + reconcile a Best for play the user walked away from. The
// ENDED (timerDone) state still survives a detour, exactly like AoX's done run.
describe('Blitz — C2 fix (mode switch mid-round abandons the round)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('switching away mid-round and back lands on a FRESH idle Blitz (round abandoned)', () => {
    mountApp()
    switchToBlitz()
    begin()
    click(correctName(readDate())) // round running, Score 1/1
    expect(statValue('Score')).toBe('1/1')
    act(() => {
      fireEvent.keyDown(window, { key: 'K' }) // detour into Classic mid-round
    })
    act(() => {
      vi.advanceTimersByTime(2000) // time passes while away — nothing may tick in the background
    })
    switchToBlitz()
    expect(ctrl('Begin')).toBeInTheDocument() // back to idle — the round did not keep running
    expect(statValue('Score')).toBe('0/0') // the abandoned round's ephemeral stats are gone
  })

  it('an ENDED round (timerDone) survives the same detour', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // OFF → a wrong answer ends the round
    begin()
    click(wrongName(readDate())) // round over: 0/1, timerDone
    expect(statValue('Score')).toBe('0/1')
    act(() => {
      fireEvent.keyDown(window, { key: 'K' })
    })
    switchToBlitz()
    expect(statValue('Score')).toBe('0/1') // the finished round's summary is still there
    expect(ctrl('Reset')).toBeInTheDocument()
  })
})

// ── C2 Q2-A: a misclick-ended round is RESUMABLE via Override (regression fix). The pre-rewrite
// app resumed the round when you overrode the mistake — Per Round continued the countdown where it
// stopped, Per Question started a fresh per-question timer — and reverted the Best the interrupted
// round had provisionally saved ("bests not save yet"). The Blitz mode-untangle dropped this: a
// mistake ended the round, the Best saved, and Override credited the point but the round stayed
// DEAD (a new date loaded that you couldn't play). Restored here.
describe('Blitz — C2 Q2-A (Override resumes a misclick-ended round)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Per Round (Allow Mistakes off): Override after a misclick credits it AND resumes the round', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // OFF → a wrong ends the round
    begin()
    click(correctName(readDate())) // 1/1
    click(wrongName(readDate())) // misclick → round ends 1/2
    expect(statValue('Score')).toBe('1/2')
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument() // provisionally saved at the mistake
    act(() => fireEvent.click(ctrl('Override'))) // credit the misclick + RESUME
    expect(statValue('Score')).toBe('2/2') // credited
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument() // Best reverted — not locked from the interrupted round
    // The round is LIVE again: the next date is answerable (the bug left it dead → score would stay 2/2).
    click(correctName(readDate()))
    expect(statValue('Score')).toBe('3/3')
    // Ending the round now (another misclick) re-saves the Best at the true final score.
    click(wrongName(readDate()))
    expect(statValue('Score')).toBe('3/4')
    expect(screen.getByText(/Best Score: 3\b/)).toBeInTheDocument()
  })

  it('Per Question: Override after a sudden-death misclick resumes on a fresh question', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round') // → Per Question
    clickText('Allow Mistakes') // off → sudden death (independent toggles since C3a — no auto-off)
    begin()
    click(correctName(readDate())) // 1/1, next question
    click(wrongName(readDate())) // sudden-death miss → round ends 1/2
    expect(statValue('Score')).toBe('1/2')
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    act(() => fireEvent.click(ctrl('Override'))) // credit + resume
    expect(statValue('Score')).toBe('2/2')
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument() // reverted
    click(correctName(readDate())) // live again on a fresh question → advances
    expect(statValue('Score')).toBe('3/3')
  })
})

// ── C2 (uniform override): a round ended by a deliberate Reveal or Show Codes is ALSO resumable via
// Override (not just a misclick) — owner's call that Override should behave the same everywhere. The
// round continues and the interrupted round's provisional Best is reverted ("bests not updated").
describe('Blitz — C2 (Reveal / Show Codes then Override resumes the round)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Per Round (Allow Mistakes off): Reveal ends the round, Override resumes it, Best not kept', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // off
    begin()
    click(correctName(readDate())) // 1/1
    act(() => fireEvent.click(ctrl('Reveal'))) // reveal → round ends 1/2, Best provisionally saved at 1
    expect(statValue('Score')).toBe('1/2')
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    act(() => fireEvent.click(ctrl('Override'))) // credit the revealed miss + RESUME
    expect(statValue('Score')).toBe('2/2')
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument() // reverted — not kept (was: stayed 1, round dead)
    click(correctName(readDate())) // live again (the bug left it dead → would stay 2/2)
    expect(statValue('Score')).toBe('3/3')
  })

  it('Per Round (Allow Mistakes off): Show Codes ends the round, Override resumes it, Best not kept', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // off
    begin()
    click(correctName(readDate())) // 1/1
    act(() => fireEvent.click(ctrl('Show Codes'))) // show codes → round ends 1/2 (a miss)
    expect(statValue('Score')).toBe('1/2')
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    act(() => fireEvent.click(ctrl('Override'))) // credit + resume (also closes the panel via advance)
    expect(statValue('Score')).toBe('2/2')
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument()
    click(correctName(readDate())) // live again
    expect(statValue('Score')).toBe('3/3')
  })
})

// ── C2 Q2-B: in PRACTICE MODE (Save Stats off) a misclick-ended round is STILL rescuable via
// Override (the off-gate used to hide Override entirely). Blitz now always-tracks internally — Save
// Stats off only dims the display + records no Best — so the rescue credit stays integrity-safe.
describe('Blitz — C2 Q2-B (Save Stats off: misclick rescue, no Best recorded)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
    useSettings.getState().setSaveStats(false) // practice mode
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    useSettings.getState().setSaveStats(true)
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Per Round: Override is available to rescue a misclick-ended round, and no Best is recorded', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // off → a wrong ends the round
    begin()
    click(correctName(readDate())) // internally tracked; display dimmed
    click(wrongName(readDate())) // misclick → round ends
    // Practice mode: Best stays unrecorded, but Override IS available to rescue (the off-gate fix).
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument()
    expect(isDisabled(ctrl('Override'))).toBe(false)
    act(() => fireEvent.click(ctrl('Override'))) // credit + resume
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument() // still no Best
    // The round resumed: the next date is answerable.
    const d2 = readDate()
    click(correctName(d2))
    expect(ctrl('Reset')).toBeInTheDocument() // still live
  })

  it('Save Stats off records NO Best even when a round ends normally (always-track is display-only)', () => {
    mountApp()
    switchToBlitz()
    clickText('Allow Mistakes') // off
    begin()
    click(correctName(readDate())) // a correct
    click(wrongName(readDate())) // wrong → round ends with an internal score, but Save Stats off
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument() // no Best in practice mode
  })
})

// ── Q2 (2026-06-21): a config setting changed on the ⚙ popover CLOSE resets the round ──────────────
// Restores the documented "in active Blitz rounds, any settings change ends the round" behavior the
// mode-untangle dropped (BlitzMode had no settings effect), AND extends it: an ENDED round (timerDone)
// also resets, so the round on screen always matches the current settings. Deferred to popover CLOSE so
// adjusting several settings doesn't churn the round per keystroke; an open→close with no change is a no-op.
describe('Blitz — Q2 (a config change on popover close resets the round)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
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

  it('an ACTIVE round resets to Begin when a config setting changes on close', () => {
    mountApp()
    switchToBlitz()
    begin()
    expect(ctrl('Reset')).toBeInTheDocument() // active → Reset shown
    toggleSettings() // open ⚙ → snapshot
    act(() => useSettings.getState().setMinY(1700)) // change a config setting while open
    expect(ctrl('Reset')).toBeInTheDocument() // still active while open (deferred)
    toggleSettings() // close ⚙ → fire → resetRound
    expect(ctrl('Begin')).toBeInTheDocument() // round reset to idle
  })

  it('an ENDED round (timerDone) resets to Begin when a config setting changes on close', () => {
    mountApp()
    switchToBlitz()
    begin()
    clickText('Reveal') // ends the round → timerDone
    expect(ctrl('Reset')).toBeInTheDocument()
    toggleSettings()
    act(() => useSettings.getState().setMinY(1700))
    toggleSettings()
    expect(ctrl('Begin')).toBeInTheDocument() // ended round reset on close
  })

  it('opening + closing settings with NO change leaves the round running', () => {
    mountApp()
    switchToBlitz()
    begin()
    toggleSettings()
    toggleSettings() // no change → no reset
    expect(ctrl('Reset')).toBeInTheDocument() // still active
  })

  // Q9: the close-fired round reset REMOUNTS the answer grid (keyed on the engine's gridEpoch —
  // Blitz's resetRound is eng.resetStats, i.e. RESET, which bumps it) — fresh DOM nodes have no
  // prior colors to CSS-transition from, so the cleared grid snaps to idle instead of fading. A
  // normal advance must NOT remount (the epoch is untouched), or an in-flight flash keyframe
  // would restart.
  it('the settings-close reset REMOUNTS the answer grid; a normal advance does NOT (Q9)', () => {
    mountApp()
    switchToBlitz()
    begin()
    const stable = dayBtn(DAY[0])
    click(correctName(readDate())) // 1/1 — advances
    expect(dayBtn(DAY[0])).toBe(stable) // same node across an advance — no remount mid-flash
    click(wrongName(readDate())) // wrong → the round ends; red + revealed green persist
    const before = DAY.map((nm) => dayBtn(nm))
    toggleSettings()
    act(() => useSettings.getState().setMinY(1700))
    toggleSettings() // close → resetRound → RESET bumps gridEpoch → the keyed grid remounts
    expect(ctrl('Begin')).toBeInTheDocument()
    DAY.forEach((nm, i) => expect(dayBtn(nm)).not.toBe(before[i])) // all-new nodes — snap, no fade
  })

  it('a manual Reset tap REMOUNTS the answer grid too (Q9: same RESET mechanism)', () => {
    mountApp()
    switchToBlitz()
    begin()
    click(wrongName(readDate())) // round ends — the answer colors persist on the grid
    const before = DAY.map((nm) => dayBtn(nm))
    clickText('Reset') // resetRound → eng.resetStats → RESET bumps gridEpoch
    expect(ctrl('Begin')).toBeInTheDocument()
    DAY.forEach((nm, i) => expect(dayBtn(nm)).not.toBe(before[i])) // remounted — snap, no fade
  })
})

// ── Q7 round-6: Reset Settings now restores the mode-screen round timer too, so a Reset Settings
// that changes a running/ended round's timer reconciles it on the popover close — exactly the Q2 rule,
// now triggered by the timer dep the close-effect gained. Uses a FACTORY panel so Reset Settings
// touches ONLY the timer, isolating the mode-screen-pref path from the ⚙-panel path Q2 already covers.
// (Q7 round-6 = "extend Reset Settings"; distinct from the Session-11 Q7 that added Save Defaults.)
describe('Blitz — Q7 round-6 (Reset Settings restoring the round timer reconciles the round)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useModePrefs.getState().resetModePrefs()
    useUserDefaults.getState().clearDefaults()
    useProgress.getState().resetProgress()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })
  const toggleSettings = () =>
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))

  it('an ACTIVE round resets when Reset Settings restores a divergent round timer on close', () => {
    useModePrefs.getState().setBlitzSec(120) // diverges from the factory 60
    mountApp()
    switchToBlitz()
    begin()
    expect(ctrl('Reset')).toBeInTheDocument() // active → Reset shown
    toggleSettings() // open ⚙ → snapshot (blitzSec 120)
    act(() => fireEvent.click(ctrl('Reset Settings'))) // restores blitzSec → 60 (the panel is already factory)
    expect(ctrl('Reset')).toBeInTheDocument() // still active while open (deferred to close)
    toggleSettings() // close → the blitzSec dep changed → resetRound
    expect(ctrl('Begin')).toBeInTheDocument() // round reset to idle
    expect(useModePrefs.getState().blitzSec).toBe(60) // timer restored to the factory default
  })

  it('an ENDED round (timerDone) resets when Reset Settings restores a divergent timer on close', () => {
    useModePrefs.getState().setBlitzSec(120)
    mountApp()
    switchToBlitz()
    begin()
    clickText('Reveal') // ends the round → timerDone
    expect(ctrl('Reset')).toBeInTheDocument()
    toggleSettings()
    act(() => fireEvent.click(ctrl('Reset Settings')))
    toggleSettings()
    expect(ctrl('Begin')).toBeInTheDocument() // ended round reset on close
    expect(useModePrefs.getState().blitzSec).toBe(60)
  })
})

// ── C3a (Q15): the Per Question + Allow Mistakes sub-mode ─────────────────────────────────────────
// The two Blitz switches are now fully independent (the old auto-off exclusion died): per-Q + AM is
// a real fourth combination — a wrong answer marks the miss, breaks the streak, and leaves the SAME
// question on screen with its clock still draining; only a correct answer (or an in-round Override
// credit) advances, always with a fresh question clock; the round ends when any one question's
// clock expires. Its Best is score+streak (the BlitzBest shape) in its OWN silo (suddenAmBest),
// separate from sudden death's score-only record at the same config. The expiry tests set qSec=1
// (the slider min) via the modePrefs store and drive the faked rAF clock with tick().
describe('Blitz — Per Question + Allow Mistakes (C3a)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('the two switches are independent: Per Question keeps Allow Mistakes on, and vice versa', () => {
    mountApp()
    switchToBlitz()
    expect(ctrl('Allow Mistakes').className).toContain('btn-solid') // AM on (factory)
    clickText('Per Round') // → Per Question
    expect(ctrl('Per Question')).toBeInTheDocument()
    expect(ctrl('Allow Mistakes').className).toContain('btn-solid') // NOT auto-disabled anymore
    clickText('Allow Mistakes') // off
    expect(ctrl('Allow Mistakes').className).not.toContain('btn-solid')
    expect(ctrl('Per Question')).toBeInTheDocument() // still Per Question
    clickText('Allow Mistakes') // back on while in Per Question
    expect(ctrl('Allow Mistakes').className).toContain('btn-solid')
    expect(ctrl('Per Question')).toBeInTheDocument() // did NOT bounce back to Per Round
  })

  it('a wrong answer counts a miss, breaks the streak, and stays on the SAME date (round live)', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round') // → Per Question, AM stays on
    begin()
    const d = readDate()
    click(wrongName(d))
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(ctrl('Reset')).toBeInTheDocument() // round still live
    expect(readDate()).toEqual(d) // SAME question — no advance
    click(wrongName2(d)) // a second, different wrong tap on the burned question
    expect(statValue('Score')).toBe('0/1') // no double count
    expect(readDate()).toEqual(d)
  })

  it('after a wrong, the correct answer advances WITHOUT credit; the next clean correct credits', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    begin()
    const d = readDate()
    click(wrongName(d)) // 0/1, stays
    click(correctName(d)) // late correct → advances, uncredited
    expect(statValue('Score')).toBe('0/1')
    expect(ctrl('Reset')).toBeInTheDocument()
    click(correctName(readDate())) // the NEW question credits normally — proves the advance
    expect(statValue('Score')).toBe('1/2')
  })

  it('a wrong does NOT refresh the question clock: the original deadline still ends the round', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    act(() => useModePrefs.getState().setBlitzQSec(1)) // fastest clock (slider min)
    begin()
    tick(500) // half the 1s clock gone
    const d = readDate()
    click(wrongName(d)) // burned — the clock must KEEP draining
    tick(600) // past the ORIGINAL 1s deadline
    expect(isDisabled(dayBtn(correctName(d)))).toBe(true) // round over — grid locked
    expect(dayBtn(correctName(d)).className).toContain('btn-correct-persist') // answer revealed
  })

  it('a correct answer DOES refresh the question clock (advance grants a fresh qSec)', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    act(() => useModePrefs.getState().setBlitzQSec(1))
    begin()
    tick(900) // ~0.1s left on the first question
    click(correctName(readDate())) // advance → fresh 1s clock
    tick(900) // past the OLD deadline, inside the new one
    expect(ctrl('Reset')).toBeInTheDocument() // still live — the clock was refreshed
    const d = readDate()
    expect(isDisabled(dayBtn(correctName(d)))).toBe(false)
    click(correctName(d)) // and still answerable
    expect(statValue('Score')).toBe('2/2')
  })

  it('a timeout on a burned question ends the round (no double count) and IS Override-rescuable', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    act(() => useModePrefs.getState().setBlitzQSec(1))
    begin()
    const d = readDate()
    click(wrongName(d)) // burned at ~t0 — played 1
    tick(1100) // the clock dies on the burned question
    expect(statValue('Score')).toBe('0/1') // ONE played — the timeout must not re-count it
    expect(dayBtn(correctName(d)).className).toContain('btn-correct-persist')
    expect(isDisabled(dayBtn(correctName(d)))).toBe(true)
    // countedWrong (set by the wrong) survives the timeout → this end is resumable (ratified):
    // crediting the wrong resumes the round on the next date with a FRESH question clock.
    expect(isDisabled(ctrl('Override'))).toBe(false)
    act(() => fireEvent.click(ctrl('Override')))
    expect(statValue('Score')).toBe('1/1') // credited
    expect(ctrl('Reset')).toBeInTheDocument()
    tick(500) // half a fresh 1s clock — a stale deadline would already have re-ended the round
    click(correctName(readDate()))
    expect(statValue('Score')).toBe('2/2')
  })

  it('Streak is visible in per-Q + AM (per-round semantics), hidden only in sudden death', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round') // → Per Question, AM on
    expect(statValue('Streak')).toBe('0/0') // the cell renders in per-Q + AM
    clickText('Allow Mistakes') // off → sudden death hides it (streak would equal score)
    expect(hasStat('Streak')).toBe(false)
    clickText('Allow Mistakes') // back on
    begin()
    click(correctName(readDate())) // streak 1
    click(correctName(readDate())) // streak 2 (the high-water)
    const d = readDate()
    click(wrongName(d)) // streak breaks, round continues
    click(correctName(d)) // uncredited advance
    expect(statValue('Streak')).toBe('0/2') // running 0 / best 2 — exactly per-round semantics
  })

  it('the per-Q + AM Best row records score AND streak with ★ flags and the Same Round tag', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    begin()
    click(correctName(readDate()))
    click(correctName(readDate())) // 2/2
    act(() => fireEvent.click(ctrl('Reveal'))) // give up → the round ends 2/3
    expect(screen.getByText(/Best Score: 2\b/).textContent).toContain('★')
    expect(screen.getByText(/Best Streak: 2\b/).textContent).toContain('★')
    expect(visibleText('Same Round')).toBeInTheDocument() // both set by this round
    clickText('Reset')
    begin()
    click(correctName(readDate()))
    click(correctName(readDate()))
    click(correctName(readDate())) // 3/3 — beats both fields
    act(() => fireEvent.click(ctrl('Reveal')))
    expect(screen.getByText(/Best Score: 3\b/).textContent).toContain('★') // re-flagged
    expect(screen.getByText(/Best Streak: 3\b/).textContent).toContain('★')
    expect(visibleText('Same Round')).toBeInTheDocument()
  })

  it('a post-round Override rolls the per-Q + AM Best back (same-round rollback)', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    begin()
    click(correctName(readDate())) // 1/1
    act(() => fireEvent.click(ctrl('Reveal'))) // the round ends 1/2, Best Score 1 recorded
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    act(() => fireEvent.click(ctrl('<'))) // browse the credited answer
    expect(isDisabled(ctrl('Override'))).toBe(false)
    act(() => fireEvent.click(ctrl('Override'))) // flip it to wrong → good 1→0
    expect(screen.getByText(/Best Score: 0\b/)).toBeInTheDocument() // rolled back with the round
  })

  it('an Override rescue reverts the provisionally saved Best until the round truly ends', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    begin()
    click(correctName(readDate())) // 1/1
    act(() => fireEvent.click(ctrl('Reveal'))) // ends 1/2 → Best Score 1 provisionally saved
    expect(statValue('Score')).toBe('1/2')
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    act(() => fireEvent.click(ctrl('Override'))) // credit the revealed miss + RESUME
    expect(statValue('Score')).toBe('2/2')
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument() // reverted to the pre-round record
    click(correctName(readDate())) // live again on the next date
    expect(statValue('Score')).toBe('3/3')
    act(() => fireEvent.click(ctrl('Reveal'))) // end for real → re-saves at the true final score
    expect(screen.getByText(/Best Score: 3\b/)).toBeInTheDocument()
  })

  it('in-round Override on a wrong (Path 3) credits, advances, keeps the round live, and re-arms the clock', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    act(() => useModePrefs.getState().setBlitzQSec(1))
    begin()
    const d = readDate()
    tick(600) // burn most of the 1s clock
    click(wrongName(d)) // 0/1, same question, still draining
    act(() => fireEvent.click(ctrl('Override'))) // "you were right all along" → credit + advance
    expect(statValue('Score')).toBe('1/1')
    tick(600) // past the original deadline — only a re-armed clock survives this
    expect(ctrl('Reset')).toBeInTheDocument()
    click(correctName(readDate())) // genuinely live on the NEW date
    expect(statValue('Score')).toBe('2/2')
  })

  it('in-round Override after a retry-correct (Path 4) retro-credits and re-arms the clock', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    act(() => useModePrefs.getState().setBlitzQSec(1))
    begin()
    const d = readDate()
    click(wrongName(d)) // burned — played 1
    click(correctName(d)) // uncredited advance → fresh clock, pendingWrongOverride armed
    expect(statValue('Score')).toBe('0/1')
    tick(600)
    act(() => fireEvent.click(ctrl('Override'))) // credit the earlier wrong; the live question advances past itself
    expect(statValue('Score')).toBe('1/1')
    tick(600) // past the pre-override deadline — the C3a branch must have re-armed
    expect(ctrl('Reset')).toBeInTheDocument()
    click(correctName(readDate()))
    expect(statValue('Score')).toBe('2/2')
  })

  it('retro-flipping a correct to wrong with AM on keeps the round going (AM off ends it — pinned above)', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    begin()
    click(correctName(readDate())) // 1/1, advanced
    act(() => fireEvent.click(ctrl('Override'))) // flip that correct → wrong
    expect(statValue('Score')).toBe('0/1')
    expect(ctrl('Reset')).toBeInTheDocument()
    const d = readDate()
    expect(isDisabled(dayBtn(correctName(d)))).toBe(false) // the grid is still answerable
    click(correctName(d))
    expect(statValue('Score')).toBe('1/2') // round continued
  })

  it('sudden-death and per-Q + AM keep SEPARATE Best silos at the same config', () => {
    mountApp()
    switchToBlitz()
    clickText('Per Round')
    clickText('Allow Mistakes') // off → sudden death
    begin()
    click(correctName(readDate())) // 1/1
    click(wrongName(readDate())) // sudden death → ends 1/2
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    expect(screen.queryByText(/Best Streak:/)).toBeNull() // the score-only row
    clickText('Reset')
    clickText('Allow Mistakes') // on → the AM silo (same qSec + config)
    expect(screen.getByText(/Best Score: —/)).toBeInTheDocument() // its own empty record
    expect(screen.getByText(/Best Streak: —/)).toBeInTheDocument()
    begin()
    click(correctName(readDate()))
    click(correctName(readDate())) // 2/2
    act(() => fireEvent.click(ctrl('Reveal'))) // ends 2/3
    expect(screen.getByText(/Best Score: 2\b/)).toBeInTheDocument()
    clickText('Reset')
    clickText('Allow Mistakes') // back off — the sudden-death record is untouched
    expect(screen.getByText(/Best Score: 1\b/)).toBeInTheDocument()
    expect(screen.queryByText(/Best Streak:/)).toBeNull()
  })
})

// ── C3a freshness: the new map joins Blitz's fully-reset report, and Full Reset wipes it ─────────
// Pristine settings here (no per-test overrides) so App's isFullyReset can actually be true: the
// Full Reset footer button is dimmed exactly when EVERYTHING is at launch state, so a lone
// suddenAmBest record must light it, and resetProgress (what Full Reset runs) must re-dim it.
describe('Blitz — C3a freshness (suddenAmBest blocks fully-reset until wiped)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('a suddenAmBest record enables Full Reset; resetProgress re-dims it', () => {
    mountApp()
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))
    const fullResetBtn = () => screen.getByRole('button', { name: /Full Reset/ })
    expect(isDisabled(fullResetBtn())).toBe(true) // pristine app → fully reset → dimmed
    act(() =>
      useProgress
        .getState()
        .setSuddenAmBest({ k: { score: 2, streak: 2, scoreRoundId: 1, streakRoundId: 1 } }),
    )
    expect(isDisabled(fullResetBtn())).toBe(false) // the new map counts against Blitz freshness
    act(() => useProgress.getState().resetProgress()) // the wipe Full Reset performs
    expect(isDisabled(fullResetBtn())).toBe(true)
  })
})

// ── Q8: the visual-only timing-stats hide toggle (Last/Average/Median) ───────────────────────
// Blitz gained a per-mode timing-trio hide toggle that is VISUAL ONLY: it dims the display but the
// engine keeps timing (Blitz feeds the engine timingOff:false always). So there is NO "Enable and
// Reset Stats?" arm — hiding can never desync — and the scoring trio (Score/Accuracy/Streak) stays
// untoggleable. One toggle per mode (blitzTimingOff), shared across Per Round / Per Question, and
// excluded from the defaults system (verified in tests/saveDefaults.dom.test.jsx).
describe('Blitz — Q8 visual-only timing hide', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useSettings.getState().resetSettings()
    useSettings.getState().setRandomFormat(false)
    useSettings.getState().setDateFormat('numeric-ymd')
    useSettings.getState().setMinY(1583)
    useSettings.getState().setMaxY(10000)
    useModePrefs.getState().resetModePrefs() // blitzTimingOff starts false (shown)
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('tapping a timing stat dims all three (visual only); the scoring trio stays; no reset prompt', () => {
    mountApp()
    switchToBlitz()
    begin()
    tick(500)
    click(correctName(readDate())) // one solve recorded and shown
    expect(statValue('Average')).toMatch(/^\d+\.\d{2}s$/)
    expect(statValue('Score')).toBe('1/1')
    clickStat('Average') // hide the timing trio
    expect(statValue('Last')).toBe('—')
    expect(statValue('Average')).toBe('—')
    expect(statValue('Median')).toBe('—')
    // Scoring trio is untoggleable — still visible.
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Accuracy')).toBe('100.0%')
    expect(statValue('Streak')).toBe('1/1')
    // VISUAL ONLY: never the Classic/Flash/Deduction "Enable and Reset Stats?" confirmation.
    expect(screen.queryByText('Enable and Reset Stats?')).toBeNull()
    clickStat('Median') // tapping any timing box re-shows all three
    expect(statValue('Average')).toMatch(/^\d+\.\d{2}s$/)
  })

  it('the engine keeps timing while the trio is hidden — a solve made while hidden appears on re-show', () => {
    mountApp()
    switchToBlitz()
    begin()
    click(correctName(readDate())) // solve #1 immediate → 0.00s
    clickStat('Last') // hide
    expect(statValue('Last')).toBe('—')
    tick(4000)
    click(correctName(readDate())) // solve #2 recorded WHILE hidden (~4.00s)
    expect(statValue('Score')).toBe('2/2') // the round kept running
    clickStat('Last') // re-show
    const last = statValue('Last')
    expect(last).toMatch(/^\d+\.\d{2}s$/)
    // Nonzero → the hidden solve WAS timed by the engine (would be 0.00s if the toggle wrongly
    // fed useGameEngine's timingOff and stopped tracking).
    expect(last).not.toBe('0.00s')
    expect(screen.queryByText('Enable and Reset Stats?')).toBeNull()
  })

  it('one toggle per mode: hiding in Per Round carries into Per Question', () => {
    mountApp()
    switchToBlitz()
    begin() // Per Round (default)
    tick(500)
    click(correctName(readDate()))
    clickStat('Average') // hide in Per Round
    expect(statValue('Average')).toBe('—')
    clickText('Reset') // idle unlocks the sub-mode switch
    act(() => fireEvent.click(ctrl('Per Round'))) // → Per Question
    begin()
    tick(500)
    click(correctName(readDate())) // a Per Question solve
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Average')).toBe('—') // still hidden — the toggle is shared
  })
})
