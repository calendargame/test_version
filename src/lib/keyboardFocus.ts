// lib/keyboardFocus.ts — is the KEYBOARD what the player is using right now? The one fact the app's
// focus ring is drawn from (index.css, "THE KEYBOARD FOCUS RING"), kept as one attribute on <html>:
// present while the last thing used was the keyboard, absent while it was a finger, a mouse or a pen.
//
// WHY THE APP KEEPS THIS ITSELF instead of leaving it to the browser's :focus-visible. That
// pseudo-class is the browser's GUESS at the same question, and the guess is wrong in exactly the
// places this app has:
//   • a TEXT BOX matches it on every focus, a tap included — so a ring drawn from it would light up
//     under a finger entering a year or a preset name;
//   • a focus placed BY SCRIPT matches it whenever the keyboard was the last thing the browser saw
//     — and a press here often focuses from script: grabbing a preset's reorder grip, releasing a
//     press-drag on a year box, choosing a pill (components/PillTray focuses the one it activates,
//     because Safari does not), opening a list, closing a popup that hands focus back. After one
//     Tab, each of those drew a keyboard ring under the pointer.
// The reorder grip used to carry its own mark for the second case. This is that rule, stated once
// for every control: a press is a press whatever the element, and whatever focuses afterwards.
//
// THE RULE:
//   • ANY PRESS (pointerdown — finger, mouse, pen) ⇒ not the keyboard. It is taken at the press
//     going DOWN, which is before the press focuses anything, so no ring can flash first.
//   • A KEY ⇒ the keyboard — with two exceptions, both things that are not "driving the app by
//     keyboard":
//       – TYPING IN A TEXT BOX. A phone's on-screen keyboard sends the same key events, so "a key
//         was pressed" there says nothing about a real keyboard; and a box being typed into has its
//         own caret to show where it is. Tab is the one key that counts even from a box, because
//         it moves focus to another control.
//       – A MODIFIER OR A SHORTCUT (Shift on its way to Shift+Tab, Ctrl+R, Alt+Tab away, ⌘-anything):
//         held or chorded keys that are addressed to the browser or the system, not to a control.
//     So after a tap on a control, the first arrow / Space / Tab that follows puts the ring on it —
//     the keyboard has taken over, and the ring says where it is.
//
// Nothing here reads focus or marks an element: which control HAS focus is the browser's :focus,
// and the stylesheet joins the two.
import { opensKeyboard } from './textEntry.js'

// The attribute on <html>. index.css spells the same name in its ring rule; tests/keyboardFocus
// pins the two together.
export const KEYBOARD_ATTR = 'data-keyboard'

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn'])

const setKeyboard = (on: boolean) => document.documentElement.toggleAttribute(KEYBOARD_ATTR, on)

const onPointerDown = () => setKeyboard(false)
const onKeyDown = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey || e.altKey || MODIFIER_KEYS.has(e.key)) return
  if (e.key !== 'Tab' && opensKeyboard(e.target)) return
  setKeyboard(true)
}

// Install the rule, and hand back the teardown — called from App the way its two neighbours are
// (lib/pointerGestures, lib/textEntry): one line, one effect, cleanup on unmount.
export function installKeyboardFocus() {
  // On the WINDOW, in the CAPTURE phase: ahead of every handler in the app, so the answer is
  // already right when one of them moves focus (a Tab trap, an arrow along a setting, a grab), and
  // out of reach of the ones that stop a press or a key they consider theirs.
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown, true)
  return () => {
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    setKeyboard(false)
  }
}
