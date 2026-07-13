// commitSliderText — the tap-to-type slider editors' pure commit math (Round-2).
//
// One pipeline (parse → convert to internal units → snap to the slider's grid → clamp into
// range; null = revert), exercised here under all three real timer configs. The DOM wiring
// (tap → input, blur/Enter/Escape) is covered in tests/sliderValueEditor.dom.test.jsx; the
// on-screen tap-target feel is on-device per the standing lesson.
import { describe, it, expect } from 'vitest'
import { commitSliderText } from '../src/lib/sliderValue.js'

// The three production configs (components/SliderValueEditor call sites in main.tsx).
const FLASH = { min: 100, max: 5000, snap: 100, fromText: (n) => n * 1000 } // types SECONDS, stores ms
const ROUND = { min: 10, max: 300, snap: 5 } // whole seconds
const PER_Q = { min: 1, max: 30, snap: 0.5 } // half-second grid

describe('commitSliderText — Flash (seconds text → ms, snap 100ms, clamp 100–5000)', () => {
  it('round-trips "2.5" → 2500ms (the user never sees milliseconds)', () => {
    expect(commitSliderText('2.5', FLASH)).toBe(2500)
    expect(commitSliderText('0.5', FLASH)).toBe(500)
    expect(commitSliderText('2', FLASH)).toBe(2000)
  })
  it('a comma decimal separator parses like a dot (comma-locale keypads only offer ",")', () => {
    expect(commitSliderText('2,5', FLASH)).toBe(2500) // NOT 25s→clamped — the German-keypad case
    expect(commitSliderText('0,5', FLASH)).toBe(500)
    expect(commitSliderText('7,5', PER_Q)).toBe(7.5)
  })
  it('snaps off-grid seconds to the 100ms grid', () => {
    expect(commitSliderText('2.34', FLASH)).toBe(2300)
    expect(commitSliderText('2.35', FLASH)).toBe(2400) // half rounds up
  })
  it('clamps beyond the range', () => {
    expect(commitSliderText('9.9', FLASH)).toBe(5000)
    expect(commitSliderText('0.01', FLASH)).toBe(100) // 10ms snaps to 0 then clamps up to min
  })
})

describe('commitSliderText — Blitz per-round (snap 5s, clamp 10–300)', () => {
  it('snaps typed values to the 5-second grid', () => {
    expect(commitSliderText('63', ROUND)).toBe(65) // 63 → nearest 5 = 65
    expect(commitSliderText('62', ROUND)).toBe(60)
    expect(commitSliderText('90', ROUND)).toBe(90) // on-grid passes through
  })
  it('clamps beyond the range (after snapping)', () => {
    expect(commitSliderText('301', ROUND)).toBe(300)
    expect(commitSliderText('3', ROUND)).toBe(10)
  })
})

describe('commitSliderText — Blitz per-question (snap 0.5s, clamp 1–30)', () => {
  it('keeps half-second values exact and snaps the rest', () => {
    expect(commitSliderText('7.5', PER_Q)).toBe(7.5)
    expect(commitSliderText('7.3', PER_Q)).toBe(7.5) // 14.6 grid steps → 15 → 7.5 (no float dust)
    expect(commitSliderText('7.2', PER_Q)).toBe(7)
  })
  it('clamps beyond the range', () => {
    expect(commitSliderText('45', PER_Q)).toBe(30)
    expect(commitSliderText('0.2', PER_Q)).toBe(1) // snaps to 0, clamps up to min
  })
})

describe('commitSliderText — nothing committable returns null (the caller reverts)', () => {
  it('empty, bare dot/comma, and non-numeric text', () => {
    expect(commitSliderText('', FLASH)).toBeNull()
    expect(commitSliderText('.', FLASH)).toBeNull()
    expect(commitSliderText(',', FLASH)).toBeNull()
    expect(commitSliderText('abc', ROUND)).toBeNull()
  })
})
