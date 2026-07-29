// The app's shared control className tokens, extracted verbatim from main.tsx (Q1 phase 1) so the
// mode screens can move into their own modules without re-declaring them. Every comment here is
// the original — these strings encode hard-won layout rules (see Key learnings: rendered height
// must count borders; a box is only flush with button neighbours because its ROW stretches it).
import type { ButtonState } from '../engine/answerButtons.js'

// Reset-style button shared className. Used by Reset Stats (Classic/Deduction/Flash),
// Round Reset (Blitz active), AoX Reset, and the Save-Defaults Clear. (The ⚙ footer's Reset
// Settings / Full Reset pair uses the derived FOOTER_RESET_BTN_CLASS below.)
// border border-transparent completes the RENDERED height (Q4 round-8, the round-4 lesson):
// a solid fill carries no visible border, but every control it is measured against does — the
// grid neighbours Reveal / Override / ‹ › wear `border surface-button`, and the Save-Defaults
// Cancel beside Clear wears `border surface-toggle`. A border counts toward rendered height,
// so without it this button's own height sat 2px under its row's (masked so far only because
// every host stretches its items).
export const RESET_BTN_CLASS =
  'px-3 py-2 rounded-xl bg-rose-600/90 text-white border border-transparent text-sm font-medium'
// Settings-footer variant (Round-3 font normalization, Round-4 one-height tier): the ⚙
// popover's Reset Settings / Full Reset buttons rest at the popover control tier in BOTH
// font (text-xs) and height (py-1.5) — same button in every other way, so it's derived.
// The tier's other controls (the On/Off switches and every PillTray housing — the only two
// kinds the panel has, per THE PICKER RULE) all carry a 1px border, which this pair now
// inherits from RESET_BTN_CLASS rather than appending.
// The game-mode Reset buttons keep text-sm/py-2.
export const FOOTER_RESET_BTN_CLASS = RESET_BTN_CLASS.replace('text-sm', 'text-xs').replace(
  'py-2',
  'py-1.5',
)
// Compact Reset Stats button variant (smaller py + col-span fit for stats panel).
export const RESET_STATS_BTN_CLASS =
  'w-full px-3 py-1.5 rounded-xl btn-solid border border-transparent text-sm font-medium'
// Reset Stats when ARMED (first tap of the two-tap confirm, Q2): rose/danger fill — the same danger
// colour as RESET_BTN_CLASS — so "tap again to confirm" reads as a warning, not a normal button.
export const RESET_STATS_ARMED_CLASS =
  'w-full px-3 py-1.5 rounded-xl bg-rose-600/90 text-white border border-transparent text-sm font-medium'
// Settings-footer link-row shared className (round-7 Q2 — one gap for both rows): the
// View/Clear saved-defaults row and the Last Updated / Check for updates / Changelog row
// are the same kind of row (a wrapping line of muted footer text links), so they share one
// class. gap-3 keeps ~4px of clearance between neighboring press-drag rings (each ring
// extends px-1 = 4px past its text — see the ring comment at the rows); the Last Updated
// row sat on a legacy gap-2 (rings touching at 0px clearance) until the rows were unified.
// items-center keeps the Last Updated caption vertically aligned with its button links (a
// no-op on the all-links row); flex-wrap is the narrow-viewport fallback — at normal
// widths each row stays one line.
export const FOOTER_LINK_ROW_CLASS = 'flex items-center flex-wrap gap-3'
// Boxed numeric-input shared className (Q18; split base + surface Q7 round-7) — the app's
// second shared input idiom beside SliderValueEditor: a bordered box with centered tabular
// digits at the text-xs control tier. Used by the AoX run-length field (mode screen + the
// Save Defaults popup, both appending " py-1 w-14 shrink-0") and the ⚙ Year Range pair
// (" py-1.5 w-16"). These boxes NEVER declare a height — the engine derives one from the inner
// line box — and an <input> derives it through different machinery than a <button> does, landing
// ~2px apart in WebKit even when every class, padding and border matches. So a box is only ever
// flush with button neighbors because its ROW STRETCHES it (the AoX run-length row, items-stretch),
// never because the token strings agree. Anywhere that rule is dropped the box sits visibly proud;
// three rounds of trying to prove the derived heights match instead all failed on device.
// The surface is the site-wide interactive-border rule applied — border weight
// signals role (thin-bd dividers, panel/card-bd containers, sbtn-bd interactive controls):
// inputs are controls you act on, so every one wears surface-tray (stgl-bg + sbtn-bd, the
// no-hover interactive surface the settings segment trays share), matching the buttons —
// never the container .panel these boxes once borrowed. (The top-bar chrome — mode
// selector, gear, stat panel — deliberately STAYS .panel: the container tier, owner call.)
// NUM_INPUT_BASE carries the geometry alone so the DefaultsCard's dirty variant
// (NUM_INPUT_DIRTY_CLASS, defined beside the card) swaps the whole surface, not a token.
// appearance-none (Q4 round-8) turns the NATIVE form-field treatment off: these boxes fully
// declare their own border, background and radius, so leaving appearance:auto in place is a
// false declaration that also keeps iOS's own inner shadow and focus treatment live on top
// of ours. (Every text input in the app now states this: here, the Lookup date field, and
// SliderValueEditor's edit box via .svalue-input. Range sliders are deliberately untouched —
// their native track/thumb IS the control that index.css styles.)
export const NUM_INPUT_BASE =
  'appearance-none rounded-xl px-2 text-center tabular-nums text-xs focus:outline-hidden focus-ring'
export const NUM_INPUT_CLASS = NUM_INPUT_BASE + ' border surface-tray'
// Presentational primitives (NewBestStar, SectionLabel, Kbd) + their class consts → src/components/primitives.jsx, imported at top.
// buttonStateClass — picks the className for an answer-grid button based on its
// persistent state (correct/wrong-latest/wrong-prev/override-wrong) and any active
// flash animation. Returns just the state-class portion; the caller composes the
// full className (base + state + lock/dim).
//   ps        — persistBtns[idx] value or undefined
//   isFlashing — whether a flash is active for this button index
//   flashGood — when flashing, whether it's a good or bad flash
//   idleClass — fallback for idle state (varies between AoX 'surface-button' and App's idleBtn)
export const buttonStateClass = (
  ps: ButtonState | undefined,
  isFlashing: boolean,
  flashGood: boolean,
  idleClass: string,
) => {
  if (ps === 'correct') return 'btn-correct-persist border-transparent'
  if (ps === 'wrong-latest') return 'btn-wrong-persist border-transparent'
  if (ps === 'wrong-prev') return 'btn-wrong-dim border-transparent'
  if (ps === 'override-wrong') return 'btn-override-wrong border-transparent'
  if (isFlashing) return (flashGood ? 'flash-good' : 'flash-bad') + ' border-transparent'
  return idleClass
}
// BASE_BTN — the shared answer-button className. Worn as-is by every weekday grid; Deduction
// derives its own text-sm variant from it (see `baseBtn` in DeductionMode).
export const BASE_BTN = 'w-full rounded-2xl border px-4 py-3 text-base shadow-xs select-none'
// ANSWER_GRID_GAP — the ONE gutter every gap-spaced answer grid wears: the weekday grid below
// (worn by Classic/Flash/Blitz/AoX through the single WeekdayAnswer) and all three Deduction
// sub-mode grids plus the Year sizer strut. Deduction's Day and Year used to run gap-2 while
// Month and the weekday grid ran gap-3, so the gutter visibly CHANGED as you switched Deduction
// sub-mode (Q4 round-9); they were widened onto this token, never the reverse. Sharing it also
// puts every layout on ONE column lattice: at a common gap g, a 6-col grid's col-span-2 is
// exactly a 3-col column ((W−2g)/3) and its col-span-3 exactly a 2-col column ((W−g)/2), so
// Deduction's 2-/3-/6-col grids and the weekday 2-col grid share invisible column edges —
// an identity that mixed gaps broke by a few px.
// NOT a rule about "every answer grid": the Dots input is not gap-spaced at all (a square 3×3
// place-items:center cluster whose spacing is --dot-frac), so it carries no gap token — see
// .dot-cluster in index.css. ⚠ That same block's --ans-h (the dot box's height, which must equal
// the 4-row weekday grid's) spells "3 × gap-3 0.75rem" into its own arithmetic; changing this
// token means changing --ans-h with it.
export const ANSWER_GRID_GAP = 'gap-3'
