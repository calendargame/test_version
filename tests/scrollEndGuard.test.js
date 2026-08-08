// tests/scrollEndGuard.test.js — the `scrollend` ban, and the file that carries what this project
// learned (expensively, twice) about reading iOS scroll events.
//
// THE GUARD: the word `scrollend` may not appear in CODE anywhere in src. It survives only in the
// comments that explain why it is banned, so this scans with comments stripped.
//
// WHY IT IS BANNED. `scrollend` did not exist in Safari until 26.2 (December 2025), so it is not a
// portable signal — an app that leans on it silently gets no signal at all on most iPhones in use.
// A mode-menu dismiss rule was built on it anyway, shipped, and failed on the owner's device. It
// passed in Chromium the whole time, which is the part worth remembering: no test of a
// scrollend-based rule could have caught it, because the rule was correct in the engine the tests
// run in. Deletion was the fix; this guard is what keeps it deleted.
//
// ── THE TWO FACTS THAT KILLED THE REPLACEMENT (recorded here 2026-08-07) ───────────────────────
// The rule that replaced it read the boundary between scroll SEQUENCES from the gap between scroll
// EVENTS. That failed on device too, and it was retired with the whole dismissal (see the dismiss
// note on components/CustomSelect). Both of its supporting comments turned out to be factually
// wrong, and both are written down here so the next person does not re-derive a third wrong theory
// from them:
//
//   1. A VIEWPORT SCROLL EVENT IS FIRED AT THE DOCUMENT. Always, in WebKit — never at `body`,
//      never at `documentElement`. There is exactly one enqueue site (EventHandler.cpp →
//      addPendingScrollEventTarget(*document, …)) and one dispatch loop (Document.cpp), unchanged
//      across four WebKit versions spanning about ten years. It does not vary by quirks mode, by
//      Safari vs. an installed PWA, or by the phase of a scroll. The deleted module claimed "WebKit
//      has been seen to target documentElement instead" and accepted both; that was folklore, and
//      the folklore it came from is about `scrollingElement`/`scrollTop`, not the event target.
//      Consequence for anyone filtering scroll events by target: `e.target === document` is the
//      whole test on WebKit — and a listener with NO target filter is not the same listener, so it
//      cannot be used to "verify" one that has a filter.
//
//   2. SCROLL-EVENT CADENCE IS NOT ~16ms ON iOS, AND CANNOT BE MEASURED FROM A DESKTOP ENGINE.
//      The deleted module justified a 150ms threshold as measured, with "8x headroom" over an
//      18.5ms worst-case gap. Those measurements came from a desktop engine, where
//      ChromeClient::eventThrottlingDelay() returns 0s unconditionally. iOS overrides it:
//      WebPage::eventThrottlingDelay() returns min(estimatedLatency * 2, 1s) whenever the view is
//      not in a stable state — and momentum, an active drag, the scroll-to-top animation and
//      rubber-band all qualify. Worse, LocalFrameView shows that while its delayed scroll-event
//      timer is pending, further scroll position changes produce NO event at all. So a live iOS
//      scroll can go a FULL SECOND between events. The headroom never existed on the target
//      platform; the constant was measured on the one engine that could not disprove it.
//
// The standing lesson from all three attempts: do not time UI decisions off scroll events. Reach
// for a rule that does not need to know whether a scroll is running.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

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
// `scrollend` is named in the comments that explain the ban, so the scan must see CODE only. A line
// comment is cut at its `//` UNLESS a colon precedes it, so the https:// URLs in main.tsx keep
// their line (truncating those could hide a real call).
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n')
const files = srcFiles(join(root, 'src'))
const scrollEndCode = files.flatMap((file) =>
  stripComments(readFileSync(file, 'utf8'))
    .split('\n')
    .flatMap((line, i) =>
      /scrollend/i.test(line)
        ? [`${rel(file)}:${i + 1} — scrollend is banned (see this file)`]
        : [],
    ),
)

describe('scrollend guard — the unportable boundary stays deleted', () => {
  it('scans the real tree (main.tsx and CustomSelect.tsx present — the guard cannot go blind)', () => {
    const names = files.map(rel)
    expect(names).toContain('src/main.tsx')
    expect(names).toContain('src/components/CustomSelect.tsx')
    expect(names.length).toBeGreaterThan(10)
  })

  it('finds no scrollend in CODE anywhere in src', () => {
    expect(scrollEndCode).toEqual([])
  })

  it('strips comments before scanning, so the explanations above stay legal', () => {
    expect(stripComments('// mentions scrollend\nfoo()')).not.toMatch(/scrollend/)
    expect(stripComments('/* scrollend */ bar()')).not.toMatch(/scrollend/)
    // …but a real listener is caught, including one hiding after a URL-bearing comment.
    expect(stripComments("el.addEventListener('scrollend', f) // see https://x")).toMatch(
      /scrollend/,
    )
  })
})
