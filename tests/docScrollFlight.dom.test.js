// @vitest-environment jsdom
//
// lib/docScrollFlight — the app-wide "is the document mid-scroll?" flag that Q8's dismiss rule
// reads, and the LATCH question the queue entry demanded be settled before the fix was written.
//
// THE LATCH, settled. Two research lanes disagreed about whether an always-on scrollend tracker
// can stick at true; one had measured a smooth scroll ABORTED by an instant scrollTo never
// delivering its scrollend. This suite pins both halves as facts about OUR code rather than about
// any one engine:
//   1. the mechanism is real and unavoidable — a scroll sequence that never delivers a scrollend
//      DOES strand the flag at true, permanently, and nothing inside the tracker could ever know.
//      (No timeout, no rAF poll: both were killed on measurement. See the module header.)
//   2. so the app never produces one. Every INSTANT window jump it makes goes through
//      scrollWindowTo, which lowers the flag itself — not as a guess about what the engine did,
//      but because an instant scroll is finished the moment scrollTo returns. The last test here
//      is the guard that keeps it that way: a future bare window.scrollTo anywhere in src fails
//      the build.
//   3. and the jump's OWN scroll event does not undo that. A jump that moves the page is echoed by
//      a document scroll one task later; if that echo raised the flag again, coming back down would
//      rest on a scrollend for exactly the aborted sequence point 1 says may never send one. The
//      second describe below pins the echo being spent rather than obeyed.
// The one deliberate exception is the guide accordion's per-frame scroll writer, which is not a
// jump that places the page but the app RUNNING a scroll — its frames are exactly the in-flight
// state the flag describes.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import {
  SCROLLEND_SUPPORTED,
  isDocScrollInFlight,
  scrollWindowTo,
} from '../src/lib/docScrollFlight.js'

const docScroll = () => document.dispatchEvent(new Event('scroll'))
const docScrollEnd = () => document.dispatchEvent(new Event('scrollend'))

describe('docScrollFlight — the in-flight flag', () => {
  beforeEach(() => {
    // Module state is a singleton for the whole file; start every test from "nothing moving" AND
    // with no jump echo outstanding. The scroll spends any claim a previous test left (and
    // otherwise just raises the flag), the scrollend then lowers it either way.
    docScroll()
    docScrollEnd()
  })

  it('jsdom reports scrollend support, so these tests exercise the real tracker', () => {
    // If this ever flips, the tracker installs nothing and every assertion below would pass
    // vacuously — pin it so the suite can't go quietly blind.
    expect(SCROLLEND_SUPPORTED).toBe(true)
    expect('onscrollend' in window).toBe(true)
  })

  it('a document scroll raises the flag and its scrollend lowers it', () => {
    expect(isDocScrollInFlight()).toBe(false)
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    docScroll() // still the same sequence
    expect(isDocScrollInFlight()).toBe(true)
    docScrollEnd()
    expect(isDocScrollInFlight()).toBe(false)
  })

  it('accepts a documentElement-targeted scroll too (WebKit) and ignores ELEMENT scrolls', () => {
    document.documentElement.dispatchEvent(new Event('scroll'))
    expect(isDocScrollInFlight()).toBe(true)
    document.documentElement.dispatchEvent(new Event('scrollend'))
    expect(isDocScrollInFlight()).toBe(false)

    // The settings popover's inner wrapper, the Lookup list: not the document, not this flag's
    // business. An element scroll must neither raise it…
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.dispatchEvent(new Event('scroll'))
    expect(isDocScrollInFlight()).toBe(false)
    // …nor lower one that a real document scroll raised.
    docScroll()
    el.dispatchEvent(new Event('scrollend'))
    expect(isDocScrollInFlight()).toBe(true)
    el.remove()
  })

  it('LATCHES on a scroll sequence that never delivers a scrollend — the failure the fix exists for', () => {
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    // Time passing, frames rendering, further scrolls: nothing inside the tracker can clear this.
    // A smooth scroll aborted by an instant jump is exactly such a sequence, and this state would
    // outlive the whole session — every later menu open would read "in flight" and never arm.
    docScroll()
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
  })

  it('scrollWindowTo clears that latch — the app being honest about a scroll it caused', () => {
    const spy = vi.spyOn(window, 'scrollTo')
    docScroll() // a sequence is running (say, iOS's status-bar glide)
    expect(isDocScrollInFlight()).toBe(true)
    scrollWindowTo(0, 0) // …and the app jumps the page out from under it
    expect(isDocScrollInFlight()).toBe(false)
    // It really is the jump, not a side effect: same call, same arguments.
    expect(spy).toHaveBeenCalledWith(0, 0)
    scrollWindowTo(0, 480)
    expect(spy).toHaveBeenLastCalledWith(0, 480)
    expect(isDocScrollInFlight()).toBe(false)
    spy.mockRestore()
  })
})

// ── The jump's own echo ────────────────────────────────────────────────────────────────────────
// A jump that MOVES the page makes the engine dispatch a document scroll for it, a task later.
// Lowering the flag and stopping there left that event to raise it straight back up, so the cure
// above depended on a scrollend arriving for the very sequence the module says may never deliver
// one. These pin the ordering instead. jsdom's window.scrollTo neither moves the page nor fires an
// event, so the position is faked (the module reads scrollX/scrollY to decide whether an echo is
// even coming) and the echo is dispatched by hand — the honest shape of what a real engine does.
describe('docScrollFlight — a jump does not re-raise the flag with its own scroll event', () => {
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
    // Spend any echo this test left outstanding before the next one reads the flag.
    docScroll()
    docScrollEnd()
  })

  it('spends the echo instead of raising the flag, and reads the NEXT scroll normally', () => {
    pos = { x: 0, y: 900 } // a status-bar glide is running, well down the page
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
    scrollWindowTo(0, 0) // …and the app jumps the page out from under it
    expect(isDocScrollInFlight()).toBe(false)
    // The engine now delivers the jump's own scroll event. It describes a scroll that was over
    // before it was dispatched — it must not put the flag back up.
    docScroll()
    expect(isDocScrollInFlight()).toBe(false)
    // Exactly one event is spoken for: a genuine new scroll right after it reads normally.
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
  })

  it('claims nothing when the jump did not move the page (no event is coming)', () => {
    // Already at the top: scrollTo fires no scroll event at all, so an outstanding claim would be
    // spent on the user's next real gesture — and a menu opened during it would wrongly arm.
    scrollWindowTo(0, 0)
    expect(isDocScrollInFlight()).toBe(false)
    docScroll()
    expect(isDocScrollInFlight()).toBe(true)
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
    docScroll() // the coalesced echo
    expect(isDocScrollInFlight()).toBe(false)
    docScroll() // and the flag is live again immediately after it
    expect(isDocScrollInFlight()).toBe(true)
  })
})

// ── The call-site guard ────────────────────────────────────────────────────────────────────────
// The cure above only holds while every instant jump actually goes through the door. This is what
// makes that structural instead of a convention: adding `window.scrollTo(...)` anywhere in src
// fails the build, and the two allowed files each say in their own header why they are allowed.
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
// Comments discuss window.scrollTo by name all over this codebase — strip them before scanning so
// the guard fires on CODE only. A line comment is cut at its `//` UNLESS a colon precedes it, so
// the https:// URLs in main.tsx keep their line (truncating those could hide a real call).
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
const bareCalls = srcFiles(join(root, 'src')).flatMap((file) =>
  ALLOWED.includes(rel(file))
    ? []
    : stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .flatMap((line, i) =>
          /window\.scrollTo\s*\(/.test(line)
            ? [`${rel(file)}:${i + 1} — use scrollWindowTo (lib/docScrollFlight)`]
            : [],
        ),
)

describe('docScrollFlight — every instant window jump goes through the one door', () => {
  it('scans the real tree (main.tsx present — the guard cannot go blind)', () => {
    const names = srcFiles(join(root, 'src')).map(rel)
    expect(names).toContain('src/main.tsx')
    expect(names).toContain(ALLOWED[0])
    expect(names).toContain(ALLOWED[1])
  })

  it('finds no bare window.scrollTo outside the door and the accordion writer', () => {
    expect(bareCalls).toEqual([])
  })

  it('main.tsx makes its jumps through scrollWindowTo (all four of them)', () => {
    // Entering guide mode, leaving it, the pageshow fresh-load reset (round 11's Q3 gated out the
    // BFCache half of that event, but the reload half still jumps), and Full Reset — the sites the
    // queue entry named as able to abort a scroll mid-glide.
    const main = stripComments(readFileSync(join(root, 'src/main.tsx'), 'utf8'))
    expect([...main.matchAll(/scrollWindowTo\s*\(/g)].length).toBeGreaterThanOrEqual(4)
  })
})
