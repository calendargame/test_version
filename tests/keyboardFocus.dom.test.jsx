// @vitest-environment jsdom
//
// keyboardFocus.dom — THE KEYBOARD'S FOCUS RING, in the ⚙ menu and in every popup.
//
// The ring is three facts joined by one stylesheet rule, and each fact has its own owner:
//   • WHICH control has focus — the browser's :focus;
//   • WHETHER the keyboard is what is being used — src/lib/keyboardFocus, one attribute on <html>;
//   • WHERE a ring is drawn at all — a .focus-scope: the ⚙ menu's card and every popup's scrim.
//
// ⚠ WHAT NO CASE HERE CAN PROVE. jsdom draws nothing and has no cascade worth trusting for layered
// CSS, so "a ring is on the screen" is not a thing this file can see. What it pins is each fact
// above and the exact rule that joins them, read from src/index.css. The ring itself — on every
// kind of control, in a dark and a light theme, absent under a mouse and a finger — was looked at
// in a real browser.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanup, act, fireEvent, screen, within } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { installKeyboardFocus, KEYBOARD_ATTR } from '../src/lib/keyboardFocus.js'
import {
  resetAppState,
  mountApp,
  openSettings,
  openModal,
  modalScrim,
} from './helpers/settingsPanel.jsx'
import { MODAL_SCRIM_CLASS } from '../src/components/modalContract.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cssCode = readFileSync(join(root, 'src', 'index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)
const byKeyboard = () => document.documentElement.hasAttribute(KEYBOARD_ATTR)
const press = (target = document.body) =>
  act(() => {
    fireEvent.pointerDown(target)
  })
const key = (k, target = document.body, init = {}) =>
  act(() => {
    fireEvent.keyDown(target, { key: k, ...init })
  })

describe('lib/keyboardFocus — is the keyboard what is being used?', () => {
  let uninstall
  let box
  let button
  beforeEach(() => {
    uninstall = installKeyboardFocus()
    box = document.createElement('input')
    box.type = 'text'
    button = document.createElement('button')
    document.body.append(box, button)
  })
  afterEach(() => {
    uninstall()
    box.remove()
    button.remove()
  })

  it('starts as "not the keyboard": nothing is ringed until a key is pressed', () => {
    expect(byKeyboard()).toBe(false)
  })

  it('a key on a control is the keyboard; the next press of a finger or mouse is not', () => {
    key('ArrowRight', button)
    expect(byKeyboard()).toBe(true)
    press(button)
    expect(byKeyboard()).toBe(false)
    key(' ', button) // the first key after a press: the keyboard has taken over
    expect(byKeyboard()).toBe(true)
  })

  it('Tab counts from anywhere — it is the key that moves focus', () => {
    key('Tab')
    expect(byKeyboard()).toBe(true)
    press()
    key('Tab', box) // …including from inside a text box
    expect(byKeyboard()).toBe(true)
  })

  // A phone's on-screen keyboard sends the same key events as a real one. A tap into a year box
  // followed by typing must never light a ring on it.
  it('typing in a text box is NOT the keyboard driving the app', () => {
    press(box)
    for (const k of ['1', '9', 'Backspace', 'ArrowLeft', 'Enter', 'Escape']) key(k, box)
    expect(byKeyboard()).toBe(false)
  })

  it('a slider is not a text box: its arrow keys are the keyboard', () => {
    const range = document.createElement('input')
    range.type = 'range'
    document.body.append(range)
    press(range)
    key('ArrowRight', range)
    expect(byKeyboard()).toBe(true)
    range.remove()
  })

  it('a modifier going down, or a shortcut addressed to the browser, changes nothing', () => {
    for (const k of ['Shift', 'Control', 'Alt', 'Meta']) key(k, button)
    key('r', button, { ctrlKey: true })
    key('Tab', button, { altKey: true })
    key('c', button, { metaKey: true })
    expect(byKeyboard()).toBe(false)
    key('Tab', button, { shiftKey: true }) // Shift+Tab is a Tab
    expect(byKeyboard()).toBe(true)
  })

  it('is heard even when a control stops the press or the key it considers its own', () => {
    const stop = (e) => e.stopPropagation()
    button.addEventListener('keydown', stop)
    button.addEventListener('pointerdown', stop)
    key('Enter', button)
    expect(byKeyboard()).toBe(true)
    press(button)
    expect(byKeyboard()).toBe(false)
  })

  it('uninstalling takes the listeners and the mark with it', () => {
    key('Tab')
    uninstall()
    expect(byKeyboard()).toBe(false)
    key('Tab')
    expect(byKeyboard()).toBe(false)
    uninstall = installKeyboardFocus() // afterEach's uninstall needs a live one
  })
})

describe('the rule in index.css that draws it', () => {
  it('rings what has focus inside a scope, only while the keyboard is in use', () => {
    const rule = new RegExp(
      `(?:^|\\})\\s*:root\\[${KEYBOARD_ATTR}\\] \\.focus-scope :focus:not\\(([^)]*)\\)\\{([^}]*)\\}`,
    ).exec(cssCode)
    expect(rule).not.toBeNull()
    // A real, solid, 2px line in a named colour — and INSIDE the control's edge by default, so no
    // scroll region can clip it.
    expect(rule[2]).toBe(
      'outline:2px solid var(--kbd-ring,var(--tx-50));outline-offset:var(--kbd-ring-offset,-2px)',
    )
    // The two things in a scope that take focus and are not ringed themselves.
    expect(rule[1].split(',').sort()).toEqual(['[role="dialog"]', '[type="range"]'].sort())
  })

  it('EVERY selector that draws a ring starts at a scope and at the keyboard mark', () => {
    // The rule above once had a second, unscoped half — `,[data-kbd-cursor]` — and it ringed the
    // arrow-reached option of the frosted lists in the TOP BAR, outside every scope. A rule is as
    // wide as its widest selector, so each comma-separated one is checked on its own.
    const rings = [...cssCode.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, , body]) =>
      /outline:2px solid var\(--kbd-ring/.test(body),
    )
    expect(rings.length).toBe(1)
    for (const selector of rings[0][1].split(/,(?![^(]*\))/))
      expect(selector.trim().startsWith(`:root[${KEYBOARD_ATTR}] .focus-scope `)).toBe(true)
    expect(cssCode).not.toContain('data-kbd-cursor')
  })

  it('a control marked unavailable takes a DOTTED ring, not the solid one', () => {
    expect(cssCode).toContain(
      `:root[${KEYBOARD_ATTR}] .focus-scope [aria-disabled="true"]:focus{outline-style:dotted}`,
    )
  })

  it('never draws it from plain :focus or from the browser`s :focus-visible guess', () => {
    // :focus-visible matches a tapped text box and any scripted focus that follows a key press.
    expect(cssCode).not.toMatch(/:focus-visible/)
    // Every rule that gives a focused element a VISIBLE outline is gated on the keyboard mark.
    const visible = [...cssCode.matchAll(/([^{}]*:focus[^{}]*)\{([^}]*)\}/g)].filter(
      ([, , body]) => /outline:2px solid (?!transparent)/.test(body) || /box-shadow/.test(body),
    )
    expect(visible.length).toBe(3) // the ring, and the slider thumb for the two engines
    for (const [, selector] of visible) expect(selector).toContain(`:root[${KEYBOARD_ATTR}]`)
  })

  it('inside a scope the browser draws nothing of its own, for a press or for a key', () => {
    // …the scope ITSELF included: the ⚙ menu's card is a scope and holds the keyboard when the
    // menu opens.
    expect(cssCode).toContain(
      '.focus-scope:focus,.focus-scope :focus{outline:2px solid transparent;outline-offset:-2px}',
    )
  })

  it('a slider wears it on the thumb — in both engines` spelling', () => {
    for (const thumb of ['::-webkit-slider-thumb', '::-moz-range-thumb'])
      expect(cssCode).toContain(
        `:root[${KEYBOARD_ATTR}] .focus-scope input[type="range"]:focus${thumb}{box-shadow:0 0 0 2px var(--card-bg),0 0 0 4px var(--kbd-ring,var(--tx-50))}`,
      )
  })

  it('is white and further in on a filled control, and outside the readout — the drag ring too', () => {
    expect(cssCode).toContain('.btn-solid,.ring-on-fill{--kbd-ring:#fff;--kbd-ring-offset:-4px}')
    expect(cssCode).toContain('.ring-outside{--kbd-ring:var(--tx-50);--kbd-ring-offset:2px}')
    // The press-drag ring is inset everywhere else; on the readout that ran it through the digits.
    expect(cssCode).toContain('.ring-outside.drag-target{outline-offset:2px}')
  })

  // A Tailwind utility outranks the whole `components` layer the ring lives in, so one outline
  // utility on a control would silently take the ring off it — which is how the reorder grip lost
  // its only keyboard indicator once. The suppressor is index.css's .focus-ring class instead.
  it('no control in the app wears a Tailwind outline utility', () => {
    const files = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(tsx?|jsx?)$/.test(name)) files.push(p)
      }
    }
    walk(join(root, 'src'))
    const offenders = files.filter((f) =>
      /(^|[\s"'`:])outline-(hidden|none|\d|offset-)/.test(readFileSync(f, 'utf8')),
    )
    expect(offenders).toEqual([])
    expect(cssCode).toContain('.focus-ring:focus{outline:2px solid transparent;outline-offset:2px}')
  })
})

describe('the scopes: the ⚙ menu and every popup', () => {
  beforeEach(() => {
    resetAppState()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('the ⚙ menu`s card is a focus scope', () => {
    mountApp()
    openSettings()
    expect(document.getElementById('settings-popover').classList.contains('focus-scope')).toBe(true)
  })

  // Every popup is drawn in components/Popup, and the scope is its scrim's own class — so a popup
  // cannot be without it. Three are opened here (a list of controls, a text-only card, and the one
  // with the reorder grip); the rest need arranging to open at all and add nothing to the claim.
  it.each(['manage', 'changelog', 'presets'])('the %s popup`s scrim is a focus scope', (modal) => {
    mountApp()
    openSettings()
    openModal(modal)
    expect(modalScrim(modal).classList.contains('focus-scope')).toBe(true)
    expect(modalScrim(modal).className).toContain(MODAL_SCRIM_CLASS)
  })

  it('the app keeps the mark: a key sets it, a press clears it', () => {
    mountApp()
    key('Tab')
    expect(byKeyboard()).toBe(true)
    press()
    expect(byKeyboard()).toBe(false)
  })

  // The open list is driven from its button, which keeps the real focus — so the BUTTON is what the
  // ring is on, list open or shut, and nothing in the list is marked for one (tests/customselect).
  it('the ⚙ menu`s list button keeps the keyboard while its list is open', () => {
    mountApp()
    openSettings()
    const trigger = within(document.getElementById('settings-popover')).getByRole('button', {
      name: /^Open in/,
    })
    act(() => {
      fireEvent.click(trigger)
    })
    key('ArrowDown', trigger)
    const options = screen.getAllByRole('option')
    expect(document.activeElement).toBe(trigger)
    expect(trigger.closest('.focus-scope')).not.toBeNull() // it is in a scope: the ring is drawn
    expect(trigger.getAttribute('aria-activedescendant')).toBe(options[1].id)
    for (const option of options) {
      expect(option.hasAttribute('data-kbd-cursor')).toBe(false)
      expect(option.closest('.focus-scope')).toBeNull() // …and the list is in none
    }
  })
})
