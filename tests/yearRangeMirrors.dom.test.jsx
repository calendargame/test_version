// @vitest-environment jsdom
//
// useYearRangeMirrors — THE SEED, and only the seed (round 15, defect D8).
//
// ★ WHY THIS IS A HOOK-LEVEL FILE AND NOT ANOTHER CASE IN THE BEHAVIOUR NET. The thing it pins is
// visible for exactly ONE RENDER. The two mirrors initialise from the store, and the store→text
// sync effects below them then write the same value again on mount — so by the time any DOM query
// can run, the right value is on screen whether the seed was correct or not. Testing Library
// flushes effects inside its own act(), so a full-App case cannot see the difference at all: with
// the old factory literals ('1' / '10000') every settings and year-range case stayed green, which
// is exactly why round 15 shipped the fix unpinned. The only seam that can tell the two apart is
// the first committed render, and reaching it means calling the hook directly.
//
// ★ WHAT BREAKS IF THE SEED GOES BACK. Round 15's first change made App's settingsAtDefaults
// compare both mirror strings, and the ⚙ gear draws that answer while the panel is CLOSED. So for a
// user whose saved defaults hold, say, 1900–2100, mirrors seeded to the factory literals disagree
// with a store that is exactly at its defaults — and the gear's violet "modified" bar paints for
// one frame on every cold boot, on a launch state that has changed nothing. The seed is not a
// tidy-up; it is what makes that change correct.
//
// The commits, the clamps, the focus guard and the survives-a-reopen quirk all belong to the
// behaviour net (tests/settingsPanel.yearRange.dom), which drives them through the real panel and
// names no module. Nothing here duplicates one of those.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useLayoutEffect, useRef } from 'react'
import { useYearRangeMirrors } from '../src/components/useYearRangeMirrors.js'

// The probe reports the mirrors as of the FIRST COMMIT. useLayoutEffect is the whole trick: within
// one commit React runs layout effects before passive ones, and the hook's two store→text syncs are
// passive — so this reads the seeded values in the window before they can be overwritten. A [] dep
// list pins it to the first render's closure, so a later re-render cannot rewrite the answer.
function Probe({ minY, maxY, firstCommit }) {
  const minInputRef = useRef(null)
  const maxInputRef = useRef(null)
  const yearRange = useYearRangeMirrors(
    minY,
    maxY,
    () => {},
    () => {},
    minInputRef,
    maxInputRef,
  )
  useLayoutEffect(() => {
    firstCommit.push([yearRange.min.value, yearRange.max.value])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the FIRST render's values, deliberately
  }, [])
  return (
    <>
      <input ref={minInputRef} readOnly value={yearRange.min.value} aria-label="min" />
      <input ref={maxInputRef} readOnly value={yearRange.max.value} aria-label="max" />
    </>
  )
}

afterEach(cleanup)

describe('useYearRangeMirrors — the boxes open on the STORED range, not on the factory literals', () => {
  it('a non-default range is already in both boxes on the first commit', () => {
    // The literals this replaced were '1' and '10000'. Both values below are deliberately neither,
    // so a regression cannot pass by coincidence at either end.
    const firstCommit = []
    render(<Probe minY={1900} maxY={2100} firstCommit={firstCommit} />)
    expect(firstCommit).toEqual([['1900', '2100']])
  })

  it('…and the sync effects agree with the seed rather than correcting it', () => {
    // The other half, and the reason the seed is spelled String(minY) and not anything cleverer:
    // after the passive effects have run the boxes must read the same thing they were seeded with.
    // A seed that disagreed with the effects would merely move the one-frame flash, not remove it.
    const firstCommit = []
    const { getByLabelText } = render(<Probe minY={1900} maxY={2100} firstCommit={firstCommit} />)
    expect(getByLabelText('min').value).toBe('1900')
    expect(getByLabelText('max').value).toBe('2100')
  })

  it('the factory range still opens on the factory years — the seed is the store, whatever it holds', () => {
    // Guards against "fixing" this with the old literals restored under a condition: the assertion
    // above is about a non-default range, and this one proves the rule is not special-cased to it.
    const firstCommit = []
    render(<Probe minY={1} maxY={10000} firstCommit={firstCommit} />)
    expect(firstCommit).toEqual([['1', '10000']])
  })
})
