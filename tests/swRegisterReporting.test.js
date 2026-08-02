// tests/swRegisterReporting.test.js — service-worker registration failure must never vanish
// (Q10a, round 11).
//
// The state this guards against was hit for real in July 2026: an agent ran the app with NO service
// worker at all — no offline copy, no update path, and "Check for updates" with nothing to hand off
// to — and nothing anywhere said so. Both routes to that state swallowed their error. The dynamic
// import of the register module was `import('./sw.js').catch(()=>{})`, and registerSW was called
// with no onRegisterError at all, so a rejected register() had nowhere to go.
//
// They fail INDEPENDENTLY — the chunk can load fine and register() still be rejected (a blocked
// worker, an unsupported scope, a 404 on sw.js) — which is why both halves are wired and both are
// pinned here. This is a SOURCE guard rather than a behavioural test on purpose: sw.ts imports
// 'virtual:pwa-register', a module that exists only inside a real Vite build, so the file cannot be
// imported by the suite at all. A source guard is what is actually available, and it fails the
// moment either catch goes back to being silent.
//
// The one deliberate silence — the background registration.update() prefetch — is asserted too, so
// nobody "fixes" it into reporting the ordinary offline case as an error.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')
const sw = read('src/sw.ts')
const main = read('src/main.tsx')

describe('service-worker registration failures are reported (Q10a)', () => {
  it('sw.ts hands a failed registration to captureError', () => {
    expect(sw).toMatch(/import \{ captureError \} from '\.\/observability\/sentry'/)
    // The callback exists AND its body reports: `onRegisterError(){}` would pass a bare name check
    // while restoring the exact silence this guards.
    const handler = sw.match(/onRegisterError\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{2}\}/)
    expect(handler, 'sw.ts has no onRegisterError callback').not.toBe(null)
    expect(handler[1]).toContain('captureError(')
  })

  it("main.tsx reports the register module's chunk failing to load", () => {
    const line = main.split('\n').find((l) => l.includes("import('./sw.js')"))
    expect(line, "main.tsx no longer dynamically imports './sw.js'").toBeTruthy()
    expect(line).toContain('captureError(')
    expect(line).not.toMatch(/catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/)
  })

  it('the background update() prefetch stays silent — an offline no-op is not an error', () => {
    // The opposite call: update() rejecting is the ordinary "no network, nothing newer" case and
    // the app is entirely healthy without it. Reporting it would bury the signal above in noise.
    expect(sw).toMatch(/registration\.update\(\)\.catch\(\(\) => \{\}\)/)
  })
})
