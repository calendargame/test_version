// tests/cascadeLayerGuard.test.js — round 17's kill for the Tailwind v3→v4 cascade regression.
//
// WHAT BROKE. src/index.css closed its `@layer base` block early and then defined ~40 custom
// classes UNLAYERED. On Tailwind v3 that was harmless: `@layer` was a build-time directive PostCSS
// flattened, so "layer" only ever meant source order. v4 uses the REAL CSS cascade-layers feature
// and puts every utility inside `@layer utilities` — and an unlayered normal declaration beats
// EVERY cascade layer, at any specificity. So from the v4 upgrade on, each of those custom classes
// silently outranked any Tailwind utility touching the same property.
// The shipped casualty was Lookup's history list: `.panel`'s `background` and `border` shorthands
// killed all four state utilities on the row — bg-(--hist-sel), border-l-2, border-l-(--acc) and
// hover:bg-(--hist-hov) — so selecting a history entry changed nothing on screen and hovering one
// did nothing either. The fix wraps the whole custom block in `@layer components`, which sorts
// BELOW utilities and above Tailwind's base reset.
//
// ⚠ WHAT THIS FILE CAN AND CANNOT ASSERT, said plainly, because a test that LOOKS like it covers
// the rendering would be worse than no test at all. jsdom has no cascade-layer implementation and
// no layout engine: it cannot tell you what colour that row paints, and nothing in this suite can.
// The rendering was verified once, by hand, in a real browser against a real `npm run build`.
// What IS mechanically checkable — and is the whole of what went wrong — is the CASCADE ORDER, so
// that is what this guards, in two independent halves:
//   1. the SOURCE shape: no style rule in src/index.css sits outside a cascade layer. This is the
//      half that catches the regression RECURRING, because the way it comes back is somebody
//      appending a rule after the layer's closing brace (or closing it early again).
//   2. the COMPILED order: the stylesheet is actually run through Tailwind here, and the four
//      utilities that were dead are asserted to land in a layer that outranks the one `.panel`
//      lands in. That is the real relationship, read out of the real compiler rather than assumed
//      from the source text — and it is what would fail if a Tailwind upgrade ever moved either
//      side into a different layer.
//   3. the ONE THING THAT MUST STAY OUT of the layer: the two `@property` registrations. The first
//      attempt at this fix swept them in with everything else, and Tailwind quietly stopped
//      emitting their @supports fallback — the last test in this file is the kill for that, and it
//      is why half 1 forbids unlayered STYLE RULES rather than "anything unlayered".
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src/index.css'), 'utf8')

// ── half 1: the source shape ────────────────────────────────────────────────────────────────────
// Walk the file's TOP LEVEL only and report anything that is not an at-rule. At depth 0 a prelude
// that does not start with `@` is a style rule, and a style rule at depth 0 is by definition
// unlayered. Comments are stripped first so a `{` or `;` inside prose cannot desynchronise the
// scan (this stylesheet is mostly prose).
// STYLE RULES, not at-rules, and the distinction is load-bearing rather than an implementation
// accident: the stylesheet's two `@property` registrations MUST sit at the top level. A @property
// has no selector, wins no cascade fight and takes no part in layer ordering, so layering it buys
// nothing — and Tailwind only builds its `@layer properties` @supports fallback from the
// registrations it finds at the top level, so layering one silently deletes that fallback and
// hands a JS reader an unparseable token stream. The third test below pins that directly.
const topLevelStyleRules = (text) => {
  const s = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  let depth = 0
  let prelude = ''
  for (const ch of s) {
    if (ch === '{') {
      if (depth === 0 && !prelude.trim().startsWith('@') && prelude.trim()) out.push(prelude.trim())
      depth++
      prelude = ''
    } else if (ch === '}') {
      depth--
      prelude = ''
    } else if (ch === ';' && depth === 0) {
      prelude = ''
    } else if (depth === 0) {
      prelude += ch
    }
  }
  // trailing text with no brace at all — e.g. a half-written rule after the closing brace
  if (prelude.trim() && !prelude.trim().startsWith('@')) out.push(prelude.trim())
  return out
}

// ── half 2: the compiled cascade ────────────────────────────────────────────────────────────────
const compiled = await postcss([tailwind()]).process(css, { from: join(root, 'src/index.css') })

const layerOf = (node) => {
  for (let n = node.parent; n; n = n.parent) {
    if (n.type === 'atrule' && n.name === 'layer') return n.params
  }
  return null // unlayered — the state this whole file exists to forbid
}

// The compiler escapes `(`, `)` and `:` in the var-shorthand utilities, and it emits variants as a
// NESTED `&:hover` inside the base rule rather than as a `:hover` suffix on the selector. Both are
// formatting choices Tailwind is free to change, so compare against the selector with its escaping
// backslashes stripped and let the caller name the plain class — `.hover:bg-(--hist-hov)`, the
// string that is actually in the className.
const layerFor = (plainSelector) => {
  const hits = new Set()
  compiled.root.walkRules((rule) => {
    if (rule.selector.replace(/\\/g, '') === plainSelector) hits.add(layerOf(rule))
  })
  return [...hits]
}

// The single ordering statement Tailwind emits. Everything downstream rests on this list, so read
// the real one instead of trusting that `components` still precedes `utilities`.
const orderStatement = (() => {
  let found = null
  compiled.root.walkAtRules('layer', (a) => {
    if (!a.nodes && a.params.includes('utilities')) found = a.params
  })
  return found
})()
const order = (orderStatement ?? '').split(',').map((s) => s.trim())

describe('cascade-layer guard (round 17) — no custom rule may outrank a Tailwind utility', () => {
  it('src/index.css has no style rule outside a cascade layer', () => {
    expect(topLevelStyleRules(css)).toEqual([])
  })

  it('the scanner recognises an unlayered rule when one is present (it is not vacuously green)', () => {
    // The exact shape the regression comes back as: the layer closed, then a rule after it.
    expect(topLevelStyleRules('@layer components{.a{color:red}}\n.panel{background:blue}')).toEqual(
      ['.panel'],
    )
    expect(topLevelStyleRules('@layer components{.a{color:red}}')).toEqual([])
    // …and a rule hiding behind a comment full of braces is still seen.
    expect(topLevelStyleRules('/* a { b } c */\n.late{color:red}')).toEqual(['.late'])
  })

  it('the custom block compiles into `components`, which Tailwind orders below `utilities`', () => {
    expect(order).toContain('components')
    expect(order).toContain('utilities')
    expect(order.indexOf('components')).toBeLessThan(order.indexOf('utilities'))
    expect(layerFor('.panel')).toEqual(['components'])
  })

  it('the four utilities that `.panel` used to kill now outrank it', () => {
    // Exactly the four on Lookup's history row, in src/components/LookupCard.tsx.
    for (const sel of [
      '.bg-(--hist-sel)',
      '.border-l-2',
      '.border-l-(--acc)',
      '.hover:bg-(--hist-hov)',
    ]) {
      const layers = layerFor(sel)
      expect(layers, `no compiled rule for ${sel}`).toHaveLength(1)
      expect(layers[0], `${sel} must be in a layer above .panel's`).toBe('utilities')
    }
  })

  it('.hist-unsel is gone — it only ever undid a border colour .panel already set', () => {
    expect(css).not.toContain('hist-unsel')
    expect(layerFor('.hist-unsel')).toEqual([])
  })

  it('no STYLE RULE in the compiled output is unlayered', () => {
    // walkRules visits style rules only — never @property, @keyframes' own at-rule, or any other
    // at-rule — and that is exactly the scope wanted. "Unlayered" is a cascade word: it only means
    // anything for a declaration that competes for an element, i.e. a style rule. The at-rules
    // that legitimately sit outside every layer are covered by the test below, which asserts the
    // consequence that actually matters rather than the placement for its own sake.
    const orphans = []
    compiled.root.walkRules((rule) => {
      if (layerOf(rule) === null) orphans.push(rule.selector)
    })
    expect(orphans).toEqual([])
  })

  it('the two @property registrations stay outside the layer, and keep their @supports fallback', () => {
    // THE REGRESSION THIS EXISTS FOR. Wrapping the custom block in `@layer components` swept both
    // `@property` rules inside it too. Tailwind collects only the TOP-LEVEL registrations when it
    // builds `@layer properties` — the @supports block that declares each registered property as a
    // plain token for engines with no @property support (Safari ≤16.3, Firefox <128, both inside
    // this build's targets). Layered, they were not collected, and `--seat-top: 0px` and
    // `--shade: 1` vanished from the built CSS with no error anywhere. --seat-top then computes to
    // the literal `calc(var(--bar-h) + var(--guide-panel-gap))`, GuidePage's parseFloat answers
    // NaN, and a `|| 0` seats the panels at zero — behind the fixed bar, a bug this project has
    // already shipped once. Placement is asserted AND its consequence is asserted, because the
    // consequence is the half a future Tailwind change could break without moving anything.
    const registered = []
    compiled.root.walkAtRules('property', (a) => {
      if (!a.params.startsWith('--tw-')) registered.push([a.params, layerOf(a)])
    })
    expect(registered).toEqual([
      ['--seat-top', null],
      ['--shade', null],
    ])
    const fallback = []
    compiled.root.walkAtRules('supports', (at) => {
      at.walkDecls((d) => {
        if (d.prop === '--seat-top' || d.prop === '--shade') fallback.push(`${d.prop}: ${d.value}`)
      })
    })
    expect(fallback.sort()).toEqual(['--seat-top: 0px', '--shade: 1'])
  })
})
