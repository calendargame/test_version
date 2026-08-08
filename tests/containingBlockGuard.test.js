// tests/containingBlockGuard.test.js — Q8 round-11's silent-dependency guard.
//
// The mode selector's dropdown panel is position:FIXED (components/CustomSelect), which is what
// makes its position scroll-independent in both the clamped modes and the guide's document scroll.
// "Fixed" means "positioned against the viewport" — but only while no ancestor has CREATED A
// CONTAINING BLOCK for fixed descendants. transform, filter, backdrop-filter, will-change, contain
// and perspective all do exactly that: put any one of them on <html>, <body> or #root and the
// panel silently starts answering to a scrolling box instead of the viewport, i.e. it drifts with
// the page again — the Round-4 report Q8 root-caused, back with no code change to blame.
//
// That is an invisible dependency, so it gets a visible test. This scans the two places those
// three elements can be styled — src/index.css and index.html (its inline <style> plus the class
// attributes on <html>/<body>/#root) — and the one way JS can add an inline style to them.
// Nothing here is about scrolling per se; it is about who the viewport is.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
const html = readFileSync(join(root, 'index.html'), 'utf8')

// The six properties, plus the vendor-prefixed backdrop-filter the app actually ships (the panel's
// own frosted glass uses it — on the PANEL, which is fine; on an ancestor it is fatal).
const BANNED_PROPS =
  /(?:^|;)\s*(transform|translate|rotate|scale|perspective|filter|backdrop-filter|-webkit-backdrop-filter|will-change|contain)\s*:/gi

// A selector targets one of the three iff it ENDS in html, body or #root (possibly with
// attribute/pseudo qualifiers) — `html[data-theme="light"] #root` counts, `#root .panel` does not,
// and neither does `[data-theme="light"] #boot`.
const TARGETS_ROOT_CHAIN = /(?:^|[\s>+~])(?:html|body|#root)(?:\[[^\]]*\])*(?::[a-z-]+)*$/i

// Innermost rule blocks only: `[^{}]+` can't cross a brace, so an @media wrapper never matches as
// a selector and its inner rules are picked up individually.
const rules = (text) =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim()),
    body: m[2],
  }))

const scanRules = (text, label) =>
  rules(text).flatMap(({ selectors, body }) =>
    selectors.some((s) => TARGETS_ROOT_CHAIN.test(s))
      ? [...body.matchAll(BANNED_PROPS)].map(
          (m) => `${label} — ${selectors.join(',')} declares ${m[1]}`,
        )
      : [],
  )

// index.html's inline <style> blocks (the boot splash's, today).
const inlineStyleBlocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1])

// Tailwind utilities that compile to one of the banned properties. Matched against the class
// attribute of <html>, <body> and #root only.
const BANNED_CLASSES =
  /(?:^|\s)-?(?:transform|filter|transform-gpu|(?:translate|rotate|scale|skew|blur|perspective|contain|will-change|backdrop)-[^\s"]+)/i
const classAttr = (openTagPattern) => {
  const tag = html.match(openTagPattern)?.[0] ?? ''
  return tag.match(/class="([^"]*)"/)?.[1] ?? ''
}
const rootChainClasses = [
  ['<html>', classAttr(/<html[^>]*>/)],
  ['<body>', classAttr(/<body[^>]*>/)],
  ['#root', classAttr(/<div id="root"[^>]*>/)],
]

// The JS half. Rather than enumerate banned property names (which dates the moment CSS adds
// another containing-block trigger), pin the WHOLE SET of inline style properties the app ever
// writes to <html> / <body>: two, both harmless. Anything new has to come here and be justified.
const ALLOWED_INLINE_PROPS = ['background', '--bar-h']
const srcFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? srcFiles(join(dir, e.name))
      : /\.(ts|tsx|js|jsx)$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  )
const rel = (file) => relative(root, file).replace(/\\/g, '/')
const inlineWrites = [
  ...srcFiles(join(root, 'src')).map((f) => [rel(f), readFileSync(f, 'utf8')]),
  ['index.html', html],
]
  .flatMap(([name, text]) =>
    [
      ...text.matchAll(
        /(?:document\.documentElement|document\.body)\.style\.(?:setProperty\(\s*['"]([^'"]+)['"]|([A-Za-z-]+)\s*=)/g,
      ),
    ].map((m) => `${name} — ${m[1] || m[2]}`),
  )
  .filter((w) => !ALLOWED_INLINE_PROPS.some((p) => w.endsWith(`— ${p}`)))

describe('containing-block guard (Q8) — nothing may make html/body/#root the fixed panel’s viewport', () => {
  it('sees the real rules for all three elements (the scanner cannot go blind)', () => {
    const hit = (sel) => rules(css).some(({ selectors }) => selectors.includes(sel))
    expect(hit('html')).toBe(true) // the overflow clamp (html,body{…})
    expect(hit('body')).toBe(true)
    expect(hit('#root')).toBe(true) // the fixed 100dvh box — now unconditional (round 13)
    // There used to be a fourth real rule here, `html[data-doc-scroll] #root`, which released that
    // box for the guide's document scroller. It is gone with the whole mechanism, and with it the
    // stylesheet's only QUALIFIED chain onto one of the three. That shape still has to be covered,
    // since it is the one an innocent-looking future rule would wear — the synthetic case below
    // holds it, and this line is deliberately not replaced by a weaker real-rule stand-in.
    expect(inlineStyleBlocks.length).toBeGreaterThan(0)
    expect(rootChainClasses.map(([el]) => el)).toEqual(['<html>', '<body>', '#root'])
    // …and the class attributes really were read, not silently missed by the tag patterns.
    const cls = (el) => rootChainClasses.find(([name]) => name === el)[1]
    expect(cls('#root')).toContain('min-h-screen')
    expect(cls('<body>')).toContain('text-(--tx-50)')
  })

  it('src/index.css declares none of the six on html, body or #root', () => {
    expect(scanRules(css, 'src/index.css')).toEqual([])
  })

  it("index.html's inline styles declare none of them either", () => {
    expect(inlineStyleBlocks.flatMap((b) => scanRules(b, 'index.html <style>'))).toEqual([])
  })

  it('no Tailwind transform/filter/contain utility sits on html, body or #root', () => {
    expect(
      rootChainClasses.filter(([, cls]) => BANNED_CLASSES.test(cls)).map(([el]) => el),
    ).toEqual([])
  })

  it('JS writes only background and --bar-h inline on html/body — never a containing-block property', () => {
    expect(inlineWrites).toEqual([])
  })

  it('the scanner recognises a violation when one is present (it is not vacuously green)', () => {
    // Each half, fed the exact shape it exists to catch.
    expect(scanRules('#root{transform:translateZ(0)}', 'x').length).toBe(1)
    // The qualified-chain shape, which no live rule wears any more (see the note above).
    expect(
      scanRules('html[data-theme="light"] #root{will-change:scroll-position}', 'x').length,
    ).toBe(1)
    expect(scanRules('body{backdrop-filter:blur(2px)}', 'x').length).toBe(1)
    expect(scanRules('#root .panel{transform:scale(1)}', 'x')).toEqual([]) // a descendant is fine
    expect(scanRules('html,body{overscroll-behavior-y:contain}', 'x')).toEqual([]) // value, not property
    expect(BANNED_CLASSES.test('min-h-screen backdrop-blur-xl')).toBe(true)
    expect(BANNED_CLASSES.test('min-h-screen text-(--tx-50)')).toBe(false)
  })
})
