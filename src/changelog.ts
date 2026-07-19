// changelog.ts — the plain-words changelog (round-6 Q6): what each deploy changed, written for
// players, never developers. Hand-maintained: every deploy appends its entry here (a standing
// part of the deploy ritual), newest first, and the module keeps the full history forever while
// the popup (main.tsx) displays only the latest CHANGELOG_VISIBLE deploys — a digest, not an
// archive. Entry dates are the deploy's Pacific calendar date in ISO form (YYYY-MM-DD); the
// popup renders them through the user's Date Format setting, so never encode a format here.
// The list started at the round-5 deploy — earlier history is deliberately not retro-written.
//
// Alongside the data live the two update-signal dot flags — the breadcrumb that leads a player
// here after an update: the build-stamp detection (the Q2 effect in main.tsx) marks BOTH on
// every build change, opening ⚙ Settings clears the gear button's dot, and the first tap on the
// Changelog link clears the link's own. Plain localStorage like the build stamp (lib/buildStamp)
// — the flags describe the code that ran, not user data — and try/catch for the same reason:
// blocked storage (privacy modes) must never break boot, it just means no dots.

export type ChangelogEntry = {
  date: string // the deploy's date, ISO YYYY-MM-DD
  items: string[] // short plain-words lines, one visible change each
}

export const CHANGELOG: ChangelogEntry[] = [
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

// The popup shows at most this many deploys (scrolling within its own list region); the array
// above keeps every entry regardless.
export const CHANGELOG_VISIBLE = 10

export const visibleEntries = (entries: ChangelogEntry[]): ChangelogEntry[] =>
  entries.slice(0, CHANGELOG_VISIBLE)

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
