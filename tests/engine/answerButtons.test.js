// Unit tests for the engine's pure answer-button helpers.
import { describe, it, expect } from 'vitest'
import {
  computeHasCredit,
  markBtns,
  mkBtnsWithCorrect,
  greenOnMiss,
} from '../../src/engine/answerButtons.js'

describe('computeHasCredit', () => {
  it('is false for empty state', () => {
    expect(computeHasCredit({})).toBe(false)
    expect(computeHasCredit(null)).toBe(false)
  })
  it('is true only when a correct exists with no lingering wrongs', () => {
    expect(computeHasCredit({ 0: 'correct' })).toBe(true)
    expect(computeHasCredit({ 3: 'wrong-latest' })).toBe(false)
    expect(computeHasCredit({ 0: 'correct', 1: 'wrong-prev' })).toBe(false)
    expect(computeHasCredit({ 2: 'wrong-prev' })).toBe(false)
  })
})

describe('markBtns / mkBtnsWithCorrect', () => {
  it('sets the target index and demotes a prior wrong-latest to wrong-prev', () => {
    expect(markBtns({ 0: 'wrong-latest' }, 2, 'correct')).toEqual({ 0: 'wrong-prev', 2: 'correct' })
  })
  it('does not mutate the input', () => {
    const input = { 0: 'wrong-latest' }
    markBtns(input, 1, 'correct')
    expect(input).toEqual({ 0: 'wrong-latest' })
  })
  it('mkBtnsWithCorrect marks the index correct', () => {
    expect(mkBtnsWithCorrect({ 1: 'wrong-latest' }, 3)).toEqual({ 1: 'wrong-prev', 3: 'correct' })
  })
})

describe('greenOnMiss', () => {
  it('returns the very same grid when it already has a green, or has no wrong', () => {
    const credited = { 1: 'correct' }
    expect(greenOnMiss(credited, 4)).toBe(credited)
    const shown = { 1: 'correct', 2: 'wrong-prev' }
    expect(greenOnMiss(shown, 4)).toBe(shown)
    const empty = {}
    expect(greenOnMiss(empty, 4)).toBe(empty)
    const overridden = { 5: 'override-wrong' }
    expect(greenOnMiss(overridden, 5)).toBe(overridden)
  })
  it('puts the green on the index it is GIVEN for a wrong-only grid, dimming the newest wrong', () => {
    const input = { 3: 'wrong-latest', 6: 'wrong-prev' }
    expect(greenOnMiss(input, 1)).toEqual({ 1: 'correct', 3: 'wrong-prev', 6: 'wrong-prev' })
    expect(input).toEqual({ 3: 'wrong-latest', 6: 'wrong-prev' }) // not mutated
  })
  it('leaves a grid alone when there is no answer to mark (a puzzle whose answer is not an option)', () => {
    const input = { 0: 'wrong-latest' }
    expect(greenOnMiss(input, -1)).toBe(input)
  })
})
