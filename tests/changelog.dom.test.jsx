// @vitest-environment jsdom
//
// The changelog + update-signal dots (round-6 Q6). src/changelog holds the hand-maintained
// plain-words per-DAY entries (newest first; a second same-day deploy PREPENDS its lines to that
// day's entry — the round-7 combine policy — so dates stay unique). Round-8 Q8 made that array the
// published set exactly: the popup renders CHANGELOG as-is, so the ten-day cap is enforced at
// SOURCE (pinned below) and the oldest entry moves to CHANGELOG-ARCHIVE.md instead of piling up
// here. That retired the render-time slice, and with it the separate changelogLimit.dom file which
// mocked a larger data set behind that slice — the popup can no longer discard anything, so the
// cap can no longer be a rendering question. The two light-blue dots are the persisted
// breadcrumb to the popup: the Q2 build-stamp detection marks both flags on every build change
// (including one the real Updating flow just bridged — only the SCREEN is suppressed then),
// opening ⚙ Settings retires the gear's dot, and the first tap on the footer's Changelog link
// (right of Check for updates) retires the link's. The popup follows the established settings-
// modal contract (focus-on-open, capture Escape, close-with-settings, Android Back, the shared
// Tab trap, the [data-settings-modal] marker). Round-8 Q7 split the one dot into the two forms
// its two hosts can actually carry (components/UpdateDot: a corner badge for the ⚙ icon button,
// an in-flow marker for the text link), so the assertions below read the marker element's own
// data-update-dot / data-lit attributes — the host's className no longer says anything about it.
// Visual truth — where the dot lands, coexistence with the violet bar, themes — is on-device
// territory per the standing lesson; these tests pin the logic and the DOM-level rendering.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup, fireEvent, act } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'
import { useModePrefs } from '../src/store/modePrefs.js'
import { useUserDefaults } from '../src/store/userDefaults.js'
import { useProgress } from '../src/store/progress.js'
import { BUILD_STAMP_KEY, writeBuildStamp } from '../src/lib/buildStamp.js'
import {
  CHANGELOG,
  GEAR_DOT_KEY,
  CHANGELOG_DOT_KEY,
  readUpdateDot,
  markUpdateDot,
  clearUpdateDot,
} from '../src/changelog.js'

const OLD_STAMP = '2020-01-01T00:00:00.000Z' // any build that is not the running one

// ── Harness (the buildStamp.dom + viewDefaults.dom helpers) ──
function mountApp() {
  // CustomSelect panels AND the settings modals portal into #root; provide one.
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}
const gear = () => screen.getByRole('button', { name: /^Settings/ })
const openSettings = () => act(() => fireEvent.click(gear()))
// Prefix match, exactly like the gear's: the link's accessible name GROWS to 'Changelog, update'
// while its dot is lit (an sr-only word — the marker element itself is aria-hidden). The exact
// names are asserted in both states below; this helper just has to find the button in either.
const changelogLink = () => screen.getByRole('button', { name: /^Changelog/ })
const openChangelog = () => act(() => fireEvent.click(changelogLink()))
// The two update markers, found by the attribute components/UpdateDot publishes — never by a class
// on the host. That is the round-8 Q7 contract: the hosts mount DIFFERENT forms of the same dot.
const gearMark = () => gear().querySelector('[data-update-dot]')
const linkMark = () => changelogLink().querySelector('[data-update-dot]')
const changelogTitle = () => screen.queryByText("What's new")
const changelogDialog = () => screen.getByRole('dialog', { name: "What's new" })

describe('changelog data (src/changelog)', () => {
  it('every entry is an ISO-dated, non-empty plain-words list, newest first, one per day', () => {
    expect(CHANGELOG.length).toBeGreaterThanOrEqual(2)
    for (const en of CHANGELOG) {
      expect(en.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(en.items.length).toBeGreaterThan(0)
      for (const it of en.items) expect(it.trim().length).toBeGreaterThan(0)
    }
    const dates = CHANGELOG.map((en) => en.date)
    expect([...dates].sort().reverse()).toEqual(dates) // newest-first (ISO sorts lexically)
    // One entry per Pacific day (the round-7 same-day COMBINE policy): a second same-day deploy
    // prepends its lines instead of adding a twin-dated card. Uniqueness is what makes the
    // ordering pin above STRICT, and it protects the popup's key={en.date} React-key contract.
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('holds at most ten days — the cap is the DATA, not the rendering (round-8 Q8)', () => {
    // Trimmed at source: the popup renders the array as-is, so an eleventh day would SHIP; move
    // the oldest entry to CHANGELOG-ARCHIVE.md when adding a new day.
    expect(CHANGELOG.length).toBeLessThanOrEqual(10)
  })
})

describe('update-dot flags (plain localStorage)', () => {
  afterEach(() => {
    clearUpdateDot(GEAR_DOT_KEY)
    clearUpdateDot(CHANGELOG_DOT_KEY)
  })

  it('round-trips through the two cg-update-dot keys independently', () => {
    expect(readUpdateDot(GEAR_DOT_KEY)).toBe(false)
    markUpdateDot(GEAR_DOT_KEY)
    expect(localStorage.getItem('cg-update-dot-gear')).toBe('1')
    expect(readUpdateDot(GEAR_DOT_KEY)).toBe(true)
    expect(readUpdateDot(CHANGELOG_DOT_KEY)).toBe(false) // untouched
    clearUpdateDot(GEAR_DOT_KEY)
    expect(readUpdateDot(GEAR_DOT_KEY)).toBe(false)
  })

  it('blocked storage (privacy modes): reads mean no dots, writes are silent no-ops', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readUpdateDot(GEAR_DOT_KEY)).toBe(false)
    expect(() => markUpdateDot(GEAR_DOT_KEY)).not.toThrow()
    expect(() => clearUpdateDot(GEAR_DOT_KEY)).not.toThrow()
    getSpy.mockRestore()
    setSpy.mockRestore()
    removeSpy.mockRestore()
  })
})

describe('the two-stage breadcrumb (stamp → dots → cleared)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    useSettings.getState().resetSettings()
    useModePrefs.getState().resetModePrefs()
    useUserDefaults.getState().clearDefaults()
    useProgress.getState().resetProgress()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    document.getElementById('root')?.remove()
    sessionStorage.clear()
  })
  // Mount on a stale stamp (a detected build change) and ride out the 1s flash hold so the
  // Updating overlay is gone before any interaction.
  const bootAfterUpdate = () => {
    writeBuildStamp(OLD_STAMP)
    mountApp()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
  }

  it('a build change lights BOTH persisted dots: the closed gear and the Changelog link', () => {
    bootAfterUpdate()
    expect(gearMark()).toHaveAttribute('data-lit', 'true')
    expect(gear()).toHaveAttribute('aria-label', 'Settings (update)')
    expect(localStorage.getItem(GEAR_DOT_KEY)).toBe('1')
    expect(localStorage.getItem(CHANGELOG_DOT_KEY)).toBe('1')
    openSettings() // the link only exists inside the panel (this also retires the gear's dot)
    expect(linkMark()).toHaveAttribute('data-lit', 'true')
    // Both markers are aria-hidden, so each host states the news in its own accessible name: the
    // gear folds it into aria-label (asserted above), the link adds an sr-only word. The comma is
    // load-bearing — name-from-content trims each child before joining, so a separator written as
    // leading whitespace disappears and the two words run together.
    expect(screen.getByRole('button', { name: 'Changelog, update' })).toBe(changelogLink())
  })

  it('first-ever visit: no stamp, no dots', () => {
    mountApp()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(localStorage.getItem(GEAR_DOT_KEY)).toBeNull()
    expect(localStorage.getItem(CHANGELOG_DOT_KEY)).toBeNull()
    expect(gearMark()).toHaveAttribute('data-lit', 'false')
    expect(gear()).toHaveAttribute('aria-label', 'Settings')
    openSettings()
    // Unlit is a STATE, not an absence: the marker element is in the DOM either way, so the link's
    // text can never move when a build lands (index.css hides the unlit box with visibility, which
    // jsdom cannot lay out — the node's presence plus data-lit is the whole testable contract).
    expect(linkMark()).toHaveAttribute('data-lit', 'false')
    expect(screen.getByRole('button', { name: 'Changelog' })).toBe(changelogLink())
  })

  it('the two hosts mount DIFFERENT forms of the one marker (round-8 Q7)', () => {
    bootAfterUpdate()
    // The ⚙ icon button gets the corner badge, and is the marker's containing block by its OWN
    // literal class — not by whichever of the two indicator classes happens to be applied.
    expect(gearMark()).toHaveAttribute('data-update-dot', 'corner')
    expect(gearMark().parentElement).toBe(gear())
    expect(gear().className.split(/\s+/)).toContain('relative')
    // The round-6 recipe shared one class between both hosts; nothing may wear it again.
    expect(gear().className).not.toContain('update-dot')
    openSettings()
    const link = changelogLink()
    // The text link gets the in-flow marker — a sibling of the text, never on top of it — and the
    // underline sits on the text span alone so the rule cannot paint across the gap to the dot.
    expect(linkMark()).toHaveAttribute('data-update-dot', 'inline')
    expect(linkMark().parentElement).toBe(link)
    expect(link.className).not.toContain('underline')
    const text = link.querySelector('span')
    expect(text.textContent).toBe('Changelog')
    expect(text.className).toContain('underline')
  })

  it('the post-update suppression boot (cg-skip-boot-hold) still lights the dots — only the screen is suppressed', () => {
    writeBuildStamp(OLD_STAMP)
    sessionStorage.setItem('cg-skip-boot-hold', '1')
    mountApp()
    expect(document.querySelector('.boot-updating')).toBeNull() // no second screen back-to-back…
    expect(localStorage.getItem(GEAR_DOT_KEY)).toBe('1') // …but the changelog still has news
    expect(localStorage.getItem(CHANGELOG_DOT_KEY)).toBe('1')
    expect(gearMark()).toHaveAttribute('data-lit', 'true')
  })

  it('the gear can wear the update dot and the violet modified bar at once (both marks, combined aria-label)', () => {
    act(() => useModePrefs.getState().setFlashMs(800)) // live state ≠ defaults → gear-modified
    bootAfterUpdate()
    // A real child element and a ::after pseudo-element coexist with no ordering constraint — the
    // round-6 recipe had to claim ::before to fit alongside .gear-modified's bar.
    expect(gear().className).toContain('gear-modified')
    expect(gearMark()).toHaveAttribute('data-lit', 'true')
    expect(gear()).toHaveAttribute('aria-label', 'Settings (modified, update)')
  })

  it('opening Settings clears the gear dot only — the link dot keeps pointing onward', () => {
    bootAfterUpdate()
    openSettings()
    expect(localStorage.getItem(GEAR_DOT_KEY)).toBeNull()
    expect(localStorage.getItem(CHANGELOG_DOT_KEY)).toBe('1')
    expect(linkMark()).toHaveAttribute('data-lit', 'true')
    openSettings() // close again — the gear renders its closed-state classes, now dotless
    expect(gearMark()).toHaveAttribute('data-lit', 'false')
    expect(gear()).toHaveAttribute('aria-label', 'Settings')
  })

  it('the link dot survives settings open/close cycles until the link is first tapped', () => {
    bootAfterUpdate()
    openSettings()
    openSettings() // close (gear dot now retired, link dot untouched)
    openSettings() // reopen
    expect(linkMark()).toHaveAttribute('data-lit', 'true')
    // With the gear's dot already retired, the link's sr-only word is the ONLY update signal a
    // screen reader still has — the reason the marker is not left silently decorative.
    expect(screen.getByRole('button', { name: 'Changelog, update' })).toBe(changelogLink())
    openChangelog() // the first tap: opens the popup AND retires the link's dot
    expect(changelogTitle()).toBeInTheDocument()
    expect(localStorage.getItem(CHANGELOG_DOT_KEY)).toBeNull()
    act(() => fireEvent.click(within(changelogDialog()).getByRole('button', { name: 'Close' })))
    expect(linkMark()).toHaveAttribute('data-lit', 'false')
    expect(screen.getByRole('button', { name: 'Changelog' })).toBe(changelogLink())
  })

  it('the dots persist across boots via the flags (a later same-build boot re-lights nothing but loses nothing)', () => {
    bootAfterUpdate()
    const current = localStorage.getItem(BUILD_STAMP_KEY)
    cleanup()
    document.getElementById('root')?.remove()
    mountApp() // same build now — no new detection…
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(localStorage.getItem(BUILD_STAMP_KEY)).toBe(current)
    expect(gearMark()).toHaveAttribute('data-lit', 'true') // …the flags alone carried the dots over
    openSettings()
    expect(linkMark()).toHaveAttribute('data-lit', 'true')
  })
})

describe('the Changelog popup (modal parity + content)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
    useModePrefs.getState().resetModePrefs()
    useUserDefaults.getState().clearDefaults()
    useProgress.getState().resetProgress()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })
  const openPopup = () => {
    openSettings()
    openChangelog()
  }

  it('renders EVERY entry — dates through the user Date Format setting, items as the plain-words list', () => {
    mountApp()
    openPopup()
    const dialog = changelogDialog()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.activeElement).toBe(dialog) // focus landed IN the dialog on open
    // One bulleted list per entry, all inside the popup's own scroll region. Nothing is held back:
    // round-8 Q8 removed the render-time slice, so the whole array draws and the ten-day cap is the
    // data-shape guard above instead.
    const lists = within(dialog).getAllByRole('list')
    expect(lists).toHaveLength(CHANGELOG.length)
    const scrollRegion = dialog.querySelector('.overflow-y-auto')
    for (const l of lists) expect(scrollRegion.contains(l)).toBe(true)
    // The factory Date Format (Written MDY) renders numerically, the Last-Updated recipe.
    // Each day renders its own Pacific calendar date (round-7 2026-07-21, round-6 2026-07-19,
    // round-5 2026-07-17), driven through the same Date Format setting.
    expect(within(dialog).getByText('7/21/2026')).toBeInTheDocument()
    expect(within(dialog).getByText('7/19/2026')).toBeInTheDocument()
    expect(within(dialog).getByText('7/17/2026')).toBeInTheDocument()
    // Newest day first, each line verbatim.
    expect(
      within(lists[0])
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(CHANGELOG[0].items)
    expect(
      within(lists[1])
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(CHANGELOG[1].items)
    // Input-free by construction: the one control is Close.
    expect(within(dialog).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(dialog).getAllByRole('button')).toHaveLength(1)
  })

  it('wears the settings scroll recipe: py-4 card, the px-4 lane inside the scroll region, px-4 title and Close rows (round-7 Q5)', () => {
    mountApp()
    openPopup()
    const dialog = changelogDialog()
    const scrollRegion = dialog.querySelector('.overflow-y-auto')
    // The card owns vertical padding only; the horizontal 1rem lives INSIDE the scroller (the
    // scrollbar's text-free lane) and on the title and Close rows — components/scrollRegion.
    expect(dialog.className).toContain('py-4')
    expect(dialog.className.split(/\s+/)).not.toContain('p-4')
    expect(scrollRegion.className).toContain('px-4')
    expect(scrollRegion.className).toContain('overscroll-contain')
    expect(dialog.querySelector('#changelog-title').className).toContain('px-4')
    const closeRow = within(dialog).getByRole('button', { name: 'Close' }).parentElement
    expect(closeRow.className).toContain('px-4')
  })

  it('edge fades track scroll position inside the popup (the shared scroll-state listener, round-7 Q5)', () => {
    mountApp()
    openPopup()
    const region = changelogDialog().querySelector('.overflow-y-auto')
    // jsdom has no layout — teach the region a scrollable geometry, then drive scrollTop through
    // real scroll events against the useScrollEdgeState listener attached on open.
    Object.defineProperties(region, {
      scrollHeight: { configurable: true, value: 400 },
      clientHeight: { configurable: true, value: 200 },
    })
    act(() => fireEvent.scroll(region)) // still at the top: content extends below only
    expect(region.className).toContain('fade-scroll-bottom')
    region.scrollTop = 100
    act(() => fireEvent.scroll(region)) // mid-scroll: content past both edges
    expect(region.className).toContain('fade-scroll-both')
    region.scrollTop = 200
    act(() => fireEvent.scroll(region)) // at the bottom: content extends above only
    expect(region.className).toContain('fade-scroll-top')
    expect(region.className).not.toContain('fade-scroll-both')
  })

  it('Close, scrim mousedown/click, and Escape dismiss the popup only — the settings panel survives', () => {
    mountApp()
    openPopup()
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Close' })))
    expect(changelogTitle()).toBeNull()
    expect(screen.getByRole('button', { name: 'Reset Settings' })).toBeInTheDocument()
    openChangelog()
    // The settings click-outside handler must treat the scrim as "inside" (the shared
    // [data-settings-modal] marker)…
    const scrim = document.querySelector('[data-settings-modal]')
    act(() => fireEvent.mouseDown(scrim))
    expect(screen.getByRole('button', { name: 'Reset Settings' })).toBeInTheDocument()
    // …and a scrim CLICK cancels only the popup.
    act(() => fireEvent.click(scrim))
    expect(changelogTitle()).toBeNull()
    expect(screen.getByRole('button', { name: 'Reset Settings' })).toBeInTheDocument()
    openChangelog()
    act(() => fireEvent.keyDown(document.body, { key: 'Escape' })) // capture-phase popup handler wins
    expect(changelogTitle()).toBeNull()
    expect(screen.getByRole('button', { name: 'Reset Settings' })).toBeInTheDocument()
  })

  it('closing Settings closes the popup with it (child flow of the panel)', () => {
    mountApp()
    openPopup()
    expect(changelogTitle()).toBeInTheDocument()
    act(() => fireEvent.click(gear())) // any settings close counts
    expect(changelogTitle()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reset Settings' })).toBeNull()
  })

  it('the single-button Tab trap wraps in place on Close; the mode dropdown stays suppressed', () => {
    mountApp()
    openPopup()
    const close = screen.getByRole('button', { name: 'Close' })
    act(() => {
      close.focus()
      fireEvent.keyDown(close, { key: 'Tab' })
    })
    expect(document.activeElement).toBe(close)
    act(() => fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }))
    expect(document.activeElement).toBe(close)
    // The app-wide Tab shortcut bails while a settings modal is up (the [data-settings-modal]
    // guard) — the mode dropdown must not open behind the aria-modal dialog.
    act(() => fireEvent.keyDown(window, { key: 'Tab' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(changelogTitle()).toBeInTheDocument()
  })

  it('Android Back closes the popup first, then Settings (LIFO overlay stack)', async () => {
    mountApp()
    // Flush jsdom's queued history traversals until quiescent (the saveDefaults.dom pattern):
    // earlier tests' UI closes each ran popOverlay's guarded history.back(), whose to-be-ignored
    // popstate fires on a later task and would otherwise swallow the first synthetic Back below.
    await act(async () => {
      let quiet = 0
      let seen = 0
      const count = () => {
        seen++
      }
      window.addEventListener('popstate', count)
      for (let i = 0; i < 20 && quiet < 2; i++) {
        seen = 0
        await new Promise((r) => setTimeout(r, 0))
        quiet = seen === 0 ? quiet + 1 : 0
      }
      window.removeEventListener('popstate', count)
    })
    // This file's heavy open/close churn can also EXHAUST jsdom's history: a guarded
    // history.back() with no earlier entry never fires its popstate at all, leaving ignorePop
    // stale forever — no amount of flushing delivers a traversal that will never come. Prime it
    // out while nothing is open: a stale flag is consumed here, and with a clean flag the empty
    // overlay stack makes this dispatch a no-op either way.
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    openSettings()
    openChangelog()
    expect(changelogTitle()).toBeInTheDocument()
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(changelogTitle()).toBeNull()
    expect(screen.getByRole('button', { name: 'Reset Settings' })).toBeInTheDocument() // settings survived the first Back
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(screen.queryByRole('button', { name: 'Reset Settings' })).toBeNull()
  })

  it('the Changelog link sits RIGHT of Check for updates in the same footer row', () => {
    mountApp()
    openSettings()
    const check = screen.getByRole('button', { name: 'Check for updates' })
    const link = changelogLink()
    expect(check.parentElement).toBe(link.parentElement)
    expect(check.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('both settings-footer link rows share one row class — equal link gaps (round-7 Q2)', () => {
    mountApp()
    openSettings()
    // The View/Clear row and the Last Updated / Check for updates / Changelog row both wear the
    // hoisted FOOTER_LINK_ROW_CLASS — the guard that the second row can never drift back to its
    // legacy gap-2 (rings touching) while the first sits at gap-3 (~4px ring clearance).
    const viewRow = screen.getByRole('button', { name: 'View saved defaults' }).parentElement
    const updatesRow = screen.getByRole('button', { name: 'Check for updates' }).parentElement
    expect(updatesRow.className).toBe(viewRow.className)
    expect(viewRow.className).toContain('gap-3')
  })
})
