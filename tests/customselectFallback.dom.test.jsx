// @vitest-environment jsdom
//
// CustomSelect on an engine with NO `scrollend` — the Q8 fallback path.
//
// Without a scroll-sequence boundary there is no way to tell "a scroll that was already gliding
// when you opened the menu" from "a scroll you just started", so the panel refuses to guess: it
// opens UNARMED and stays open until a fresh scroll GESTURE — a wheel or a key — says new input
// happened. That is the deliberate trade the queue entry specified: those engines lose the
// status-bar-tap dismissal (which sends the page no input at all) and a swipe that begins INSIDE
// the open panel, but they can never dismiss a menu the moment the user opens it, which is the
// bug being fixed. A swipe OUTSIDE the panel already closes it via the click-outside listener.
//
// jsdom reports scrollend support (tests/docScrollFlight pins that), so the capability is mocked
// at the module that owns it rather than by deleting a global — which is also the honest shape:
// SCROLLEND_SUPPORTED is the one thing the component branches on.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import CustomSelect from '../src/components/CustomSelect.jsx'

vi.mock('../src/lib/docScrollFlight.js', () => ({
  SCROLLEND_SUPPORTED: false,
  // Unreachable while SCROLLEND_SUPPORTED is false — and returning the value that WOULD arm the
  // panel is the point: if the component ever stopped gating on the flag, these tests fail.
  isDocScrollInFlight: () => false,
  isDocumentScroll: (e) => e.target === document || e.target === document.documentElement,
  scrollWindowTo: (x, y) => window.scrollTo(x, y),
}))

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

const open = () => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  render(<CustomSelect value="b" onChange={() => {}} options={OPTIONS} ariaLabel="Test" />)
  const trigger = screen.getByRole('button', { name: 'Test' })
  fireEvent.click(trigger)
  expect(screen.queryAllByRole('option').length).toBe(3)
  return trigger
}
const optionCount = () => screen.queryAllByRole('option').length

describe('CustomSelect — no-scrollend fallback (arms on a gesture, never on open)', () => {
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('does NOT dismiss on a document scroll it was never armed for', () => {
    open()
    act(() => {
      fireEvent.scroll(document)
      fireEvent.scroll(document)
    })
    expect(optionCount()).toBe(3) // case A/B held, at the cost of case D
  })

  it('a wheel arms it — the scroll that follows dismisses', () => {
    const trigger = open()
    act(() => {
      fireEvent.wheel(window)
    })
    expect(optionCount()).toBe(3) // arming alone changes nothing…
    act(() => {
      fireEvent.scroll(document)
    })
    expect(optionCount()).toBe(0) // …the scroll it authorises does
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('a keydown arms it too (Space / PageDown / arrows all scroll the page)', () => {
    open()
    act(() => {
      fireEvent.keyDown(window, { key: 'PageDown' })
    })
    act(() => {
      fireEvent.scroll(document)
    })
    expect(optionCount()).toBe(0)
  })

  it('an ELEMENT scroll after a gesture still does nothing (the dismiss is document-only)', () => {
    open()
    const scroller = document.createElement('div')
    document.body.appendChild(scroller)
    act(() => {
      fireEvent.wheel(window)
      fireEvent.scroll(scroller)
    })
    expect(optionCount()).toBe(3)
    scroller.remove()
  })
})
