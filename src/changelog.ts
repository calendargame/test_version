// changelog.ts — the plain-words changelog (round-6 Q6): what each deploy changed, written for
// players, never developers. Hand-maintained: every deploy adds its lines here, a standing part
// of the deploy ritual.
//
// THE CHARTER (round-8 Q8) — this array is exactly what ships and exactly what the popup draws:
//   • Newest first. Entry dates are the deploy's Pacific calendar date in ISO form (YYYY-MM-DD);
//     the popup renders them through the user's Date Format setting, so never encode a format here.
//   • ONE entry per Pacific calendar DAY, never per deploy (the round-7 owner call): a second
//     deploy on the same day merges into that day's single entry by PREPENDING its lines, newest
//     lines first — so dates stay unique, which is also the popup's per-entry React-key contract
//     (key={en.date}); changelog.dom.test pins the uniqueness.
//   • TEN entries maximum, ever. When a new day would make it eleven, MOVE the oldest entry to
//     CHANGELOG-ARCHIVE.md at the repo root (no source file imports it, so retired history costs
//     the bundle nothing) — do not just let the array grow. Before round-8 the popup sliced the
//     latest ten at render time, which meant every day past the tenth was text downloaded by every
//     visitor on every update and then refused; the slice is gone, so an eleventh entry left here
//     would simply PUBLISH itself. changelog.dom.test pins the cap.
// Nothing earlier than the round-5 deploy was ever written down and nothing will be retro-written:
// the history is this array plus whatever has already aged out into the archive.
//
// Alongside the data live the two update-signal dot flags — the breadcrumb that leads a player
// here after an update: the build-stamp detection (the Q2 effect in main.tsx) marks BOTH on
// every build change, opening ⚙ Settings clears the gear button's dot, and the first tap on the
// Changelog link clears the link's own. Plain localStorage like the build stamp (lib/buildStamp)
// — the flags describe the code that ran, not user data — and try/catch for the same reason:
// blocked storage (privacy modes) must never break boot, it just means no dots.

export type ChangelogEntry = {
  date: string // the day's Pacific date, ISO YYYY-MM-DD (unique — same-day deploys merge)
  items: string[] // short plain-words lines, one visible change each
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-07-26',
    items: [
      'The Lookup page no longer scrolls as a whole — only the history list moves, and it now uses whatever room your screen has instead of stopping at a fixed height.',
      'The answer line in Lookup always keeps its space, so nothing on the page shifts as answers come and go. Before your first lookup, or after Clear, it simply invites you to enter a date.',
      'Lookup works out every answer and every history row afresh, so changing your Date Format or the Julian Calendar setting updates the answer line and the whole list together.',
      'The five themes are now buttons in two labelled rows, Dark and Light, instead of hiding inside drop-down menus — and both rows always show, so the settings menu no longer changes height.',
      'Turning Use System Settings off now keeps whichever theme is already on screen.',
      'The app keeps your place when you switch away and come back, instead of jumping to the top — in How to Play and in the game screens alike. And a How to Play section you open now comes to rest just clear of the bar at the top, with its title fully readable.',
      'Tapping a value to type it — a timer, or the AoX Run Length — no longer nudges the row around it, and a longer number is no longer cut off as you type.',
      'In Deduction, the month answer buttons are now the same size as the year and day ones.',
      'The small light-blue dot now sits just after the word Changelog instead of on top of it, and the changelog itself keeps the ten most recent days that had an update.',
      'Fixed: in AoX, the codes panel no longer swaps what it shows while it is sliding shut.',
      'The Show Codes button now stands exactly as tall as the buttons beside it.',
      'The settings controls and the Show Codes button now describe themselves properly to screen readers.',
    ],
  },
  {
    date: '2026-07-21',
    items: [
      'The small links at the bottom of the settings menu now share consistent spacing.',
      'Side-swiping no longer flips the installed app through pages on iPhone.',
      'Typing a timer value no longer nudges the slider.',
      'Every input box now wears the same border as the buttons.',
      'Guide panels open and close with a smooth, matched motion that keeps your place on the page.',
      'Fixed: the Lookup page no longer scrolls as a whole — long history lists scroll inside their own box again.',
      'This changelog and the Lookup history list now scroll the same way as the settings menu: content fades softly at the edges, and the scrollbar stays clear of the text.',
    ],
  },
  {
    date: '2026-07-19',
    items: [
      'Added this changelog: after an update, a small light-blue dot appears on the gear button, and then on the Changelog link inside, until you have taken a look.',
      'The brief updating screen now also appears when a new version arrived quietly between visits, so an update never slips by unannounced.',
      'Typing a timer value no longer stretches its box while you edit.',
      'Guide panels open and close at one smooth, even pace, whatever their length.',
      'View saved defaults is always available, shows the launch values until you save your own, and now lets you edit and save right from the popup; clearing saved defaults asks for confirmation first.',
      'Reset Settings now restores everything your saved defaults cover, including the four mode-screen values.',
      'Blitz and AoX can hide their time stats; timing quietly carries on, so nothing is lost when you show them again.',
    ],
  },
  {
    date: '2026-07-17',
    items: [
      'Blitz Per Question gains an Allow Mistakes option, with its own best score and best streak.',
      'Timer readouts keep one steady width, so sliders no longer shift as values change.',
      'Dropdown menus in the guide close when the page scrolls.',
      'Every reset snaps the screen back instantly and cleanly.',
      'Deduction stays centered and its layout holds steady while you answer.',
      'A View saved defaults link shows exactly what you saved.',
      'The app stays portrait: Android installs lock to it, and turning an iPhone sideways brings up a rotate-back screen that pauses any countdown.',
      'Text in the guide can now be selected and copied.',
      'Plus a round of smaller fixes and polish throughout.',
    ],
  },
]

// The two persisted update-signal dots (the breadcrumb's two stages).
export const GEAR_DOT_KEY = 'cg-update-dot-gear'
export const CHANGELOG_DOT_KEY = 'cg-update-dot-changelog'

export const readUpdateDot = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export const markUpdateDot = (key: string): void => {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* best-effort */
  }
}

export const clearUpdateDot = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* best-effort */
  }
}
