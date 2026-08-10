// @vitest-environment jsdom
//
// tests/appVersion.dom.test.jsx — the app version, END TO END, from package.json to the changelog
// popup's heading row (2026-08-10).
//
// WHY THIS FILE EXISTS SEPARATELY FROM changelog.dom.test. That file pins what the popup actually
// shows, against the real value — and a hardcoded "v2.19.0" in the JSX would pass every one of those
// assertions until the next deploy, at which point the panel would confidently display the previous
// version. The only way to prove the panel READS the injected constant rather than repeating today's
// value is to change the constant and watch the panel follow, which needs a module mock, which is
// file-wide in Vitest. Hence one small file that mocks, and the real-value assertions living where
// they belong.
//
// THE CHAIN BEING PINNED, and each link's owner:
//   package.json "version"  →  vite.config.js `define` (__APP_VERSION__)  →  src/appVersion.ts
//   →  SettingsPanel's changelog heading row.
// The first link is asserted here against package.json read from disk (so a `define` that stopped
// pointing at the version field fails), the last by the mock below.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { screen, within, cleanup, fireEvent, act } from '@testing-library/react'
import { mountApp, openSettings, resetAppState } from './helpers/settingsPanel.jsx'

// A version no build will ever carry, so nothing can pass by coincidence.
const FAKE = vi.hoisted(() => ({ APP_VERSION: '47.11.3', BUILD_NUMBER: 0 }))
vi.mock('../src/appVersion.js', () => FAKE)

const openPopup = () => {
  openSettings()
  act(() => fireEvent.click(screen.getByRole('button', { name: /^Changelog/ })))
}

describe('the version reaches the panel THROUGH the module (mocked)', () => {
  beforeEach(() => {
    resetAppState()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('renders whatever src/appVersion exports — a literal in the JSX would fail this', () => {
    mountApp()
    openPopup()
    const dialog = screen.getByRole('dialog', { name: "What's new" })
    expect(within(dialog).getByText('v47.11.3')).toBeInTheDocument()
    // And nothing else in the popup is spelling a version out on its own.
    expect(within(dialog).queryByText(/v\d+\.\d+\.\d+/)).toHaveTextContent('v47.11.3')
  })

  it('★ the dialog is still named exactly "What\'s new", whatever the version says', () => {
    mountApp()
    openPopup()
    // The constraint the markup is shaped around: the card is aria-labelledby="changelog-title", so
    // the id must wrap ONLY the words. getByRole's string matcher is EXACT against the computed
    // accessible name, so this query failing is the regression — a name of "What's new v47.11.3"
    // would not match. Asserted with a version that is nothing like the real one, so the case cannot
    // pass by the two strings happening to look alike.
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /47\.11\.3/ })).toBeNull()
    // Belt and braces on the mechanism itself, since the query above would also pass if the
    // aria-labelledby were simply dropped (an unnamed dialog does not match either).
    const dialog = screen.getByRole('dialog', { name: "What's new" })
    const labelled = dialog.getAttribute('aria-labelledby')
    expect(labelled).toBe('changelog-title')
    expect(document.getElementById(labelled).textContent).toBe("What's new")
  })

  it('the build number renders NOWHERE — it is reachable, not shown', async () => {
    const { BUILD_NUMBER } = await vi.importActual('../src/appVersion.js')
    mountApp()
    openPopup()
    // jsdom sees the whole document, which is all this claim needs: the number is not painted
    // anywhere today. Checked against the sentinel AND against the shape a future round would use,
    // so it stays a real assertion the day the sentinel changes.
    expect(document.body.textContent).not.toContain(`build ${BUILD_NUMBER}`)
    expect(document.body.textContent).not.toMatch(/\bbuild\s+\d+/i)
  })
})

describe('the version is package.json’s, not a second copy', () => {
  it('src/appVersion exports the version field verbatim, and it is semver', async () => {
    // importActual, because this file mocks the module for the cases above.
    const { APP_VERSION, BUILD_NUMBER } = await vi.importActual('../src/appVersion.js')
    // process.cwd(), not import.meta.url: under jsdom `import.meta.url` is not a file: URL, so
    // `new URL('../package.json', import.meta.url)` throws "The URL must be of scheme file". Vitest
    // runs from the config root, which is where package.json is. (Found by the failing run, not
    // guessed — the same jsdom detail that would trip the next person writing a test that reads a
    // repo file.)
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    expect(APP_VERSION).toBe(pkg.version)
    // Three dotted numbers. vite.config.js throws at config time if this is ever false, so this case
    // is the same rule stated where a reader of the app will find it.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    // ⚠ WHAT THIS CANNOT SEE: the MAJOR/MINOR/PATCH decision. Whether this deploy earned a minor or
    // a patch is a judgement about what it contains — no test can hold that, and pretending
    // otherwise (e.g. asserting the version changed since some pinned value) would just be a chore
    // that fires on every commit. The scheme lives in src/appVersion.ts and is enforced by review.

    // The silent build number: present, numeric, and — under Vitest — the frozen 0 sentinel that
    // vite.config.js substitutes outside `vite build`. 0 can ONLY mean "not a build": the real path
    // throws rather than emitting it (tests/buildNumber.test.js pins every one of those refusals).
    expect(typeof BUILD_NUMBER).toBe('number')
    expect(Number.isInteger(BUILD_NUMBER)).toBe(true)
    expect(BUILD_NUMBER).toBe(0)
  })
})
