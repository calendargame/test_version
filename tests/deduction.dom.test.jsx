// @vitest-environment jsdom
//
// Deduction mode — characterization tests (Stage C, Step 6, Step 4). Deduction is a puzzle
// question type with three independent sub-modes (Day / Month / Year): the screen shows a
// PARTIAL date (one of y/m/d hidden) plus its weekday, and you pick the missing piece from a
// grid of options. Each sub-mode keeps its OWN stats + history silo. It is still rendered
// inline in <App/> and runs through the same fused handlers (submitDoW/override/goBack/…) as
// the other modes, so these lock TODAY's observable behavior before it moves onto the shared
// engine — written against the current app as a black box, valid before AND after the rewrite.
//
// Determinism strategy: the puzzle is random, so we read what's on screen — the shown weekday
// and the two visible date parts (numeric-ymd format, pinned, so the partial is trivially
// parseable) — and compute which option is correct with the same already-tested calendar
// functions the app uses (activeWday, honoring the active calendar). Year/Day options are
// numbers; Month options are doomsday-code boxes whose labels (e.g. "Jan/Oct") name the months
// they group, so the correct box is the one holding a month whose weekday matches.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'
import { DAY } from '../src/lib/format.js'
import { isGapDate, isJulianDate, dim } from '../src/lib/calendar.js'
import { activeWday } from '../src/engine/gameReducer.js'

// ── Harness ──────────────────────────────────────────────────────────────────
function mountApp() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}
// The Classic/Flash/Blitz/AoX mode panels are always-mounted but display:none; Deduction is
// conditionally rendered (visible). isHidden walks ancestors so raw DOM queries (date, stat
// spans) ignore the hidden panels. getByRole already excludes display:none subtrees.
function isHidden(el) {
  for (let n = el; n; n = n.parentElement) if (n.style && n.style.display === 'none') return true
  return false
}
const ctrl = (name) => screen.getByRole('button', { name })
const isDisabled = (btn) => btn.className.includes('pointer-events-none')

function switchToDeduction() {
  act(() => {
    fireEvent.keyDown(window, { key: 'D' })
  })
}
function clickCtrl(name) {
  act(() => {
    fireEvent.click(ctrl(name))
  })
}
function clickEl(el) {
  act(() => {
    fireEvent.click(el)
  })
}

// Stat value by label span, scoped to the visible App stats strip (hidden mode panels also
// contain "Score"/"Streak" spans). The value is the cell's last <span>.
function statValue(label) {
  const labelSpan = Array.from(document.querySelectorAll('span')).find(
    (s) => s.textContent.trim() === label && !isHidden(s),
  )
  if (!labelSpan) throw new Error(`stat "${label}" not found`)
  const spans = labelSpan.parentElement.querySelectorAll('span')
  return spans[spans.length - 1].textContent.trim()
}

// The visible Deduction option buttons, in grid order (hidden modes' grids are display:none →
// excluded by getAllByRole; the option buttons are direct children of [data-answer-grid]).
function optButtons() {
  return screen
    .getAllByRole('button')
    .filter((b) => b.parentElement?.getAttribute('data-answer-grid') === 'true')
}
function optState(btn) {
  const c = btn.className
  if (c.includes('btn-correct-persist')) return 'correct'
  if (c.includes('btn-wrong-persist')) return 'wrong-latest'
  if (c.includes('btn-wrong-dim')) return 'wrong-prev'
  if (c.includes('btn-override-wrong')) return 'override-wrong'
  return 'idle'
}

const MON3 = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
}
const labelMonths = (lab) =>
  lab
    .split('/')
    .map((s) => MON3[s.trim()])
    .filter(Boolean)

// Read the live puzzle from the screen: the partial date (one slot is "__"), the shown weekday
// index, the option labels, and the sub-mode (which slot is missing).
function readPuzzle() {
  const dateEl = Array.from(document.querySelectorAll('div')).find(
    (e) => e.children.length === 0 && !isHidden(e) && e.textContent.includes('__'),
  )
  if (!dateEl) throw new Error('Deduction partial date not found')
  const [ySlot, mSlot, dSlot] = dateEl.textContent.trim().split('-')
  const wdEl = Array.from(document.querySelectorAll('div')).find(
    (e) => !isHidden(e) && /^Weekday:/.test(e.textContent.trim()),
  )
  if (!wdEl) throw new Error('Deduction weekday not found')
  const w = DAY.indexOf(wdEl.querySelector('span').textContent.trim())
  const labels = optButtons().map((b) => b.textContent.trim())
  return {
    type: ySlot === '__' ? 'year' : mSlot === '__' ? 'month' : 'day',
    w,
    labels,
    raw: dateEl.textContent.trim(),
    Y: ySlot === '__' ? null : +ySlot,
    M: mSlot === '__' ? null : +mSlot,
    D: dSlot === '__' ? null : +dSlot,
  }
}

// Index of the correct option, computed from the displayed weekday + the two visible parts.
// useJulian is read live from the store (Gregorian-ness comes from the year range, not the flag).
function correctIdx() {
  const useJulian = useSettings.getState().useJulian
  const { type, w, labels, Y, M, D } = readPuzzle()
  if (type === 'day') return labels.findIndex((d) => activeWday(Y, M, +d, useJulian) === w)
  if (type === 'year') return labels.findIndex((y) => activeWday(+y, M, D, useJulian) === w)
  // Month: options are doomsday boxes; the correct box holds a month whose weekday matches.
  const cand = []
  for (let m = 1; m <= 12; m++) {
    if (isGapDate(Y, m, D)) continue
    if (D > dim(Y, m, useJulian && isJulianDate(Y, m, D))) continue
    if (activeWday(Y, m, D, useJulian) === w) cand.push(m)
  }
  return labels.findIndex((lab) => labelMonths(lab).some((m) => cand.includes(m)))
}
function answerCorrect() {
  const i = correctIdx()
  if (i < 0) throw new Error('no correct option found for ' + readPuzzle().raw)
  clickEl(optButtons()[i])
}
// Click a wrong option (the one after the correct one). Returns its index so callers can
// inspect its state (the puzzle does not advance on a wrong answer).
function answerWrong() {
  const i = correctIdx()
  const opts = optButtons()
  const j = (i + 1) % opts.length
  clickEl(opts[j])
  return j
}

function pin({ minY = 1583, maxY = 10000, useJulian = true } = {}) {
  localStorage.clear()
  const s = useSettings.getState()
  s.resetSettings()
  s.setRandomFormat(false)
  s.setDateFormat('numeric-ymd')
  s.setUseJulian(useJulian)
  s.setMinY(minY)
  s.setMaxY(maxY)
}

// ── Batch 1: Day basics ───────────────────────────────────────────────────────
describe('Deduction — characterization (batch 1: Day basics)', () => {
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

  it('starts at a clean slate: Score 0/0, Streak 0/0, Accuracy —, Override + Back/Forward disabled', () => {
    mountApp()
    switchToDeduction()
    expect(readPuzzle().type).toBe('day') // Day is the default sub-mode
    expect(statValue('Score')).toBe('0/0')
    expect(statValue('Streak')).toBe('0/0')
    expect(statValue('Accuracy')).toBe('—')
    expect(isDisabled(ctrl('Override'))).toBe(true)
    expect(isDisabled(ctrl('<'))).toBe(true)
    expect(isDisabled(ctrl('>'))).toBe(true)
  })

  it('correct answer: Score 1/1, Accuracy 100.0%, Streak 1/1, advances (Back + Override enabled)', () => {
    mountApp()
    switchToDeduction()
    answerCorrect()
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Accuracy')).toBe('100.0%')
    expect(statValue('Streak')).toBe('1/1')
    expect(isDisabled(ctrl('<'))).toBe(false) // pushed to history
    expect(isDisabled(ctrl('Override'))).toBe(false) // Path 5 retro-flip available
  })

  it('wrong answer: Score 0/1, Accuracy 0.0%, Streak 0/0, marks wrong, does NOT advance, arms Override', () => {
    mountApp()
    switchToDeduction()
    const before = readPuzzle()
    const j = answerWrong()
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Accuracy')).toBe('0.0%')
    expect(statValue('Streak')).toBe('0/0')
    expect(optState(optButtons()[j])).toBe('wrong-latest')
    expect(readPuzzle().raw).toBe(before.raw) // same puzzle, no advance
    expect(isDisabled(ctrl('Override'))).toBe(false) // Path 3 armed
    expect(isDisabled(ctrl('<'))).toBe(true) // still-live wrong not pushed to history
  })

  it('Reveal: shows the correct option, counts as played (0/1), resets streak, locks the grid', () => {
    mountApp()
    switchToDeduction()
    const i = correctIdx()
    clickCtrl('Reveal')
    expect(optState(optButtons()[i])).toBe('correct')
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(isDisabled(optButtons()[i])).toBe(true) // grid locked
  })

  it('New after a correct answer advances to a fresh puzzle but keeps stats', () => {
    mountApp()
    switchToDeduction()
    answerCorrect()
    expect(statValue('Score')).toBe('1/1')
    clickCtrl('New')
    expect(statValue('Score')).toBe('1/1') // New does not reset stats
    for (const b of optButtons()) expect(optState(b)).toBe('idle') // fresh grid
  })
})

// ── Batch 2: Day live Override paths ───────────────────────────────────────────
describe('Deduction — characterization (batch 2: Day live Override)', () => {
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

  it('Path 5 (correct → Override): retro-flips the just-answered question to wrong (1/1 → 0/1, streak 0)', () => {
    mountApp()
    switchToDeduction()
    answerCorrect()
    expect(statValue('Score')).toBe('1/1')
    clickCtrl('Override')
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(isDisabled(ctrl('Override'))).toBe(true) // single-shot
  })

  it('Path 3 (wrong → Override): retroactively credits the wrong answer and advances (0/1 → 1/1)', () => {
    mountApp()
    switchToDeduction()
    answerWrong()
    expect(statValue('Score')).toBe('0/1')
    clickCtrl('Override')
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Streak')).toBe('1/1')
    expect(isDisabled(ctrl('<'))).toBe(false) // advanced → history has the credited entry
    expect(isDisabled(ctrl('Override'))).toBe(true)
  })
})

// ── Batch 3: Day Back/Forward + history Override paths ──────────────────────────
describe('Deduction — characterization (batch 3: Day Back/Forward + history Override)', () => {
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

  it('Back then Forward walks history, restores the answered state, leaves stats unchanged', () => {
    mountApp()
    switchToDeduction()
    const q1 = readPuzzle()
    answerCorrect() // 1/1, advance
    clickCtrl('<') // back to Q1
    expect(readPuzzle().raw).toBe(q1.raw)
    const q1Correct = correctIdx()
    expect(optState(optButtons()[q1Correct])).toBe('correct') // answered state restored
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(statValue('Score')).toBe('1/1') // browsing never changes stats
    expect(isDisabled(ctrl('<'))).toBe(true) // nothing older
    expect(isDisabled(ctrl('>'))).toBe(false) // can return to live
    clickCtrl('>') // forward to live
    expect(statValue('Score')).toBe('1/1')
    expect(isDisabled(ctrl('>'))).toBe(true) // at the live edge again
  })

  it('Path 1 (Back to a correct answer → Override): undoes the credit, marks it override-wrong (1/1 → 0/1)', () => {
    mountApp()
    switchToDeduction()
    answerCorrect() // 1/1, advance
    clickCtrl('<') // back to Q1
    expect(isDisabled(ctrl('Override'))).toBe(false)
    const i = correctIdx()
    clickCtrl('Override')
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(optState(optButtons()[i])).toBe('override-wrong')
  })

  it('Path 4 (wrong, then correct on same Q, then Override): credits the previous Q; live Q stays (timing off)', () => {
    mountApp()
    switchToDeduction()
    answerWrong() // 0/1
    answerCorrect() // late-correct: advances, still 0/1, arms pendingWrongOverride
    const q2 = readPuzzle()
    expect(statValue('Score')).toBe('0/1')
    clickCtrl('Override') // retroactively credits the previous (wrong-then-right) Q
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Streak')).toBe('1/1')
    expect(readPuzzle().raw).toBe(q2.raw) // timing off (Deduction default) → live Q does not advance
    expect(isDisabled(ctrl('Override'))).toBe(true)
  })
})

// ── Batch 4: Day Show Codes, streaks, Reset Stats ──────────────────────────────
describe('Deduction — characterization (batch 4: Day Show Codes, streaks, Reset Stats)', () => {
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

  it('Show Codes on a fresh question reveals the answer and counts a played miss (0/1)', () => {
    mountApp()
    switchToDeduction()
    const i = correctIdx()
    clickCtrl('Show Codes')
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(optState(optButtons()[i])).toBe('correct')
    expect(isDisabled(ctrl('Override'))).toBe(false) // burned → Path 3 available
  })

  it('consecutive correct answers build the streak; a wrong resets current but keeps best', () => {
    mountApp()
    switchToDeduction()
    answerCorrect() // 1/1, streak 1/1
    answerCorrect() // 2/2, streak 2/2
    expect(statValue('Score')).toBe('2/2')
    expect(statValue('Streak')).toBe('2/2')
    answerWrong() // wrong → played 3, good 2; streak 0, best 2
    expect(statValue('Score')).toBe('2/3')
    expect(statValue('Streak')).toBe('0/2')
  })

  it('Reset Stats clears stats and history and resets the grid', () => {
    mountApp()
    switchToDeduction()
    answerCorrect() // 1/1, history has one entry
    expect(isDisabled(ctrl('<'))).toBe(false)
    clickCtrl('Reset Stats') // Q2: first tap arms
    clickCtrl('Reset Stats?') // second tap confirms + clears
    expect(statValue('Score')).toBe('0/0')
    expect(statValue('Streak')).toBe('0/0')
    expect(isDisabled(ctrl('<'))).toBe(true) // history cleared
    for (const b of optButtons()) expect(optState(b)).toBe('idle') // fresh grid
  })
})

// ── Batch 5: Month + Year sub-modes + per-silo independence ─────────────────────
describe('Deduction — characterization (batch 5: Month + Year + silos)', () => {
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

  it('Month sub-mode: a correct box credits and advances (1/1)', () => {
    mountApp()
    switchToDeduction()
    clickCtrl('Month')
    expect(readPuzzle().type).toBe('month')
    answerCorrect()
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Accuracy')).toBe('100.0%')
    expect(statValue('Streak')).toBe('1/1')
    expect(isDisabled(ctrl('<'))).toBe(false)
  })

  it('Month sub-mode: a wrong box counts a miss and does not advance (0/1)', () => {
    mountApp()
    switchToDeduction()
    clickCtrl('Month')
    const before = readPuzzle()
    const j = answerWrong()
    expect(statValue('Score')).toBe('0/1')
    expect(statValue('Streak')).toBe('0/0')
    expect(optState(optButtons()[j])).toBe('wrong-latest')
    expect(readPuzzle().raw).toBe(before.raw)
    expect(isDisabled(ctrl('Override'))).toBe(false)
  })

  it('Year sub-mode: a correct year credits and advances (1/1)', () => {
    mountApp()
    switchToDeduction()
    clickCtrl('Year')
    expect(readPuzzle().type).toBe('year')
    answerCorrect()
    expect(statValue('Score')).toBe('1/1')
    expect(statValue('Streak')).toBe('1/1')
    expect(isDisabled(ctrl('<'))).toBe(false)
  })

  it('the three sub-modes keep independent stats (answering Day leaves Month/Year at 0/0)', () => {
    mountApp()
    switchToDeduction()
    answerCorrect() // Day → 1/1
    expect(statValue('Score')).toBe('1/1')
    clickCtrl('Month')
    expect(statValue('Score')).toBe('0/0') // Month silo untouched
    clickCtrl('Year')
    expect(statValue('Score')).toBe('0/0') // Year silo untouched
    clickCtrl('Day')
    expect(statValue('Score')).toBe('1/1') // Day silo preserved
  })
})

// ── Batch 6: 1582 special cases (Julian on) ────────────────────────────────────
describe('Deduction — characterization (batch 6: 1582 special cases)', () => {
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('Month "1582 Only": forces the 1582 split-calendar layout; the correct box still credits (1/1)', () => {
    vi.useFakeTimers()
    pin({ minY: 1581, maxY: 1583, useJulian: true })
    mountApp()
    switchToDeduction()
    clickCtrl('Month')
    clickCtrl('1582 Only')
    const p = readPuzzle()
    expect(p.Y).toBe(1582)
    answerCorrect()
    expect(statValue('Score')).toBe('1/1')
  })

  it('Year "Jul Cross": forces a 2-year window straddling Oct 15, 1582; the correct year credits (1/1)', () => {
    vi.useFakeTimers()
    pin({ minY: 1581, maxY: 1583, useJulian: true })
    mountApp()
    switchToDeduction()
    clickCtrl('Year')
    clickCtrl('Jul Cross')
    expect(optButtons().length).toBe(2) // N=2 across the calendar boundary
    answerCorrect()
    expect(statValue('Score')).toBe('1/1')
  })

  it('Day sub-mode in 1582 (Julian): the Julian-aware puzzle credits the correct day (1/1)', () => {
    vi.useFakeTimers()
    pin({ minY: 1582, maxY: 1582, useJulian: true })
    mountApp()
    switchToDeduction()
    const p = readPuzzle()
    expect(p.type).toBe('day')
    expect(p.Y).toBe(1582)
    answerCorrect()
    expect(statValue('Score')).toBe('1/1')
  })
})

// ── C2: deep cross-silo independence — full MID-STATE survives a silo round-trip ─────────────────
// Batch 5 pins independent STATS; this pins the rest of a silo's state machine: an armed Override
// (countedWrong), the wrong-mark on the grid, a back-browse position, and an OPEN codes panel must
// all survive switching to another silo, playing there, and returning — and the armed Override must
// still fire correctly afterwards. The silos are separate engine instances by construction; the
// realistic leak vectors are the SHARED chrome (the one flash pulse, the toggles, the active-eng
// wiring), so the assertion drives exactly that seam.
describe('Deduction — C2: a silo round-trip preserves browse + armed-override + codes state', () => {
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

  it('Day mid-state (browsing, codes open, wrong armed) is intact after playing Month', () => {
    mountApp()
    switchToDeduction()
    // Day silo: one credit, then a wrong on Q2 (arms Override), then browse back to Q1 + open codes.
    answerCorrect() // Day 1/1
    const j = answerWrong() // Day 1/2 — wrong-latest mark, Override armed
    expect(statValue('Score')).toBe('1/2')
    clickCtrl('<') // browse to Q1 (read-only)
    expect(screen.getByText('Q1')).toBeInTheDocument()
    clickCtrl('Show Codes') // read-only codes on the browsed entry
    expect(ctrl('Hide Codes')).toBeInTheDocument()
    expect(statValue('Score')).toBe('1/2') // no penalty while browsing
    // Detour: play the Month silo (its own credit), then return.
    clickCtrl('Month')
    expect(statValue('Score')).toBe('0/0')
    answerCorrect() // Month 1/1
    expect(statValue('Score')).toBe('1/1')
    clickCtrl('Day')
    // The Day silo is EXACTLY where it was left: browsing Q1 with its codes panel open…
    expect(statValue('Score')).toBe('1/2')
    expect(screen.getByText('Q1')).toBeInTheDocument()
    expect(ctrl('Hide Codes')).toBeInTheDocument()
    clickCtrl('Hide Codes')
    clickCtrl('>') // forward to the live wrong question
    expect(optState(optButtons()[j])).toBe('wrong-latest') // the wrong mark survived the detour
    // …and the armed Override still fires (Path 3): credits the wrong → 2/2.
    expect(isDisabled(ctrl('Override'))).toBe(false)
    clickCtrl('Override')
    expect(statValue('Score')).toBe('2/2')
    // The Month silo kept its own credit, untouched by Day's override.
    clickCtrl('Month')
    expect(statValue('Score')).toBe('1/1')
  })
})
