// @vitest-environment jsdom
// solveClock — "is the player being timed right now?" (lib/solveClock), the one definition the app's
// own interruptions wait on: the storage warning's popup, and the measurement of the device's limit
// (store/storageUsage).
//
// What is pinned: the engine's half (engine/useGameEngine — a question in play, not judged yet,
// whose first answer would record a time), and each mode's half (what "in play" means on its
// screen): Classic and Deduction while they are the page shown; Flash from Begin; Blitz while a
// round is under way; MoX while a run is under way and its date is on screen (One-by-One hides the
// next one until Continue).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, renderHook, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { useGameEngine } from '../src/engine/useGameEngine.js'
import { isSolveClockRunning, onSolveClocksStopped } from '../src/lib/solveClock.js'
import { useSettings } from '../src/store/settings.js'
import { useModePrefs } from '../src/store/modePrefs.js'
import { wday } from '../src/lib/calendar.js'
import { DAY } from '../src/lib/format.js'
import { App } from '../src/main.jsx'
import { resetAppState } from './helpers/settingsPanel.jsx'

const genDate = () => ({ y: 2024, m: 1, d: 1, _fmt: 'numeric-ymd', _jul: false })
const RIGHT = wday(2024, 1, 1)
const WRONG = (RIGHT + 1) % 7
const timed = {
  genDate,
  minY: 1583,
  maxY: 10000,
  useJulian: false,
  saveStats: true,
  timingOff: false,
  inPlay: () => true,
}

afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
  vi.useRealTimers()
})

describe('the engine: a clock runs while a question in play is unjudged and its time would be kept', () => {
  it('runs from the question appearing, through a right answer (the next question is timed too)', () => {
    const { result } = renderHook(() => useGameEngine(timed))
    expect(isSolveClockRunning()).toBe(true)
    act(() => result.current.answer(RIGHT))
    expect(isSolveClockRunning()).toBe(true)
  })

  it.each([
    ['a wrong answer', (eng) => eng.answer(WRONG)],
    ['Reveal', (eng) => eng.reveal()],
    ['Show Codes', (eng) => eng.showCodes(true)],
  ])(
    'stops at the first judgement — %s — and starts again with the next question',
    (_name, judge) => {
      const { result } = renderHook(() => useGameEngine(timed))
      const stopped = vi.fn()
      const undo = onSolveClocksStopped(stopped)
      act(() => judge(result.current))
      expect(isSolveClockRunning()).toBe(false)
      expect(stopped).toHaveBeenCalledTimes(1)
      act(() => result.current.doNew())
      expect(isSolveClockRunning()).toBe(true)
      undo()
    },
  )

  it.each([
    ['timing is hidden', { timingOff: true }],
    ['Save Stats is off', { saveStats: false }],
    ['the question is not in play', { inPlay: () => false }],
  ])('does not run when %s', (_name, over) => {
    renderHook(() => useGameEngine({ ...timed, ...over }))
    expect(isSolveClockRunning()).toBe(false)
  })

  it('a screen going away stops its clock, and says so', () => {
    const { unmount } = renderHook(() => useGameEngine(timed))
    const stopped = vi.fn()
    const undo = onSolveClocksStopped(stopped)
    unmount()
    expect(isSolveClockRunning()).toBe(false)
    expect(stopped).toHaveBeenCalledTimes(1)
    undo()
    renderHook(() => useGameEngine(timed)).unmount()
    expect(stopped).toHaveBeenCalledTimes(1) // no longer listening
  })
})

describe('each mode: what "in play" means on its screen', () => {
  const mountApp = () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    return render(<App />)
  }
  const key = (k) => act(() => void fireEvent.keyDown(window, { key: k }))
  const click = (name) => act(() => void fireEvent.click(screen.getByRole('button', { name })))
  // The date on screen (numeric y-m-d, pinned below) — the one visible leaf that spells one.
  const shownDate = () => {
    const leaf = [...document.querySelectorAll('div, span')].find(
      (e) =>
        e.children.length === 0 &&
        /^-?\d+-\d+-\d+$/.test(e.textContent.trim()) &&
        e.offsetParent !== null,
    )
    const [y, m, d] = leaf.textContent.trim().split('-').map(Number)
    return { y, m, d }
  }
  const answerRight = () => {
    const { y, m, d } = shownDate()
    click(DAY[wday(y, m, d)])
  }
  const answerWrong = () => {
    const { y, m, d } = shownDate()
    click(DAY[(wday(y, m, d) + 1) % 7])
  }

  beforeEach(() => {
    resetAppState()
    const s = useSettings.getState()
    s.setRandomFormat(false)
    s.setDateFormat('numeric-ymd')
    s.setMinY(1583)
    s.setMaxY(10000)
  })

  it('Classic: only with its timing shown, only while it is the page on screen', () => {
    mountApp()
    expect(isSolveClockRunning()).toBe(false) // timing is hidden out of the box
    act(() => useModePrefs.getState().setClassicTimingOff(false))
    expect(isSolveClockRunning()).toBe(true)
    key('L') // Lookup: the question is still there, and nobody is being timed on it
    expect(isSolveClockRunning()).toBe(false)
    key('H')
    expect(isSolveClockRunning()).toBe(false)
    key('K')
    expect(isSolveClockRunning()).toBe(true)
    answerWrong()
    expect(isSolveClockRunning()).toBe(false)
  })

  it('Deduction: the puzzle type on screen, with its timing shown', () => {
    act(() => useModePrefs.getState().setDedTimingOff(false))
    mountApp()
    expect(isSolveClockRunning()).toBe(false) // Classic is the page shown, and it is untimed
    key('D')
    expect(isSolveClockRunning()).toBe(true)
    key('K')
    expect(isSolveClockRunning()).toBe(false)
  })

  it('Blitz: from Begin until the round ends — not on the idle screen', () => {
    vi.useFakeTimers()
    mountApp()
    key('B')
    expect(isSolveClockRunning()).toBe(false)
    click('Begin')
    expect(isSolveClockRunning()).toBe(true)
    answerRight()
    expect(isSolveClockRunning()).toBe(true)
    click('Reset')
    expect(isSolveClockRunning()).toBe(false)
  })

  it('Flash: from Begin, with its timing shown — not while it idles on the dash', () => {
    vi.useFakeTimers()
    act(() => useModePrefs.getState().setFlashTimingOff(false))
    mountApp()
    key('F')
    expect(isSolveClockRunning()).toBe(false)
    click('Begin')
    expect(isSolveClockRunning()).toBe(true)
  })

  it('MoX One-by-One: while a date is on screen — not while the next one waits for Continue', () => {
    vi.useFakeTimers()
    mountApp()
    key('A')
    click('One-by-One')
    expect(isSolveClockRunning()).toBe(false)
    click('Begin')
    expect(isSolveClockRunning()).toBe(true)
    answerRight() // the next date is loaded, and hidden
    expect(isSolveClockRunning()).toBe(false)
    click('Continue')
    expect(isSolveClockRunning()).toBe(true)
  })
})
