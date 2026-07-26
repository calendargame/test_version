// @vitest-environment jsdom
//
// ⚙ Settings → Display — DOM tests for the segmented pill trays and the radio-group a11y pass
// (round-8). What jsdom CAN prove, and does here:
//
//   • PillTray (components/PillTray) renders the date-format and theme groups as role="radio"
//     segments, and its `disabled` prop both publishes the lock (aria-disabled) and GUARDS
//     onChange — so a click that slips past the wrapper's pointer-events-none cannot change the
//     value. (The visible dim itself is the caller's wrapper class, asserted as a class string.)
//   • The five themes are two ALWAYS-PRESENT rows, not the two/three dropdowns they replaced.
//     The same rows render in both Use-System states — that is what stops the panel reflowing
//     when the switch is flipped — and only the SELECTION semantics differ: two independent
//     picks when the OS decides, exactly one pick across both rows when it doesn't.
//   • Flipping Use System Settings OFF seeds the manual theme from what is ALREADY on screen, so
//     the switch never jumps the user to a different look (the round-8 bug).
//   • Every mutually-exclusive group in the panel is a role="radiogroup" of role="radio" buttons,
//     and A GROUP IS A CHOICE, NOT A ROW. Where two trays share one setting the radiogroup spans
//     both of them — the five date formats always, and the two theme rows while Use System is off
//     — because a group reporting "nothing selected" while the real pick sits in a sibling group
//     states something false. The theme grouping therefore FOLLOWS the switch, and the pills in
//     the one date-format group state their half in their accessible names, since 'MDY' and 'DMY'
//     each appear in both trays and radios in one group have to be tellable apart.
//
// What it CANNOT prove: the concentric-housing geometry, the dim, and the press-drag dismissal
// are pixels and pointers — on-device only.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup, fireEvent, act } from '@testing-library/react'
import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'

function mountApp() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  const utils = render(<App />)
  act(() => {
    fireEvent.keyDown(window, { key: 'G' }) // open the ⚙ popover
  })
  return utils
}
// Every group under test is a labelled radiogroup, so one scoped accessor serves them all.
const group = (name) => within(screen.getByRole('radiogroup', { name }))
const pills = (name) => group(name).getAllByRole('radio')
const checked = (name) =>
  pills(name)
    .filter((b) => b.getAttribute('aria-checked') === 'true')
    .map((b) => b.textContent.trim())
const labels = (name) => pills(name).map((b) => b.textContent.trim())
// A visual ROW, found by its caption instead of by a role — which is the point: which radiogroup
// owns a theme row depends on Use System, but the row itself is there either way. The caption is
// the SectionLabel DIV, so this never catches the same-named 'Light' pill (a BUTTON).
const rowOf = (caption) =>
  within(screen.getAllByText(caption).find((el) => el.tagName === 'DIV').parentElement)
const rowPills = (caption) => rowOf(caption).getAllByRole('radio')
const rowLabels = (caption) => rowPills(caption).map((b) => b.textContent.trim())
const rowChecked = (caption) =>
  rowPills(caption)
    .filter((b) => b.getAttribute('aria-checked') === 'true')
    .map((b) => b.textContent.trim())
const st = () => useSettings.getState()
// The On/Off switches sit in a label+button row and all read "On"/"Off", so they are found by
// their LABEL's row rather than by an accessible name that would match every one of them.
const toggle = (label) => screen.getByText(label).parentElement.querySelector('button')
const clickToggle = (label) =>
  act(() => {
    fireEvent.click(toggle(label))
  })

describe('Settings → Display — theme pill rows', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  // The panel must not change height when the switch is flipped, which starts with both rows
  // existing in both states — the defect the two/three dropdowns had by construction.
  it('renders the SAME two rows, with the same pills, in both Use-System states', () => {
    mountApp()
    expect(rowLabels('Dark')).toEqual(['Dusk', 'Midnight', 'Nebula'])
    expect(rowLabels('Light')).toEqual(['Light', 'Parchment'])
    clickToggle('Use System Settings')
    expect(st().useSystem).toBe(false)
    expect(rowLabels('Dark')).toEqual(['Dusk', 'Midnight', 'Nebula'])
    expect(rowLabels('Light')).toEqual(['Light', 'Parchment'])
  })

  // Centered in BOTH states: a left-aligned SectionLabel is reserved for the DISPLAY/DATES/STATS
  // headers and would out-rank the "Theme" sub-label these sit under.
  it('captions read Dark / Light and stay centered in both Use-System states', () => {
    mountApp()
    const caption = (text) => screen.getAllByText(text).find((el) => el.tagName === 'DIV')
    for (const pass of ['system on', 'system off']) {
      expect(caption('Dark').className).toContain('text-center')
      expect(caption('Light').className).toContain('text-center')
      if (pass === 'system on') clickToggle('Use System Settings')
    }
  })

  // The OS owns which row is live, so the two picks are genuinely independent — two choices, and
  // therefore two radiogroups.
  it('Use System ON: two INDEPENDENT picks, modelled as two radiogroups', () => {
    mountApp()
    expect(labels('Dark theme')).toEqual(['Dusk', 'Midnight', 'Nebula'])
    expect(labels('Light theme')).toEqual(['Light', 'Parchment'])
    expect(screen.queryByRole('radiogroup', { name: 'Theme' })).toBeNull()
    expect(checked('Dark theme')).toEqual(['Dusk']) // darkTheme
    expect(checked('Light theme')).toEqual(['Light']) // lightTheme — both lit at once
    act(() => {
      fireEvent.click(group('Dark theme').getByRole('radio', { name: 'Nebula' }))
    })
    act(() => {
      fireEvent.click(group('Light theme').getByRole('radio', { name: 'Parchment' }))
    })
    expect(st().darkTheme).toBe('nebula')
    expect(st().lightTheme).toBe('parchment')
    expect(checked('Dark theme')).toEqual(['Nebula'])
    expect(checked('Light theme')).toEqual(['Parchment']) // the dark pick did not disturb it
  })

  // One pick across both rows — so ONE radiogroup spans them. Two would each announce themselves
  // as an independent choice, and the row without manualTheme would read "nothing selected" while
  // the user has in fact selected a theme.
  it('Use System OFF: ONE pick across BOTH rows, modelled as ONE radiogroup', () => {
    mountApp()
    clickToggle('Use System Settings')
    // The per-row groups are gone; one group owns all five pills, in row order.
    expect(screen.queryByRole('radiogroup', { name: 'Dark theme' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Light theme' })).toBeNull()
    expect(labels('Theme')).toEqual(['Dusk', 'Midnight', 'Nebula', 'Light', 'Parchment'])
    act(() => {
      fireEvent.click(group('Theme').getByRole('radio', { name: 'Midnight' }))
    })
    expect(st().manualTheme).toBe('midnight')
    expect(checked('Theme')).toEqual(['Midnight']) // exactly one, across both rows
    expect(rowChecked('Light')).toEqual([]) // and it is the dark row that holds it
    act(() => {
      fireEvent.click(group('Theme').getByRole('radio', { name: 'Parchment' }))
    })
    expect(st().manualTheme).toBe('parchment')
    expect(checked('Theme')).toEqual(['Parchment'])
    expect(rowChecked('Dark')).toEqual([])
  })
})

// ── Part C: the Use-System toggle must not jump the theme ────────────────────────────────────
// Turning the switch OFF used to hand control to whatever manualTheme happened to hold, which at
// factory settings is 'dusk' — so a user looking at Light got thrown into a dark theme by a
// switch that says nothing about which theme. The fix seeds manualTheme from the ALREADY-ACTIVE
// theme, so the lit pill stays lit and only its meaning changes (OS-chosen → the single manual
// pick). setup/dom.js mocks matchMedia to matches:false, so systemIsDark is false unless a test
// overrides it — the light row is the live one by default.
describe('Settings → Display — flipping Use System Settings OFF never changes the theme', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
    vi.unstubAllGlobals()
  })

  const flipOff = () => clickToggle('Use System Settings')

  it('light system: seeds the manual theme from the LIGHT row, not from stale manualTheme', () => {
    mountApp()
    expect(st().manualTheme).toBe('dusk') // the stale value the old code would have jumped to
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    flipOff()
    expect(st().manualTheme).toBe('light') // seeded from activeTheme
    expect(document.documentElement.getAttribute('data-theme')).toBe('light') // no jump
    expect(rowChecked('Light')).toEqual(['Light']) // the lit pill stayed lit
    expect(rowChecked('Dark')).toEqual([])
  })

  it('seeds from the live row even after that row is re-picked', () => {
    mountApp()
    act(() => {
      fireEvent.click(rowOf('Light').getByRole('radio', { name: 'Parchment' }))
    })
    expect(document.documentElement.getAttribute('data-theme')).toBe('parchment')
    flipOff()
    expect(st().manualTheme).toBe('parchment')
    expect(document.documentElement.getAttribute('data-theme')).toBe('parchment')
  })

  // Proves the seed reads activeTheme (which follows the OS) and not lightTheme by luck: with a
  // DARK system the dark row is live, so the seed must come from there.
  it('dark system: seeds from the DARK row', () => {
    vi.stubGlobal('matchMedia', (query) => ({
      matches: query.includes('dark'), // prefers-color-scheme: dark → true; hover/pointer → false
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }))
    useSettings.getState().setDarkTheme('nebula')
    mountApp()
    expect(document.documentElement.getAttribute('data-theme')).toBe('nebula')
    flipOff()
    expect(st().manualTheme).toBe('nebula')
    expect(document.documentElement.getAttribute('data-theme')).toBe('nebula')
    expect(rowChecked('Dark')).toEqual(['Nebula'])
    expect(rowChecked('Light')).toEqual([])
  })

  // The gear's violet "modified" bar means "live state differs from your defaults". A dormant
  // value must not light it: an OFF→ON round trip parks manualTheme at whatever was on screen
  // (that IS the seed above), and on a light-mode phone that is 'light' against a 'dusk' default.
  // Comparing stored rather than in-effect values lit the bar — and un-dimmed Reset Settings and
  // Full Reset — on an app the user had only toggled a switch on and back off.
  it('an OFF→ON round trip leaves the panel reading UNMODIFIED', () => {
    mountApp()
    // The Reset Settings button dims itself exactly when the panel sits at its effective
    // defaults, so it is the readable proxy for "nothing is modified".
    const resetSettings = () => screen.getByRole('button', { name: 'Reset Settings' })
    expect(resetSettings().className).toContain('pointer-events-none') // factory-fresh
    flipOff()
    expect(st().manualTheme).toBe('light') // the seed diverges from the 'dusk' default…
    expect(resetSettings().className).not.toContain('pointer-events-none') // useSystem is off: real
    flipOff() // …and back on, so manualTheme is dormant again
    expect(st().useSystem).toBe(true)
    expect(st().manualTheme).toBe('light') // still parked — deliberately, so OFF never jumps
    expect(resetSettings().className).toContain('pointer-events-none') // yet nothing reads modified
  })
})

// ── Part A: the date-format trays + PillTray's disabled contract ─────────────────────────────
describe('Settings → Display — date-format trays', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  // Both halves read and write the ONE dateFormat setting, so ONE radiogroup spans them: five
  // ids, one pick, wearing two housings. The pills' accessible names carry the half — which is
  // what keeps the two 'MDY's and the two 'DMY's apart now that they share a group.
  it('is ONE radiogroup of five formats, named by half', () => {
    mountApp()
    expect(screen.queryByRole('radiogroup', { name: 'Written date format' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Numeric date format' })).toBeNull()
    expect(pills('Date Format').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Written MDY',
      'Written DMY',
      'Numeric MDY',
      'Numeric DMY',
      'Numeric YMD',
    ])
    // The visible label stays the bare initialism, and it is contained in the accessible name —
    // so speaking what you can see still activates the pill (WCAG 2.5.3 Label in Name).
    expect(labels('Date Format')).toEqual(['MDY', 'DMY', 'MDY', 'DMY', 'YMD'])
    pills('Date Format').forEach((b) =>
      expect(b.getAttribute('aria-label')).toContain(b.textContent.trim()),
    )
  })

  it('exactly one of the five is selected, wherever it lives', () => {
    mountApp()
    const checkedName = () =>
      pills('Date Format')
        .filter((b) => b.getAttribute('aria-checked') === 'true')
        .map((b) => b.getAttribute('aria-label'))
    expect(checkedName()).toEqual(['Written MDY']) // the factory default
    act(() => {
      fireEvent.click(group('Date Format').getByRole('radio', { name: 'Numeric YMD' }))
    })
    expect(st().dateFormat).toBe('numeric-ymd')
    expect(checkedName()).toEqual(['Numeric YMD']) // still exactly one, now in the other tray
  })

  // Random Format dims the whole group. The wrapper's pointer-events-none is the visible half;
  // these are the two halves it does NOT cover — the lock is published to assistive tech, and
  // onChange is guarded so a click dispatched past pointer-events-none cannot change the value.
  it('Random Format ON locks the group: aria-disabled, dimmed wrapper, and onChange guarded', () => {
    mountApp()
    clickToggle('Random Format')
    expect(st().randomFormat).toBe(true)
    pills('Date Format').forEach((b) => expect(b.getAttribute('aria-disabled')).toBe('true'))
    // The radiogroup IS the dim wrapper, so the dim provably covers the captions inside it too.
    const wrapper = screen.getByRole('radiogroup', { name: 'Date Format' })
    expect(wrapper.className).toContain('opacity-60')
    expect(wrapper.className).toContain('pointer-events-none')
    expect(within(wrapper).getByText('Written')).toBeInTheDocument()
    expect(within(wrapper).getByText('Numeric')).toBeInTheDocument()
    act(() => {
      fireEvent.click(group('Date Format').getByRole('radio', { name: 'Numeric DMY' }))
    })
    expect(st().dateFormat).toBe('written-mdy') // unchanged — the guard held
  })

  it('Random Format OFF leaves the group live and unmarked', () => {
    mountApp()
    pills('Date Format').forEach((b) => expect(b.getAttribute('aria-disabled')).toBe(null))
    act(() => {
      fireEvent.click(group('Date Format').getByRole('radio', { name: 'Written DMY' }))
    })
    expect(st().dateFormat).toBe('written-dmy')
  })
})

// ── Parts E + F: identical semantics everywhere, and the dropdowns are gone ──────────────────
describe('Settings → Display — radio semantics and the retired theme dropdowns', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  // If radio semantics go in, they go everywhere the same semantics already existed — several of
  // these groups carried aria-disabled but no role, i.e. they announced their LOCK but not their
  // structure. Every mutually-exclusive choice in the panel is now one radiogroup of radios, and
  // every one of them holds exactly one checked pill — which is only true because the groups are
  // drawn around CHOICES: Date Format spans its two trays, and the theme rows are two groups here
  // solely because Use System is on, making them two genuine choices.
  it('every mutually-exclusive choice in the panel is a radiogroup with exactly one checked', () => {
    mountApp()
    const expected = {
      'Date Format': 5,
      'Dark theme': 3,
      'Light theme': 2,
      Input: 2,
      'Julian Chance': 5,
      'Leap Year Chance': 4,
      'Jan/Feb Chance on Leap Years': 5,
    }
    for (const [name, count] of Object.entries(expected)) {
      expect(pills(name)).toHaveLength(count)
      pills(name).forEach((b) => expect(b.tagName).toBe('BUTTON'))
      expect(checked(name)).toHaveLength(1)
    }
  })

  // The same invariant with the switch off, where the theme rows collapse into one choice. No
  // group may ever report an empty selection, which is the whole reason the grouping follows the
  // semantics instead of the layout.
  it('holds with Use System off, where the theme rows become one choice', () => {
    mountApp()
    clickToggle('Use System Settings')
    for (const [name, count] of Object.entries({
      'Date Format': 5,
      Theme: 5,
      Input: 2,
      'Julian Chance': 5,
      'Leap Year Chance': 4,
      'Jan/Feb Chance on Leap Years': 5,
    })) {
      expect(pills(name)).toHaveLength(count)
      expect(checked(name)).toHaveLength(1)
    }
    // No group anywhere in the panel announces itself as an unmade choice.
    screen.getAllByRole('radiogroup').forEach((g) => {
      const lit = within(g)
        .getAllByRole('radio')
        .filter((b) => b.getAttribute('aria-checked') === 'true')
      expect(lit).toHaveLength(1)
    })
  })

  // The theme CustomSelects are gone; the bar's mode selector is the app's last dropdown.
  it('the panel holds no dropdown — the mode selector is the only listbox trigger left', () => {
    mountApp()
    const triggers = screen
      .getAllByRole('button', { hidden: true })
      .filter((b) => b.getAttribute('aria-haspopup') === 'listbox')
    expect(triggers).toHaveLength(1)
    expect(triggers[0].getAttribute('aria-label')).toBe('Mode')
  })
})
