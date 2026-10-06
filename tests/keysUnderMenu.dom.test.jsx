// @vitest-environment jsdom
//
// WHILE THE ⚙ MENU OR A DROPDOWN LIST IS OPEN, THE KEYBOARD CANNOT REACH THE PAGE BEHIND IT
// (round 24).
//
// One rule, asked of the app's stack of open things (components/overlayStack's "THE KEYBOARD'S
// REACH"), in two halves:
//   • every key that acts on the page stands aside (isPageCovered): the answer keys 0–9 and the
//     Game Actions N / R / O / C / S / ← / → (src/main.tsx's handler), and Lookup's own ↑ / ↓ /
//     Backspace / Delete (components/LookupCard's). Until this round only a POPUP stood in their
//     way; under the ⚙ menu — and under an open list — every one of them still acted on the page;
//   • focus cannot be on the page: the menu takes the keyboard as it opens, Tab and Shift+Tab walk
//     its own controls, and closing it hands the keyboard back. A page button that kept focus used
//     to take Enter and Space behind the open menu, and Shift+Tab walked out into the page.
//
// ★ EVERY KEY IS PROVED TWICE — that it DOES act with the menu closed, and that it does NOT with the
// menu open. The first half is not decoration: until the harness gave the app's key handler the one
// layout fact it asks (tests/setup/dom.js, offsetParent), no game key did anything in any DOM test,
// so "the key was ignored" was true of every key in every state and proved nothing.
//
// What the menu deliberately does NOT block is pinned here too: the mode letters, H and G (they
// close the menu or leave the page — documented, and standing on tests in settingsPanel.defaults),
// the arrow keys along a setting's own options, Escape, and typing in the menu's boxes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, cleanup, fireEvent, act } from '@testing-library/react'
import {
  resetAppState,
  mountApp,
  pressKey,
  openSettings,
  isSettingsOpen,
  anyModalOpen,
  pickerChosen,
  focusPill,
  pickerPills,
  yearInput,
  focusYear,
  modeMenuOpen,
  tapModeMenu,
  closeSettings,
  panelEl,
  currentMode,
} from './helpers/settingsPanel.jsx'
import { readDate, statValue } from './helpers/modeScreen.jsx'
import { useSettings } from '../src/store/settings.js'
import { useLookupHistory } from '../src/store/lookupHistory.js'
import { wday } from '../src/lib/calendar.js'
import { DAY } from '../src/lib/format.js'

beforeEach(() => {
  resetAppState()
  const s = useSettings.getState()
  s.setRandomFormat(false)
  s.setDateFormat('numeric-ymd')
  s.setMinY(1583)
  s.setMaxY(10000)
})
afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

const correctKey = () => String(wday(readDate().y, readDate().m, readDate().d))
const wrongKey = () => String((wday(readDate().y, readDate().m, readDate().d) + 1) % 7)
const sameDate = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d
const codesOpen = () => screen.getByRole('button', { name: /Codes/ }).getAttribute('aria-expanded')
const dayButton = (name) => screen.getByRole('button', { name })
const isGreen = (name) => dayButton(name).className.includes('btn-correct-persist')

describe('the game keys act on the page — with nothing open (the positive half)', () => {
  it('0–9 answers the date', () => {
    mountApp()
    pressKey(correctKey())
    expect(statValue('Score')).toBe('1/1')
  })
  it('N draws a new date', () => {
    mountApp()
    const before = readDate()
    pressKey('n')
    expect(sameDate(readDate(), before)).toBe(false)
  })
  it('R reveals the answer', () => {
    mountApp()
    const answer = DAY[wday(readDate().y, readDate().m, readDate().d)]
    pressKey('r')
    expect(isGreen(answer)).toBe(true)
    expect(statValue('Score')).toBe('0/1')
  })
  it('C opens Show Codes', () => {
    mountApp()
    pressKey('c')
    expect(codesOpen()).toBe('true')
  })
  it('O overrides the date just answered, and ← steps back to it', () => {
    mountApp()
    const first = readDate()
    pressKey(correctKey())
    expect(statValue('Score')).toBe('1/1')
    pressKey('o')
    expect(statValue('Score')).toBe('0/1')
    pressKey('ArrowLeft')
    expect(sameDate(readDate(), first)).toBe(true)
    pressKey('ArrowRight')
    expect(sameDate(readDate(), first)).toBe(false)
  })
  it('S opens the Reset Stats question', () => {
    mountApp()
    pressKey(correctKey())
    pressKey('s')
    expect(screen.getByRole('dialog', { name: 'Reset Stats?' })).toBeInTheDocument()
  })
})

describe('with the ⚙ menu open, none of them reaches the page behind it', () => {
  // A page with something for every key to do: one answered date behind the live one (so ← and O
  // have a target), and a fresh date on screen (so a digit, N, R, C and S all would).
  function playedThenMenu() {
    mountApp()
    pressKey(correctKey())
    expect(statValue('Score')).toBe('1/1')
    const live = readDate()
    openSettings('key')
    expect(isSettingsOpen()).toBe(true)
    return live
  }
  const untouched = (live) => {
    expect(sameDate(readDate(), live)).toBe(true) // not answered, not redrawn, not browsed away from
    expect(statValue('Score')).toBe('1/1')
    expect(codesOpen()).toBe('false')
    expect(anyModalOpen()).toBe(false)
    for (const name of DAY) expect(isGreen(name)).toBe(false) // nothing revealed
    expect(isSettingsOpen()).toBe(true) // …and the menu is still up
  }

  it.each([
    ['the right answer key', () => correctKey()],
    ['a wrong answer key', () => wrongKey()],
    ['N', () => 'n'],
    ['R', () => 'r'],
    ['C', () => 'c'],
    ['O', () => 'o'],
    ['S', () => 's'],
    ['←', () => 'ArrowLeft'],
    ['→', () => 'ArrowRight'],
  ])('%s does nothing', (_name, key) => {
    const live = playedThenMenu()
    pressKey(key())
    untouched(live)
  })

  it('and they work again the moment the menu is closed', () => {
    const live = playedThenMenu()
    pressKey('n')
    untouched(live)
    pressKey('Escape')
    expect(isSettingsOpen()).toBe(false)
    pressKey('n')
    expect(sameDate(readDate(), live)).toBe(false)
  })
})

describe('what the ⚙ menu does NOT block', () => {
  it('a mode letter closes the menu and goes to its page', () => {
    mountApp()
    openSettings('key')
    pressKey('f')
    expect(isSettingsOpen()).toBe(false)
    expect(currentMode()).toBe('Flash')
  })
  it('H closes the menu and opens How to Play', () => {
    mountApp()
    openSettings('key')
    pressKey('h')
    expect(isSettingsOpen()).toBe(false)
    expect(currentMode()).toBe('How to Play')
  })
  it('G closes the menu', () => {
    mountApp()
    openSettings('key')
    pressKey('g')
    expect(isSettingsOpen()).toBe(false)
  })
  it('the arrow keys still move along a setting’s options — and do not step the date behind', () => {
    mountApp()
    const first = readDate()
    pressKey(correctKey()) //  a card behind the live one, so ← would have somewhere to go
    const live = readDate()
    openSettings('key')
    const before = pickerChosen('Leap Year Chance')
    const pills = pickerPills('Leap Year Chance')
    focusPill('Leap Year Chance', before[0])
    act(() => fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' }))
    expect(pickerChosen('Leap Year Chance')).not.toEqual(before) // the pick moved…
    expect(pills).toContain(document.activeElement)
    act(() => fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' }))
    expect(pickerChosen('Leap Year Chance')).toEqual(before) // …and moved back
    expect(sameDate(readDate(), live)).toBe(true) // the date behind never stepped
    expect(sameDate(readDate(), first)).toBe(false)
  })
  it('a list in the bar still opens over the menu, and Escape closes one layer at a time', () => {
    mountApp()
    openSettings('key')
    tapModeMenu()
    expect(modeMenuOpen()).toBe(true)
    pressKey('Escape')
    expect(modeMenuOpen()).toBe(false)
    expect(isSettingsOpen()).toBe(true)
    pressKey('Escape')
    expect(isSettingsOpen()).toBe(false)
  })
  it('typing a digit in one of the menu’s boxes types it — and answers nothing', () => {
    mountApp()
    const live = readDate()
    openSettings('key')
    focusYear('min')
    const press = fireEvent.keyDown(yearInput('min'), { key: correctKey() })
    expect(press).toBe(true) // not prevented: the key is the box's
    expect(sameDate(readDate(), live)).toBe(true)
    expect(statValue('Score')).toBe('0/0')
  })
})

// ── THE KEYBOARD ITSELF STAYS IN THE MENU ───────────────────────────────────────────────────────
// jsdom moves no focus for a Tab, so what can be proved here is everything the app does itself:
// where the keyboard is put when the menu opens, the steps the rule takes at the two ends of the
// menu (and refuses to leave to the browser), and where the keyboard goes when the menu closes.
// The steps in between are the browser's own and are walked for real in the round's browser checks.
describe('the keyboard stays in the ⚙ menu while it is open', () => {
  const pageButton = (key) =>
    [...document.querySelectorAll(`button[data-key="${key}"]`)].find((b) => b.offsetParent !== null)
  const tabOn = (el, init = {}) => {
    let delivered = true
    act(() => {
      delivered = fireEvent.keyDown(el, { key: 'Tab', ...init })
    })
    return { taken: !delivered }
  }
  const stops = () =>
    [...panelEl().querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(
      (el) => el.tabIndex >= 0 && !el.disabled && el.offsetParent !== null,
    )

  it('a page button that had the keyboard loses it when the menu opens — Enter and Space cannot reach it', () => {
    mountApp()
    const newButton = pageButton('N')
    act(() => newButton.focus()) // what a click on New leaves behind
    openSettings('key')
    // The menu's card holds the keyboard: a key pressed now is sent to the card, not to New.
    expect(document.activeElement).toBe(panelEl())
    expect(document.activeElement).not.toBe(newButton)
    // …and closing the menu hands it back, so the page behaves as it did before the menu opened.
    closeSettings('key')
    expect(document.activeElement).toBe(newButton)
  })

  it('focus cannot be moved onto the page behind the menu', () => {
    mountApp()
    openSettings('key')
    act(() => pageButton('N').focus())
    expect(document.activeElement).toBe(panelEl())
    expect(panelEl().contains(document.activeElement)).toBe(true)
  })

  it('Tab does not open the mode selector: it goes to the menu`s first control, and wraps at the last', () => {
    mountApp()
    openSettings('key')
    const all = stops()
    expect(all.length).toBeGreaterThan(5)
    // From the gear (where a mouse press leaves the keyboard): not one of the menu's controls, so
    // the rule itself takes the step, to the first of them.
    const gear = screen.getByRole('button', { name: /^Settings/ })
    act(() => gear.focus())
    expect(document.activeElement).toBe(gear) // the gear is in the top bar: within reach
    expect(tabOn(gear).taken).toBe(true)
    expect(document.activeElement).toBe(all[0])
    expect(modeMenuOpen()).toBe(false)
    // Off the last control, forward: wraps to the first.
    act(() => all[all.length - 1].focus())
    expect(tabOn(document.activeElement).taken).toBe(true)
    expect(document.activeElement).toBe(all[0])
    // In the middle the step is the rule's own too: to the next control.
    act(() => all[2].focus())
    expect(tabOn(document.activeElement).taken).toBe(true)
    expect(document.activeElement).toBe(all[3])
    expect(modeMenuOpen()).toBe(false)
  })

  it('Shift+Tab off the first control wraps to the last — it never walks out into the page', () => {
    mountApp()
    openSettings('key')
    const all = stops()
    act(() => all[0].focus())
    expect(tabOn(document.activeElement, { shiftKey: true }).taken).toBe(true)
    expect(document.activeElement).toBe(all[all.length - 1])
    // …and from the card itself, where the keyboard is when the menu was opened with G.
    act(() => panelEl().focus())
    expect(tabOn(document.activeElement, { shiftKey: true }).taken).toBe(true)
    expect(document.activeElement).toBe(all[all.length - 1])
  })

  it('with the menu closed, Tab is the mode selector`s again', () => {
    mountApp()
    openSettings('key')
    closeSettings('key')
    pressKey('Tab')
    expect(modeMenuOpen()).toBe(true)
  })
})

describe('an open dropdown list blocks the page`s keys like the menu does', () => {
  it('0–9, N, R, C and ← do nothing behind the open mode list; its own keys still work', () => {
    mountApp()
    pressKey(correctKey())
    expect(statValue('Score')).toBe('1/1')
    const live = readDate()
    pressKey('Tab') // the page's way to open the mode list
    expect(modeMenuOpen()).toBe(true)
    const trigger = document.activeElement
    for (const k of [correctKey(), wrongKey(), 'n', 'r', 'ArrowLeft', 'ArrowRight'])
      act(() => void fireEvent.keyDown(trigger, { key: k }))
    expect(sameDate(readDate(), live)).toBe(true)
    expect(statValue('Score')).toBe('1/1')
    expect(modeMenuOpen()).toBe(true)
    // The list's own keys: ↓ moves its cursor, Enter chooses — and the page is the new mode's.
    act(() => void fireEvent.keyDown(trigger, { key: 'End' }))
    act(() => void fireEvent.keyDown(trigger, { key: 'Enter' }))
    expect(modeMenuOpen()).toBe(false)
    expect(currentMode()).toBe('How to Play')
  })

  it('…and once the list is closed the same keys act again', () => {
    mountApp()
    const before = readDate()
    pressKey('Tab')
    act(() => void fireEvent.keyDown(document.activeElement, { key: 'n' }))
    expect(sameDate(readDate(), before)).toBe(true)
    pressKey('Escape')
    expect(modeMenuOpen()).toBe(false)
    pressKey('n')
    expect(sameDate(readDate(), before)).toBe(false)
  })
})

// A list in the top bar belongs to no screen and no menu, so nothing a mode letter, H or G does
// used to take it away: it stayed open over the new page, still holding the keyboard — or under a
// ⚙ menu that Escape then closed FIRST, though the list was the thing on top.
describe('a mode letter, H or G closes an open top-bar list as it acts', () => {
  const presetList = () => screen.getByRole('button', { name: /^Preset,/ })
  const openPresetList = () => act(() => void fireEvent.click(presetList()))

  it.each([
    ['the mode list', () => tapModeMenu()],
    ['the preset list', () => openPresetList()],
  ])('%s, with the menu closed: a mode letter, H, G', (_name, openList) => {
    mountApp()
    openList()
    expect(modeMenuOpen()).toBe(true)
    pressKey('D')
    expect(currentMode()).toBe('Deduction')
    expect(modeMenuOpen()).toBe(false)

    openList()
    pressKey('H')
    expect(currentMode()).toBe('How to Play')
    expect(modeMenuOpen()).toBe(false)

    openList()
    pressKey('G')
    expect(isSettingsOpen()).toBe(true)
    expect(modeMenuOpen()).toBe(false)
    // …so Escape closes the menu, the one thing open, and not a list left over it.
    pressKey('Escape')
    expect(isSettingsOpen()).toBe(false)
  })

  it.each([
    ['the mode list', () => tapModeMenu()],
    ['the preset list', () => openPresetList()],
  ])('%s, over the open menu: G, a mode letter and H close both', (_name, openList) => {
    mountApp()
    for (const [key, lands] of [
      ['G', null],
      ['B', 'Blitz'],
      ['H', 'How to Play'],
    ]) {
      openSettings('key')
      openList()
      expect(modeMenuOpen()).toBe(true)
      pressKey(key)
      expect(modeMenuOpen()).toBe(false)
      expect(isSettingsOpen()).toBe(false)
      if (lands) expect(currentMode()).toBe(lands)
    }
  })

  it('the menu`s own "Open in" list goes with the menu', () => {
    mountApp()
    openSettings('key')
    act(() => void fireEvent.click(screen.getByRole('button', { name: /^Open in/ })))
    expect(modeMenuOpen()).toBe(true)
    pressKey('G')
    expect(modeMenuOpen()).toBe(false)
    expect(isSettingsOpen()).toBe(false)
  })
})

describe('closing the ⚙ menu hands the keyboard back to where it was', () => {
  // Tab opens the mode list (the keyboard goes onto its button), G opens the menu over it, Tab
  // walks into the menu, Escape closes it — and the keyboard used to be left on nothing.
  it('Tab, G, Tab, Escape: back on the Mode button', () => {
    mountApp()
    pressKey('Tab')
    const mode = screen.getByRole('button', { name: /^Mode,/ })
    expect(document.activeElement).toBe(mode)
    pressKey('G')
    expect(isSettingsOpen()).toBe(true)
    expect(document.activeElement).toBe(mode)
    act(() => void fireEvent.keyDown(mode, { key: 'Tab' }))
    expect(panelEl().contains(document.activeElement)).toBe(true)
    act(() => void fireEvent.keyDown(document.activeElement, { key: 'Escape' }))
    expect(isSettingsOpen()).toBe(false)
    expect(document.activeElement).toBe(mode)
  })
})

describe('Lookup’s own keys follow the same rule', () => {
  const entry = (id, y, m, d) => ({ id, y, m, d })
  function lookupWithHistory() {
    useLookupHistory
      .getState()
      .setHistory([entry('a', 2001, 1, 1), entry('b', 2002, 2, 2), entry('c', 2003, 3, 3)])
    mountApp()
    pressKey('l')
    expect(currentMode()).toBe('Lookup')
  }
  const selectedRows = () =>
    document.querySelectorAll('[aria-selected="true"], [aria-current="true"]')
  // The Lookup date box — by its placeholder, since with the ⚙ menu open the menu's own boxes are
  // text boxes too.
  const box = () => screen.getByPlaceholderText(/^e\.g\., /)
  // Lookup listens on the document, so its keys are pressed where a real key press starts: on the
  // page (the event then bubbles on to the window, where the game keys listen).
  const pressOnPage = (key) => act(() => fireEvent.keyDown(document.body, { key }))

  it('with nothing open, ↓ selects a history row and Backspace clears it again', () => {
    lookupWithHistory()
    expect(box().value).toBe('')
    pressOnPage('ArrowDown')
    expect(box().value).not.toBe('') // selecting a row fills the box with its date
    const first = box().value
    pressOnPage('ArrowDown')
    expect(box().value).not.toBe(first)
    pressOnPage('ArrowUp')
    expect(box().value).toBe(first)
    pressOnPage('Backspace')
    expect(box().value).toBe('')
    expect(selectedRows().length).toBe(0)
  })

  it('with the ⚙ menu open, ↑ / ↓ / Backspace / Delete leave the page behind it alone', () => {
    lookupWithHistory()
    pressOnPage('ArrowDown')
    const selected = box().value
    expect(selected).not.toBe('')
    openSettings('key')
    for (const key of ['ArrowDown', 'ArrowUp', 'Backspace', 'Delete']) {
      pressOnPage(key)
      expect(box().value).toBe(selected)
    }
    expect(isSettingsOpen()).toBe(true)
    // …and with the menu closed they act again.
    pressKey('Escape')
    pressOnPage('Delete')
    expect(box().value).toBe('')
  })
})
