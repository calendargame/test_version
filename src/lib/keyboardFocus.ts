// lib/keyboardFocus.ts — is the KEYBOARD what the player is using right now? The one fact the app's
// focus ring is drawn from (index.css, "THE KEYBOARD FOCUS RING"), kept as one attribute on <html>:
// present while the last thing used was the keyboard, absent while it was a finger, a mouse or a pen.
//
// WHY THE APP KEEPS THIS ITSELF instead of leaving it to the browser's :focus-visible. That
// pseudo-class is the browser's GUESS at the same question, and the guess is wrong in exactly the
// places this app has:
//   • a TEXT BOX matches it on every focus, a tap included — so a ring drawn from it would light up
//     under a finger entering a year or a preset name;
//   • it is lit by ANY key, a game shortcut included — see the rule below for why that cannot do;
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
//   • A KEY THAT MOVES THE KEYBOARD FROM ONE CONTROL TO ANOTHER ⇒ the keyboard. Those are the keys
//     of someone finding their way round by keyboard, and there are two kinds:
//       – TAB, with or without Shift, from anywhere (a text box included): moving focus is all it
//         does.
//       – AN ARROW, Home or End — when it is the focused control's own key: on a slider (it moves
//         the thumb under the keyboard), or wherever the press MOVES FOCUS (along a setting's
//         options, say). The second is found out rather than assumed: the key arms a watch for the
//         rest of its own turn, and focus arriving somewhere in that turn is the answer.
//   • EVERY OTHER KEY CHANGES NOTHING, in either direction. ★ That is the point of the rule, since
//     the ring is drawn on every screen and not only in the ⚙ menu: the app's keys are mostly
//     SHORTCUTS — the answer keys 0–9, N, R, O, C, S, ← and →, the mode letters, H, G — pressed by
//     players who have a hand on the mouse or a finger on the screen, and a button they clicked a
//     moment ago still has focus. A shortcut that counted as "the keyboard" would light a ring on
//     that button in the middle of a game. Enter and Space change nothing either: they press what
//     already has the keyboard, wherever it is. Nor does typing in a text box (a phone's on-screen
//     keyboard sends the same key events as a real one), nor a modifier or a chord addressed to the
//     browser or the system (Shift on its way to Shift+Tab, Ctrl+R, Alt+Tab away, ⌘-anything).
//
// Nothing here reads which control has focus or marks an element: that is the browser's :focus,
// and the stylesheet joins the two.
import { opensKeyboard } from './textEntry.js'

// The attribute on <html>. index.css spells the same name in its ring rule; tests/keyboardFocus
// pins the two together.
export const KEYBOARD_ATTR = 'data-keyboard'

const MOVES_WITHIN = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])

const setKeyboard = (on: boolean) => document.documentElement.toggleAttribute(KEYBOARD_ATTR, on)

// An arrow has just gone down on something that is not a slider: has it moved focus? Armed for the
// rest of that key's own turn — the control's handler runs inside it, and so does anything React
// does on its account — and stood down by a timer that cannot run before the turn is over (or by
// the next key or press, whichever comes first).
let watching = false
const standDown = () => {
  watching = false
}

const onPointerDown = () => {
  watching = false
  setKeyboard(false)
}
const onKeyDown = (e: KeyboardEvent) => {
  watching = false // a new key: whatever the last one was watching for, its turn is over
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'Tab') return setKeyboard(true)
  if (!MOVES_WITHIN.has(e.key) || opensKeyboard(e.target)) return
  if (e.target instanceof HTMLInputElement) return setKeyboard(true) // a slider's own key
  watching = true
  setTimeout(standDown)
}
const onFocusIn = () => {
  if (!watching) return
  watching = false
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
  window.addEventListener('focusin', onFocusIn, true)
  return () => {
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('focusin', onFocusIn, true)
    watching = false
    setKeyboard(false)
  }
}
