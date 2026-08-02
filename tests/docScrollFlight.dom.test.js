// @vitest-environment jsdom
//
// lib/docScrollFlight — the app-wide reading of "is the document mid-scroll, and did this scroll
// just START?", which is what Q8's mode-menu dismiss rule is built on.
//
// ⚠ WHY THIS SUITE WAS REWRITTEN (2026-08-02). Its first version pinned a `scrollend`-based
// mechanism: a document scroll raised a flag, a scrollend lowered it, and the suite's centrepiece
// was the LATCH — a sequence that never delivered its scrollend stranded the flag at true forever.
// That mechanism shipped and FAILED on the owner's iPhone, for a reason that is structural rather
// than a bug: the menu's own opening touch is what cancels the glide, so the boundary signal is
// PRODUCED BY the open instead of observed before it, and ~16ms later it armed the menu against the
// dying scroll the menu had just correctly refused to be dismissed by. The module header tells that
// story in full. The rule now reads the boundary from the GAP BETWEEN DOCUMENT SCROLL EVENTS, so
// this file pins that instead — and the latch section is gone because a gap reading CANNOT latch:
// it decays on its own the moment events stop, which is the first test below.
//
// What is pinned here, and why each one matters:
//   1. the flag is up while events keep arriving and comes down SCROLL_GAP_MS after the last one,
//      with nothing having to announce the end (the anti-latch property, now free);
//   2. a sequence stays one sequence no matter how long it runs — the reading decays on SILENCE,
//      never on total duration, which is what lets a menu opened mid-glide survive the whole glide;
//   3. the first event after a gap is a NEW sequence and the rest of it is not — the signal that
//      dismisses an open menu, read entirely from events that already happened, which is exactly
//      what the opening finger cannot retroactively rewrite;
//   4. document / documentElement scrolls count, element scrolls (the settings popover's inner
//      wrapper, the Lookup list) are not this module's business at all;
//   5. our own instant jumps still speak for themselves: scrollWindowTo declares the scroll over on
//      return, and the jump's own echo event is spent rather than read as fresh motion;
//   6. two structural guards: every instant window jump goes through the one door, and no src file
//      listens for `scrollend` any more.
// The one deliberate exception to 5 is the guide accordion's per-frame scroll writer, which is not
// a jump that places the page but the app RUNNING a scroll — its frames are precisely the in-flight
// state this module describes.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import {
  SCROLL_GAP_MS,
  isDocScrollInFlight,
  isNewDocScrollSequence,
  scrollWindowTo,
} from '../src/lib/docScrollFlight.js'

// A CONTROLLED CLOCK, and it has to be: the module asks performance.now() twice — when a scroll
// event arrives, and when something reads the flag — so owning that one function is owning the
// whole mechanism exactly. Real elapsed time is not an option here: a test that waited out 150ms of
// wall clock would be a slow test that still could not say which side of the boundary it landed on.
// The clock is monotonic for the whole FILE (module state is a singleton, so a clock that reset per
// test would put "now" behind a previous test's last event and read as in-flight).
let clock = 1_000_000
const tick = (ms) => {
  clock += ms
}
let nowSpy
const docScroll = () => document.dispatchEvent(new Event('scroll'))
// One frame of a live scroll. Momentum and CSSOM smooth scrolling were both measured at 15–18.5ms
// between events; 18.5ms is the largest gap ever observed INSIDE a sequence, and both numbers are
// used below, against a 150ms threshold.
const FRAME_MS = 16
const WORST_IN_SEQUENCE_GAP_MS = 18.5

beforeEach(() => {
  nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock)
  // Module state is a singleton for the whole file, so every test starts from a STATED baseline:
  // nothing in flight, nothing having just started, no jump echo outstanding. The first scroll
  // spends any claim a previous test left behind (and otherwise just starts a sequence); the second
  // is unambiguously a sequence start; the third is a continuation, which is what puts "a new
  // sequence just started" back down; then silence ends it.
  tick(10 * SCROLL_GAP_MS)
  docScroll()
  tick(10 * SCROLL_GAP_MS)
  docScroll()
  tick(FRAME_MS)
  docScroll()
  tick(10 * SCROLL_GAP_MS)
  expect(isDocScrollInFlight()).toBe(false)
  expect(isNewDocScrollSequence()).toBe(false)
})
afterEach(() => {
  nowSpy.mockRestore()
})

describe('docScrollFlight — the gap between scroll events IS the sequence boundary', () => {
  it('a scroll event raises the reading, and it comes down on its own exactly SCROLL_GAP_MS later', () => {
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    tick(SCROLL_GAP_MS - 1)
    expect(isDocScrollInFlight()).toBe(true) // still inside the gap
    tick(1)
    // …and out of it. Nothing told it the scroll was over: no scrollend, no timer, no rAF poll —
    // the three things this module is written NOT to depend on. Silence is the whole signal, which
    // is why the old mechanism's permanent latch has no equivalent here.
    expect(isDocScrollInFlight()).toBe(false)
  })

  it('a running sequence holds it up for as long as it runs — it decays on SILENCE, not duration', () => {
    docScroll()
    // 40 frames ≈ 640ms of momentum: more than four times the gap in TOTAL elapsed time, and the
    // reading must not weaken once. This is the property case A/B rest on — a menu opened during a
    // long glide has to survive the whole glide, not the first 150ms of it.
    for (let i = 0; i < 40; i++) {
      tick(FRAME_MS)
      docScroll()
      expect(isDocScrollInFlight()).toBe(true)
    }
    tick(WORST_IN_SEQUENCE_GAP_MS) // the widest gap ever measured inside a live sequence
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    tick(SCROLL_GAP_MS) // the finger lifted and the glide stopped: the events simply stop
    expect(isDocScrollInFlight()).toBe(false)
  })

  it('the first event after a gap STARTS a sequence; every event that follows continues it', () => {
    docScroll()
    expect(isNewDocScrollSequence()).toBe(true)
    tick(FRAME_MS)
    docScroll()
    expect(isNewDocScrollSequence()).toBe(false)
    tick(WORST_IN_SEQUENCE_GAP_MS)
    docScroll()
    expect(isNewDocScrollSequence()).toBe(false)
    // Right up to the boundary it is still the same sequence — 8x the worst real gap, so nothing a
    // live scroll does can trip this early.
    tick(SCROLL_GAP_MS - 1)
    docScroll()
    expect(isNewDocScrollSequence()).toBe(false)
    // Silence, then a fresh gesture: that is a new sequence, and it stays readable as one until the
    // next event arrives (the open menu's scroll listener reads it during this very event).
    tick(SCROLL_GAP_MS)
    docScroll()
    expect(isNewDocScrollSequence()).toBe(true)
  })

  it('a scrollend event is not an input at all — dispatching one changes neither answer', () => {
    docScroll()
    tick(FRAME_MS)
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    expect(isNewDocScrollSequence()).toBe(false)
    // ⚠ This is the event the owner's iPhone fires when the finger opening the menu CANCELS the
    // glide — ~16ms after the open, describing a scroll that is still delivering events. The old
    // mechanism read it as the sequence boundary, armed on it, and the glide's next frame closed
    // the menu. Here it is not an input, so the sequence carries on being one sequence.
    tick(FRAME_MS)
    document.dispatchEvent(new Event('scrollend'))
    document.documentElement.dispatchEvent(new Event('scrollend'))
    expect(isDocScrollInFlight()).toBe(true)
    tick(FRAME_MS)
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    expect(isNewDocScrollSequence()).toBe(false) // not split in two by it, either
  })

  it('accepts a documentElement-targeted scroll too (WebKit) and ignores ELEMENT scrolls', () => {
    document.documentElement.dispatchEvent(new Event('scroll'))
    expect(isDocScrollInFlight()).toBe(true)
    expect(isNewDocScrollSequence()).toBe(true)

    // The settings popover's inner wrapper, the Lookup list: not the document, not this module's
    // business. An element scroll must not keep the document's sequence alive…
    const el = document.createElement('div')
    document.body.appendChild(el)
    tick(FRAME_MS)
    el.dispatchEvent(new Event('scroll'))
    // …so at 151ms after the LAST DOCUMENT event the sequence is over, even though the element
    // scroll landed only 135ms ago. (If element scrolls were recorded, this would still read true.)
    tick(SCROLL_GAP_MS - FRAME_MS + 1)
    expect(isDocScrollInFlight()).toBe(false)
    // …nor start one of its own.
    el.dispatchEvent(new Event('scroll'))
    expect(isDocScrollInFlight()).toBe(false)
    el.remove()
  })

  it('scrollWindowTo declares the scroll over the moment it returns', () => {
    const spy = vi.spyOn(window, 'scrollTo')
    docScroll() // a sequence is running (say, iOS's status-bar glide)
    expect(isDocScrollInFlight()).toBe(true)
    scrollWindowTo(0, 0) // …and the app jumps the page out from under it
    // An instant scroll is FINISHED the moment scrollTo returns, so the module says so instead of
    // waiting out a gap to infer it. Without this the app's own jump would read as in flight for
    // another 150ms, and a menu opened inside that window would refuse to arm.
    expect(isDocScrollInFlight()).toBe(false)
    expect(isNewDocScrollSequence()).toBe(false)
    // It really is the jump, not a side effect: same call, same arguments.
    expect(spy).toHaveBeenCalledWith(0, 0)
    scrollWindowTo(0, 480)
    expect(spy).toHaveBeenLastCalledWith(0, 480)
    expect(isDocScrollInFlight()).toBe(false)
    spy.mockRestore()
  })
})

// ── The jump's own echo ────────────────────────────────────────────────────────────────────────
// A jump that MOVES the page makes the engine dispatch a document scroll for it, a task later. That
// event describes a scroll which was over before it was dispatched, and reading it as live motion
// would be wrong twice over: it would put the flag back up, and — the part that matters more now —
// it would read as the FIRST EVENT OF A NEW SEQUENCE, which is precisely the signal that dismisses
// an open menu. jsdom's window.scrollTo neither moves the page nor fires an event, so the position
// is faked (the module reads scrollX/scrollY to decide whether an echo is even coming) and the echo
// is dispatched by hand — the honest shape of what a real engine does.
describe('docScrollFlight — a jump is not re-read as motion by its own scroll event', () => {
  let pos = { x: 0, y: 0 }
  let spy
  beforeEach(() => {
    pos = { x: 0, y: 0 }
    Object.defineProperty(window, 'scrollX', { configurable: true, get: () => pos.x })
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => pos.y })
    spy = vi.spyOn(window, 'scrollTo').mockImplementation((x, y) => {
      pos = { x, y }
    })
  })
  afterEach(() => {
    spy.mockRestore()
    delete window.scrollX
    delete window.scrollY
    // Any echo claim this test left outstanding is spent by the next test's baseline scrolls.
  })

  it('spends the echo instead of re-raising the flag, and reads the NEXT scroll normally', () => {
    pos = { x: 0, y: 900 } // a status-bar glide is running, well down the page
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    scrollWindowTo(0, 0) // …and the app jumps the page out from under it
    expect(isDocScrollInFlight()).toBe(false)
    // The engine now delivers the jump's own scroll event, a task later.
    tick(4)
    docScroll()
    expect(isDocScrollInFlight()).toBe(false)
    expect(isNewDocScrollSequence()).toBe(false) // and not a new gesture either — nothing happened
    // Exactly one event is spoken for: a genuine scroll right after it reads normally, in both
    // answers (an open menu is dismissed by this one).
    tick(FRAME_MS)
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    expect(isNewDocScrollSequence()).toBe(true)
  })

  it('claims nothing when the jump did not move the page (no event is coming)', () => {
    // Already at the top: scrollTo fires no scroll event at all, so an outstanding claim would be
    // spent on the user's next real gesture — and a menu open at that moment would miss its dismiss.
    scrollWindowTo(0, 0)
    expect(isDocScrollInFlight()).toBe(false)
    tick(FRAME_MS)
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    expect(isNewDocScrollSequence()).toBe(true)
  })

  it('two jumps in one rendering update still spend exactly one echo', () => {
    // A scroll event is queued per TARGET per rendering update, so two synchronous jumps produce
    // one event between them — one claim is the right number, and a claim per jump would eat the
    // user's next real scroll. (Jumps in separate updates each get their own echo, and each
    // scrollWindowTo re-states the claim before that echo arrives, so they cost one apiece.)
    pos = { x: 0, y: 900 }
    docScroll()
    scrollWindowTo(0, 400)
    scrollWindowTo(0, 0)
    expect(isDocScrollInFlight()).toBe(false)
    tick(4)
    docScroll() // the coalesced echo
    expect(isDocScrollInFlight()).toBe(false)
    tick(FRAME_MS)
    docScroll() // and the reading is live again immediately after it
    expect(isDocScrollInFlight()).toBe(true)
  })
})

// ── The call-site guards ───────────────────────────────────────────────────────────────────────
// The jump rule above only holds while every instant jump actually goes through the door. This is
// what makes that structural instead of a convention: adding `window.scrollTo(...)` anywhere in src
// fails the build, and the two allowed files each say in their own header why they are allowed.
// The second guard is the deletion: `scrollend` is named all over the comments as the thing NOT to
// go back to, and this fails the build if it ever returns as code.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (file) => relative(root, file).replace(/\\/g, '/')
const srcFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? srcFiles(join(dir, e.name))
      : /\.(ts|tsx|js|jsx)$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  )
// docScrollFlight IS the door; GuidePage's writer is the animation, not a jump (see both headers).
const ALLOWED = ['src/lib/docScrollFlight.ts', 'src/components/GuidePage.tsx']
// Comments discuss window.scrollTo and scrollend by name all over this codebase — strip them before
// scanning so the guards fire on CODE only. A line comment is cut at its `//` UNLESS a colon
// precedes it, so the https:// URLs in main.tsx keep their line (truncating those could hide a real
// call).
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
// One scanner, two guards: report every CODE line in src matching `pattern`, skipping the files
// this particular rule exempts (the scrollend ban exempts none).
const scanSrc = (pattern, message, allowed = []) =>
  srcFiles(join(root, 'src')).flatMap((file) =>
    allowed.includes(rel(file))
      ? []
      : stripComments(readFileSync(file, 'utf8'))
          .split('\n')
          .flatMap((line, i) => (pattern.test(line) ? [`${rel(file)}:${i + 1} — ${message}`] : [])),
  )
const bareCalls = scanSrc(
  /window\.scrollTo\s*\(/,
  'use scrollWindowTo (lib/docScrollFlight)',
  ALLOWED,
)
const scrollEndCode = scanSrc(
  /scrollend/i,
  'the scrollend boundary is deleted — do not bring it back',
)

describe('docScrollFlight — the structural guards', () => {
  it('scans the real tree (main.tsx present — the guards cannot go blind)', () => {
    const names = srcFiles(join(root, 'src')).map(rel)
    expect(names).toContain('src/main.tsx')
    expect(names).toContain(ALLOWED[0])
    expect(names).toContain(ALLOWED[1])
  })

  it('finds no bare window.scrollTo outside the door and the accordion writer', () => {
    expect(bareCalls).toEqual([])
  })

  it('finds no scrollend in CODE anywhere in src — the deleted boundary stays deleted', () => {
    // It failed on a real iPhone for a structural reason (module header), and it passed in Chromium
    // the whole time, so no test of a scrollend rule could have caught it. Deletion is the fix, and
    // this is what keeps it deleted: the word survives only in the comments that explain the ban.
    expect(scrollEndCode).toEqual([])
  })

  it('main.tsx makes its jumps through scrollWindowTo (all four of them)', () => {
    // Entering guide mode, leaving it, the pageshow fresh-load reset (round 11's Q3 gated out the
    // BFCache half of that event, but the reload half still jumps), and Full Reset — the sites the
    // queue entry named as able to abort a scroll mid-glide.
    const main = stripComments(readFileSync(join(root, 'src/main.tsx'), 'utf8'))
    expect([...main.matchAll(/scrollWindowTo\s*\(/g)].length).toBeGreaterThanOrEqual(4)
  })
})
