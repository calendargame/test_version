// THE ⚙ SETTINGS PANEL, as an ABSTRACTION — the one place in the suite that is allowed to know
// WHERE the panel lives and HOW it is reached.
//
// WHY THIS FILE EXISTS, and it is the same reason tests/helpers/guideScroller.jsx exists. The
// panel is about to be lifted out of the 2,287-line App component in src/main.tsx, and the gate on
// that move is falsifiable and absolute: THE BEHAVIOUR NET PASSES WITH ZERO EDITS. A test that has
// to be edited on the far side of a move proves nothing about the move — it proves only that
// somebody made it green again. Round 13 established the pattern (the guide's scroller was
// abstracted one group AHEAD of the move it was built for, and passing unchanged is what made that
// round trustworthy); this is the same play for the settings panel.
//
// So before a single line of main.tsx is restructured, every existing test that was written
// against WHERE the panel lives — its DOM nesting, its harness, the class string that dims a
// button — is rewritten to ask this file instead. The questions the net asks are the user's:
// "open the panel", "what is the switch for Save Stats", "is Reset Settings offered", "is this
// picker locked", "which modal is up". None of them names a component, a parent element, or a
// Tailwind token. This file answers them, and this file is the only one that may.
//
// ⚠ THE RULE FOR THIS FILE IS THAT IT MAY CHANGE AND NOTHING ELSE MAY. If the extraction breaks a
// resolution here, fix it here — that is the whole point, and it is why the resolutions below
// prefer CONTRACTS the app states out loud (the popover's id, a control's accessible name, a
// role) over positions in a tree, which is what a move actually disturbs.
//
// ⚠ WHAT THIS FILE MUST NOT SWALLOW. The PIXEL GATES describe at the foot of tests/settings.dom is
// the owner's deliberate zero-pixel-movement gate and is INTENTIONALLY implementation-coupled — it
// asserts child counts, element identity, and exact className strings. Those tests do NOT come
// through here, they say so themselves, and routing them through an abstraction would delete the
// only thing they do.
import { screen, within, render, fireEvent, act } from '@testing-library/react'
import { App } from '../../src/main.jsx'
import { useSettings } from '../../src/store/settings.js'
import { useModePrefs } from '../../src/store/modePrefs.js'
import { useUserDefaults } from '../../src/store/userDefaults.js'
import { useProgress } from '../../src/store/progress.js'
// Re-exported so the panel helper's API is complete at one import, while the definition lives in
// the file that owns the question — mode-screen tests ask "is this offered" about game controls
// that have nothing to do with settings, and should not be importing from a settings helper.
import { isOffered } from './offered.js'
export { isOffered }

// ── Standing the app up ───────────────────────────────────────────────────────────────────────

// THE RECONCILED RESET LIST, and it is a decision rather than a union taken by accident.
//
// The seven files that drove the panel each reset a different subset, and the differences were
// historical, not meaningful: every one cleared localStorage and the settings store; four also
// cleared the saved-defaults snapshot; two also cleared sessionStorage; several repeated the two
// resets tests/setup/dom.js ALREADY performs before every test in the suite (progress and mode
// prefs — see its foot).
//
// What is load-bearing is `clearDefaults()`. The four stores are in-memory module singletons
// hydrated at import, so localStorage.clear() does NOT put the saved snapshot back to null — a
// test that saves personal defaults leaks them into every later test in its file unless the store
// itself is cleared. Three of the seven files omitted it and got away with it only because they
// never save a snapshot. Including it costs those three nothing and removes the trap.
//
// sessionStorage is DELIBERATELY NOT HERE. It is not app state — it holds the post-update
// splash-skip flag and the update-attempt loop breaker (src/main.tsx), which only the two files
// that mount across a simulated build change care about. Those two keep their own explicit
// sessionStorage.clear(), where it reads as the setup for the thing they are testing instead of
// as a line nobody can account for.
export function resetAppState() {
  localStorage.clear()
  useSettings.getState().resetSettings()
  useModePrefs.getState().resetModePrefs()
  useUserDefaults.getState().clearDefaults()
  useProgress.getState().resetProgress()
}

// Mounts the real <App/> with the panel CLOSED, and returns Testing Library's render result.
// The #root div is not decoration: the bar's mode dropdown and all four settings modals portal
// into it, so without one they render nowhere. App's own tree mounts into RTL's container, so
// there is no duplicate auto-mount. Pair with the usual `cleanup()` +
// `document.getElementById('root')?.remove()` in an afterEach.
export function mountApp() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}

// ── Opening and closing ───────────────────────────────────────────────────────────────────────

// THE ROUTES. The panel has one open state and many ways in and out, and later net groups assert
// that every route produces the IDENTICAL transition — which is what matters, because that
// transition is what fires all six useSettingsCloseEffect callers. Routing every test through this
// table is what makes "and now by the other route" a one-word change instead of a rewrite.
//
// Only the two routes the suite uses TODAY are implemented — a gear press and the G key. The rest
// (click-outside, Escape, Android Back, a mode letter, a drag-dismiss release, Full Reset) are
// each one entry, and they land with the group that first asserts them rather than sitting here
// unexercised.
const OPEN_ROUTES = {
  gear: () => fireEvent.click(gear()),
  key: () => fireEvent.keyDown(window, { key: 'G' }),
}
const CLOSE_ROUTES = {
  gear: () => fireEvent.click(gear()),
  key: () => fireEvent.keyDown(window, { key: 'G' }),
}

const travel = (table, via, verb) => {
  const go = table[via]
  if (!go)
    throw new Error(`${verb}: no such route "${via}" (have: ${Object.keys(table).join(', ')})`)
  act(go)
}

// Open the panel. `via` defaults to the gear because that is the route a finger takes.
export const openSettings = (via = 'gear') => travel(OPEN_ROUTES, via, 'openSettings')
// Close it. Same route names mean the same gestures.
export const closeSettings = (via = 'gear') => travel(CLOSE_ROUTES, via, 'closeSettings')

// ── Finding the panel ─────────────────────────────────────────────────────────────────────────

// THE PANEL CARD, resolved by the id and by nothing else. `settings-popover` is a stated contract
// with three separate consumers already: the gear's aria-controls names it, the press-drag pointer
// controller pairs a gesture with the menu by resolving that id live, and the suite's own scroller
// queries key off it. So it is the one handle that survives the card being rendered by a different
// component, which is exactly the move this file is insurance against. Null while the panel is
// closed — a closed panel has no DOM at all (it is conditionally rendered, never hidden).
export const panelEl = () => document.getElementById('settings-popover')

// A query scope for everything inside the panel. TEXT queries must come through here rather than
// off `screen`, and that is load-bearing: How to Play is always-mounted, so its display:none copy
// of the guide sits in the DOM on every screen — and the guide names half of this panel's controls
// in prose. A global getByText matches those sentences as readily as the control. ROLE queries
// need no such scoping (they skip display:none subtrees), but coming through here anyway keeps
// "inside the panel" a claim the query makes rather than one the reader has to take on faith.
export function panel() {
  const el = panelEl()
  if (!el) throw new Error('panel(): the ⚙ settings panel is not open')
  return within(el)
}

// ── The gear ──────────────────────────────────────────────────────────────────────────────────

// The gear button. /^Settings/ because its accessible name GROWS: 'Settings (modified)',
// 'Settings (update)', 'Settings (modified, update)'. The exact composition is a contract of its
// own and is asserted through gearIndicator() below, never by how this locates the button.
export const gear = () => screen.getByRole('button', { name: /^Settings/ })

// WHAT THE GEAR IS TELLING THE USER, as the two independent things it says rather than as the
// markup that says them:
//   • bar    — the violet "your settings differ from your defaults" stripe. Drawn only while the
//              panel is CLOSED (an open gear is solid purple and wears no stripe).
//   • name   — the accessible name, which is where BOTH signals are always readable, open or
//              closed. About a dozen helpers across five test files find the gear by this string,
//              so its format is load-bearing well beyond any one test.
//
// ⚠ THE UPDATE DOT IS DELIBERATELY NOT HERE. tests/changelog.dom is the only file that asserts it
// and it reads the marker's raw attributes (`toHaveAttribute('data-lit','false')`), which is the
// STRONGER form: 'true', 'false' and "no marker at all" are three different answers, and a boolean
// here would collapse the last two into one. That is the same collapse refused for `announced` and
// `segments` below. A field nothing reads would also be dead code, which this project does not keep.
export const gearIndicator = () => {
  const el = gear()
  return {
    bar: el.className.includes('gear-modified'),
    name: el.getAttribute('aria-label'),
  }
}

// ── Switches ──────────────────────────────────────────────────────────────────────────────────

// A SWITCH, by the name of the setting it controls. This replaces
// `panel().getByText(label).parentElement.querySelector('button')` — an accessor that encoded the
// row's exact DOM nesting and was used by a dozen tests, so any wrapper introduced anywhere in the
// panel silently resolved .parentElement to a different element and the tests either failed
// confusingly or passed vacuously.
//
// It works because every switch now NAMES its setting (the aria-label added to all four in
// src/main.tsx). Their visible content is the state — "On"/"Off", identical on all four — so
// before that there was nothing to ask for and the DOM walk was the only way in.
export const settingSwitch = (label) => panel().getByRole('button', { name: label })

// The switch's ROW: the label and its control as the user sees them together. Resolved by walking
// UP from the control to the nearest ancestor that also carries the setting's visible text, so a
// wrapper introduced between them changes nothing here. Wanted by the assertions that are about
// the row rather than the switch — "a switch is ONE On/Off button, not a tray of alternatives".
export function switchRow(label) {
  const control = settingSwitch(label)
  for (let node = control.parentElement; node && node !== panelEl(); node = node.parentElement)
    if ([...node.children].some((c) => c !== control && c.textContent.trim() === label)) return node
  throw new Error(`switchRow(${label}): found the switch but no row carrying its label`)
}

// ── Captioned rows ────────────────────────────────────────────────────────────────────────────

// A VISUAL ROW, found by its caption — 'Written', 'Numeric', 'Dark', 'Light'. Which radiogroup
// owns a theme row depends on Use System Settings, but the row itself is there in both states, so
// the caption is the only stable handle. Replaces
// `getAllByText(caption).find(DIV).parentElement`, whose .parentElement was the same silent
// mis-resolution hazard as the switch accessor.
//
// The caption is a SectionLabel DIV, so the filter never catches the same-named 'Light' PILL (a
// BUTTON). From there the row is the nearest ancestor that holds the caption AND the pills it
// introduces — a definition that stays true however many wrappers sit between them.
export function row(caption) {
  const label = panel()
    .getAllByText(caption)
    .find((el) => el.tagName === 'DIV')
  if (!label) throw new Error(`row(${caption}): no caption by that name in the panel`)
  for (let node = label.parentElement; node && node !== panelEl(); node = node.parentElement)
    if (node.querySelector('[role="radio"]')) return node
  throw new Error(`row(${caption}): the caption introduces no pills`)
}

// ── Pickers and their locks ───────────────────────────────────────────────────────────────────

// Every picker in the panel is a labelled radiogroup, so one accessor serves them all.
export const picker = (name) => screen.getByRole('radiogroup', { name })
export const pickerPills = (name) => within(picker(name)).getAllByRole('radio')

// A PICKER'S LOCK, reported as the four things the USER meets rather than as the class that
// happens to draw them. All four come from ONE `disabled` on the PillGroup, which is exactly why
// they are read together: asserting them as a set is what proves a locked picker cannot end up
// locked four ways out of five.
//
//   offered   — a press reaches the picker at all.
//   dimmed    — it is DRAWN as unavailable. Separate from `offered` on purpose: greyed-but-live
//               and live-but-unpressable are both real bugs, and one boolean cannot tell them apart.
//   announced — what the GROUP tells assistive tech ('true' | null). A screen reader entering a
//               locked picker used to be told it was live and only found out one element in.
//   segments  — what each SEGMENT tells assistive tech, in DOM order. Raw attribute values, not
//               booleans: "absent" and "false" are different answers and the net must be able to
//               insist on absent.
//   tabStops  — how many pills Tab can land on. pointer-events-none stops pointers and nothing
//               else, so this is the half of the lock a keyboard user meets.
//   chosen    — the labels currently lit. A lock must PRESERVE the pick, so it is read here too.
export function pickerLockState(name) {
  const group = picker(name)
  const pills = within(group).getAllByRole('radio')
  return {
    offered: isOffered(group),
    dimmed: group.className.includes('opacity-60'),
    announced: group.getAttribute('aria-disabled'),
    segments: pills.map((b) => b.getAttribute('aria-disabled')),
    tabStops: pills.filter((b) => b.tabIndex === 0).length,
    chosen: pills
      .filter((b) => b.getAttribute('aria-checked') === 'true')
      .map((b) => b.textContent.trim()),
  }
}

// ── The footer ────────────────────────────────────────────────────────────────────────────────

// One of the three footer buttons — Save Defaults, Reset Settings, Full Reset — scoped to the
// panel, so it can never accidentally resolve to a same-named button inside one of the modals that
// portal OUT of the card. A RegExp is accepted because Full Reset's caption swaps to 'Confirm?'
// once armed, and callers legitimately want either.
export const footerButton = (name) => panel().getByRole('button', { name })

// ── The Year Range pair ───────────────────────────────────────────────────────────────────────

// The two year-range text boxes, by which END of the range they hold. The suite historically found
// them by their current VALUE, which cannot survive a test that types into them — and G5 exists to
// do exactly that. They now carry their own accessible names ("Earliest Year" / "Latest Year",
// src/main.tsx), added for the screen-reader gap they had, and that name is what we ask for here.
// ⚠ NOT data-drag-focus, which was the obvious handle and is the wrong one: that attribute is a
// GENERAL press-drag opt-in read live by src/lib/pointerGestures.ts, so it happens to identify these
// two boxes today only because nothing else in the panel has opted in yet. The day something does,
// a positional query over it would silently return the wrong element or throw across every
// year-range case at once. A name is the box's own identity; the marker is a mechanism it borrows.
const YEAR_INPUT_NAMES = { min: 'Earliest Year', max: 'Latest Year' }
export function yearInput(which) {
  const name = YEAR_INPUT_NAMES[which]
  if (!name) throw new Error(`yearInput: expected 'min' or 'max', got ${JSON.stringify(which)}`)
  return panel().getByRole('textbox', { name })
}

// ── The four modals ───────────────────────────────────────────────────────────────────────────

// A settings modal, by its title — the Save Defaults popup, the defaults manager (which retitles
// itself for the factory view), the Clear confirm, the Changelog popup. Asked of the DIALOG by its
// accessible name rather than of its title TEXT, which is the only form that still answers
// correctly: How to Play is always-mounted and its prose names several of these titles, and a role
// query skips display:none subtrees where a text query does not.
export const modalCard = (name) => screen.getByRole('dialog', { name })
// The same question where "none" is a legitimate answer — "the popup dismissed and the panel
// survived".
export const queryModalCard = (name) => screen.queryByRole('dialog', { name })
