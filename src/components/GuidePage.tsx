import { useState, useCallback, type ReactNode } from 'react'
import Expander from './Expander.jsx'
import { Kbd, SectionLabel, SECTION_LABEL_CLASS } from './primitives.jsx'
import { DAY } from '../lib/format.js'
import { DOT_CELL } from '../lib/dotLayout.js'

// GuidePage / GuideSection — the How-to-Play tab: an accordion of documentation
// sections (each a GuideSection wrapping an Expander) covering every observable
// behavior on the site. GuideSection is the reusable open/close row; GuidePage
// lays them out with Divider separators. Pure content + local open/close state.
//
// Extracted from main.jsx in Stage C, Step 4e. Rewritten for scannability — every
// section now leads with a one-line summary, then tight chunks / bulleted lists;
// no documented behavior was dropped. GuideSection is exported named; GuidePage is
// the default export.
export function GuideSection({
  id,
  title,
  children,
  openId,
  onToggle,
}: {
  id: string
  title: ReactNode
  children?: ReactNode
  openId: string | null
  onToggle: (id: string) => void
}) {
  const isOpen = openId === id
  return (
    <div className="rounded-2xl panel overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full text-left px-4 py-3 flex items-center justify-between"
      >
        <span className="text-sm font-semibold text-purple-50">{title}</span>
        <span
          className={`text-[7px] text-white/90 leading-none transition-transform ease-in-out ${isOpen ? 'rotate-180' : ''}`}
          // Match the Expander's duration EXACTLY (.expander uses the same calc) so the triangle and
          // the panel finish together — and honor the reduce-motion --motion-scale, so both snap
          // instantly under "Reduce Motion" instead of the panel snapping while the triangle spins.
          style={{ transitionDuration: 'calc(0.28s * var(--motion-scale))' }}
        >
          ▼
        </span>
      </button>
      <Expander open={isOpen}>
        <div className="px-4 pb-4 pt-1 text-[13px] text-purple-100/90 leading-relaxed space-y-2">
          {children}
        </div>
      </Expander>
    </div>
  )
}
// Section divider with a centered label, placed between GuideSection groups. Defined at
// module scope (not inside GuidePage) so it's a stable component type across renders —
// React's compiler flags components created during render. It closes over nothing but
// its `label` prop, so hoisting is behavior-identical.
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-1">
      <div className="flex-1 h-px bg-purple-500/20"></div>
      <span className={SECTION_LABEL_CLASS}>{label}</span>
      <div className="flex-1 h-px bg-purple-500/20"></div>
    </div>
  )
}
// Lead — a one-line summary at the top of a GuideSection, so the section's gist is
// scannable before the details. Slightly brighter than body text — the bare
// text-purple-50 the section titles use, which the light-theme override block in
// index.css remaps (an alpha variant like /95 would escape that block and turn
// near-invisible on light/parchment).
function Lead({ children }: { children: ReactNode }) {
  return <p className="text-purple-50">{children}</p>
}
// Subhead — a small uppercase sub-label inside a section (the keyboard-group style),
// used to break a long section into scannable blocks. SectionLabel (primitives) owns
// the label styling; this only adds the in-section spacing.
function Subhead({ children }: { children: ReactNode }) {
  return <SectionLabel className="mb-1 mt-1">{children}</SectionLabel>
}
// Bulleted list helper — scannable detail with theme-legible bullets: the markers use
// the per-theme --mut-color var directly (Tailwind v4 var shorthand), so they stay
// visible on every theme with no override-block entry.
function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1 marker:text-(--mut-color)">{children}</ul>
}
// DotDiagram — a small inline SVG of the 7-dot answer layout (Settings → Display →
// Input → Dots), each dot labelled with its weekday. Everything is DERIVED from the
// shared DOT_CELL grid (lib/dotLayout — the same array that positions the real Dots
// input) + the DAY names (lib/format): grid cell (r,c) → SVG centre
// (x = 30+(c-1)*60, y = 28+(r-1)*62), the label is the day's first three letters,
// and the aria-label sentence reads the filled cells in row order — no hand-kept
// copy of the layout exists here to drift. Drawn entirely in currentColor so it's
// legible on every theme.
function DotDiagram() {
  const dotX = (cell: { r: number; c: number }) => 30 + (cell.c - 1) * 60
  const dotY = (cell: { r: number; c: number }) => 28 + (cell.r - 1) * 62
  // The cell's position in words: the centre cell reads "centre"; every other filled
  // cell is edge-row-edge-column, so "row-column" ("top-left", "middle-right", …).
  const posName = (cell: { r: number; c: number }) =>
    cell.r === 2 && cell.c === 2
      ? 'centre'
      : `${['top', 'middle', 'bottom'][cell.r - 1]}-${['left', 'centre', 'right'][cell.c - 1]}`
  const ariaLabel = `Dots layout: ${DAY.map((day, i) => ({ day, cell: DOT_CELL[i] }))
    .sort((a, b) => a.cell.r - b.cell.r || a.cell.c - b.cell.c)
    .map(({ day, cell }) => `${day} ${posName(cell)}`)
    .join(', ')}.`
  return (
    <svg
      viewBox="0 0 180 192"
      width="156"
      role="img"
      aria-label={ariaLabel}
      className="my-1 text-purple-100/90"
    >
      {DAY.map((day, i) => (
        <g key={day}>
          <circle cx={dotX(DOT_CELL[i])} cy={dotY(DOT_CELL[i])} r="11" fill="currentColor" />
          <text
            x={dotX(DOT_CELL[i])}
            y={dotY(DOT_CELL[i]) + 27}
            textAnchor="middle"
            fontSize="13"
            fill="currentColor"
            opacity="0.9"
          >
            {day.slice(0, 3)}
          </text>
        </g>
      ))}
    </svg>
  )
}
export default function GuidePage() {
  const [open, setOpen] = useState<string | null>(null)
  const toggle = useCallback((id: string) => setOpen((o) => (o === id ? null : id)), [])
  return (
    <div className="space-y-2">
      <GuideSection id="overview" title="What Is Calendar Game?" openId={open} onToggle={toggle}>
        <Lead>A training tool for working out the day of the week of any date, in your head.</Lead>
        <p>
          You're given a date and must identify which weekday it falls on — as quickly and
          accurately as possible. Dates on or before October 4, 1582 (the day before the Gregorian
          reform took effect) are treated as Julian, matching history — the Julian Calendar setting,
          on by default, controls this. Every later date is Gregorian.
        </p>
        <Subhead>Install &amp; offline</Subhead>
        <p>
          It runs entirely in your browser and saves your progress on this device. Add it to your
          home screen to use it like an app:
        </p>
        <UL>
          <li>
            <b>iPhone</b> — Safari's Share button → Add to Home Screen.
          </li>
          <li>
            <b>Android</b> — Chrome's Install app / Add to Home screen.
          </li>
        </UL>
        <p>
          Give the sheet a moment to show the app's icon before tapping <b>Add</b> — it can briefly
          show a generic placeholder while the icon loads.
        </p>
        <p>
          Once it has loaded it works fully offline, with no connection needed to practice. A brief{' '}
          <b>loading screen</b> (the app logo) shows while it starts up.
        </p>
        <Subhead>Updates</Subhead>
        <p>
          Updates take care of themselves: while you use the app, any new version quietly downloads
          in the background, and it's applied — behind a short <b>updating screen</b> — the next
          time you open the app fresh. Switching back from another app never triggers it; the update
          waits for a fresh open. To force the latest right now instead, the Settings (⚙) panel has
          a <b>Check for updates</b> link that reloads the newest version on the spot (your saved
          progress is kept), behind the same updating screen.
        </p>
        <Subhead>The book &amp; contact</Subhead>
        <p>
          It pairs with the book{' '}
          <i>Day-of-the-Week Calculation: A Highly Optimized Mental Method</i>.
        </p>
        <p>
          Questions, ideas, bugs, or mistakes — about the site or the book — are welcome:{' '}
          <a href="mailto:dayoftheweekcalculation@gmail.com" className="underline break-all">
            dayoftheweekcalculation@gmail.com
          </a>
          .
        </p>
      </GuideSection>
      <Divider label="Interface" />
      <GuideSection id="buttons" title="Buttons" openId={open} onToggle={toggle}>
        <Lead>How tapping, dragging, and each on-screen button work.</Lead>
        <Subhead>Tapping &amp; dragging</Subhead>
        <UL>
          <li>Tap any button to use it.</li>
          <li>
            Press a button but slide your finger off before lifting and nothing happens — the tap is
            cancelled — so a misclick is easy to back out of.
          </li>
          <li>
            On the weekday answer grid you can slide between options: press one, drag to the option
            you want (it highlights as you move, including over an already-answered option), and
            release on it to choose it.
          </li>
          <li>
            The mode selector at the top works this way too — press it and drag down to a mode, then
            release to switch (or just tap to open the menu and tap a mode, as before).
          </li>
          <li>
            So does the Settings gear (⚙): press it and drag straight into the panel — it
            auto-scrolls when you drag near its top or bottom edge — then release on a setting to
            change it; the panel closes and the change applies. Releasing on a Year Range field
            opens the keyboard to type instead, and the theme pickers and the buttons at the foot of
            the panel keep the panel open.
          </li>
          <li>
            Timer sliders (Flash speed and both Blitz timers) — tap the value beside the slider to
            type an exact number of seconds instead of dragging.
          </li>
        </UL>
        <p>
          It all works the same way with a mouse. The weekday answer grid comes in two layouts —
          labelled buttons (default) or the seven-dot logo layout — chosen under{' '}
          <b>Settings → Display → Input</b>; tapping and dragging work the same in either.
        </p>
        <Subhead>Loading dates</Subhead>
        <UL>
          <li>
            <b>New</b> — load a fresh date. In timer modes, only available after pressing Begin.
          </li>
          <li>
            <b>Begin</b> — timer modes only (Blitz, Flash, AoX). Starts a round or run; the timer
            starts and the date is shown (Flash hides it after the configured duration; AoX hides it
            between solves only when One-By-One is on).
          </li>
          <li>
            <b>Reset</b> — timer modes only. In Blitz, ends the current round and unlocks settings;
            in AoX, ends the current run. Saved bests are preserved either way. Press Reset then
            Begin to start a fresh round/run.
          </li>
          <li>
            <b>Reset Stats</b> — casual modes only (Classic, Flash, Deduction). See below.
          </li>
        </UL>
        <Subhead>Reset Stats (casual modes)</Subhead>
        <p>
          Clears your stats and question history for the current mode (Deduction only resets the
          current sub-type's stats). Details:
        </p>
        <UL>
          <li>
            <b>Two taps to confirm</b> — the first arms it (it turns red and reads "Reset Stats?");
            a second tap within 3 seconds confirms. Tapping anywhere else or waiting cancels.
          </li>
          <li>
            Generates a new date when timing stats are visible, or when you've burned the current
            date (answered wrong, revealed, or shown codes); otherwise the current date is kept.
          </li>
          <li>
            In Flash, a mid-question Reset Stats always generates a new date and returns to dash.
          </li>
          <li>Does not affect timer-mode bests.</li>
        </UL>
        <Subhead>Browsing history — Back / Forward</Subhead>
        <UL>
          <li>
            <b>Back (&lt;)</b> — return to the previous date. The answer is shown and the card is
            locked; no stat penalty. You can go back through your entire history in Classic, Flash,
            and Deduction; in Blitz and AoX, through the current round or run.
          </li>
          <li>
            Every history entry shows the correct answer in green; a wrong guess appears as dimmed
            red alongside the green.
          </li>
          <li>
            While browsing back, a small <b>Q#</b> label at the top-right of the date card shows
            your position in history (e.g. Q3 = the third question viewed).
          </li>
          <li>
            <b>Forward (&gt;)</b> — move forward through dates you browsed past with Back. Forward
            history clears whenever you answer a new question, press New/Begin/Reset, or take any
            action that advances the date. Overriding while browsing back does <i>not</i> clear it.
          </li>
          <li>
            Each entry remembers its date format and calendar system, so a back-then-forward round
            trip never alters how a date was originally shown.
          </li>
        </UL>
        <Subhead>Reveal, Override &amp; Show Codes</Subhead>
        <p>
          <b>Reveal</b> — show the correct answer without guessing. Counts as a wrong attempt. No
          penalty on unanswered dates while browsing back.
        </p>
        <p>
          <b>Override</b> — fix a mistake. Override any date in your history by browsing to it with
          Back/Forward:
        </p>
        <UL>
          <li>After a wrong answer: gives you credit with time recorded and adjusts your score.</li>
          <li>After a correct answer: undoes the credit and adjusts your score.</li>
          <li>
            You can also override the most recent past date directly from a fresh, untouched live
            question (any mode) — Override is enabled when the live date hasn't been answered yet,
            and tapping it flips your previous date's right/wrong status.
          </li>
          <li>
            A previously correct date flipped to wrong shows a green-and-red diagonal split:
            green-upper-left (originally correct), red-lower-right (now counted wrong).
          </li>
          <li>You can only override each date once.</li>
          <li>
            Overriding a wrong answer (however you do it) clears any wrong highlights; only the
            correct answer is shown.
          </li>
        </UL>
        <p>Override in the run modes:</p>
        <UL>
          <li>
            <b>Blitz</b> — override past dates after the round ends to adjust your score and saved
            bests. With Allow Mistakes off (or in Per Question), overriding a correct answer to
            wrong during a round ends the round, just like a wrong answer.
          </li>
          <li>
            <b>AoX</b> — without Allow Mistakes, overriding a correct answer ends the run.
          </li>
          <li>
            In both run modes, if a round/run ended because you answered wrong, revealed, or showed
            codes, Override credits that question and it continues — picking up where it left off
            instead of staying ended.
          </li>
          <li>
            Override is <b>locked</b> when Save Stats is off in the casual modes (Classic, Flash,
            Deduction) — there's nothing to record. In Blitz and AoX it works the same whether Save
            Stats is on or off (the run still tracks internally; it's just not saved).
          </li>
        </UL>
        <p>
          <b>Show Codes</b> — reveals the calculation codes for the current date. Counts as a miss
          only while the date is still unresolved; once you've answered it (right or wrong),
          revealed it, or are browsing back, opening the codes is just a review and changes nothing.
          Per mode:
        </p>
        <UL>
          <li>
            <b>Blitz</b> — opening Show Codes during a round ends the round and records your bests.
          </li>
          <li>
            <b>Flash</b> — freezes the countdown so the date stays on screen while you study.
          </li>
          <li>
            <b>AoX</b> — without Allow Mistakes, opening Show Codes ends the run.
          </li>
        </UL>
      </GuideSection>
      <GuideSection id="stats" title="Stats" openId={open} onToggle={toggle}>
        <Lead>What each stat means, how times are measured, and hiding stats.</Lead>
        <Subhead>The stats</Subhead>
        <UL>
          <li>
            <b>Score</b> — correct first-try answers out of total attempts. In Blitz, only the
            current round. In AoX, correct answers out of total attempts; the run ends once correct
            answers reach the set number.
          </li>
          <li>
            <b>Accuracy</b> — percentage answered correctly on the first try. Shows "—" until your
            first attempt.
          </li>
          <li>
            <b>Streak</b> — your current consecutive correct streak / your best this session.
          </li>
          <li>
            <b>Last / Avg / Med</b> — timing stats from correct answers only. Last = most recent
            correct time; Avg = average across all correct answers; Med = median (less skewed by
            outliers).
          </li>
        </UL>
        <Subhead>How times are counted</Subhead>
        <UL>
          <li>
            Any time of 60 seconds or more — a single solve, a computed average/median, or any Best
            — displays as "—". Times are still tracked internally and contribute to averages,
            medians, and best-tracking; only the display is capped.
          </li>
          <li>
            Saved solve times keep a rolling window of the most recent 1000 (older ones roll off so
            saved progress stays small), so after a lot of practice Avg and Med reflect your recent
            1000 rather than all-time. Within a single visit, every solve still counts.
          </li>
          <li>
            <b>Formatting (WCA speedcubing convention)</b> — single times (Last) are{' '}
            <i>truncated</i> to hundredths (the third decimal is dropped, never rounded); averages,
            medians, and bests are <i>rounded</i> to the nearest hundredth. Truncating singles
            prevents fortunate rounding boundaries; rounding aggregates avoids systematic downward
            bias.
          </li>
          <li>
            One question = one attempt. Getting a question wrong then right still counts as one
            attempt, marked correct.
          </li>
          <li>When you set a new best, a small ★ appears next to the value to flag it.</li>
        </UL>
        <Subhead>Hiding stats (Classic, Deduction, Flash)</Subhead>
        <p>
          These casual modes let you tap any stat to hide it. Tapping Score, Accuracy, or Streak
          hides all three; tapping any timing stat hides all three. Score, Accuracy, and Streak keep
          tracking in the background while hidden — re-enabling brings the same numbers back.
        </p>
        <p>
          Timing stats behave differently: timing pauses entirely while hidden — no times are
          recorded. When you turn timing back on, the current date is regenerated if still
          unanswered; if you've already answered wrong, revealed, or shown codes, the date stays
          until you advance. If any questions were answered while timing was hidden, a desync would
          arise on re-enable, so the three timing boxes merge into a single "Enable and Reset
          Stats?" confirmation — tap again within 3 seconds to confirm (turn on and full reset), or
          tap anywhere else to cancel.
        </p>
        <p>
          When Save Stats is off, all stat boxes site-wide (every mode, including AoX) show "—" with
          strikethrough labels, dim, and become non-interactive — toggling timing or scoring is
          disabled until Save Stats is turned back on, which prevents accidental stat desyncs.
          Turning Save Stats on while timing is also on regenerates an unanswered date for a clean
          start.
        </p>
        <p>
          When timing stats are off, leaving and returning to a mode preserves the current question
          exactly as you left it — same date, same answers, codes panel in the same state. In all
          other modes, stats are always visible.
        </p>
      </GuideSection>
      <GuideSection id="keyboard" title="Keyboard Input" openId={open} onToggle={toggle}>
        <Lead>
          On any device with a hardware keyboard (typically desktop), press keys instead of tapping.
        </Lead>
        <p>
          The on-screen layout is identical to mobile — keyboard input is the only desktop-specific
          addition.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <SectionLabel className="mb-1.5">Answer Grid</SectionLabel>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Kbd>0</Kbd>
                <span>Sunday</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>1</Kbd>
                <span>Monday</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>2</Kbd>
                <span>Tuesday</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>3</Kbd>
                <span>Wednesday</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>4</Kbd>
                <span>Thursday</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>5</Kbd>
                <span>Friday</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>6</Kbd>
                <span>Saturday</span>
              </div>
            </div>
            <p className="mt-2 text-xs italic">
              The same keys work whether the answer grid shows labelled buttons or the seven dots.
              In Deduction Month and Year, the keys map positionally to the boxes or year options on
              screen.
            </p>
          </div>
          <div>
            <SectionLabel className="mb-1.5">Game Actions</SectionLabel>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Kbd>N</Kbd>
                <span>New / Begin / Reset</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>R</Kbd>
                <span>Reveal</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>O</Kbd>
                <span>Override</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>C</Kbd>
                <span>Show / Hide Codes</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>S</Kbd>
                <span>Reset Stats</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>←</Kbd>
                <span>Back</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>→</Kbd>
                <span>Forward</span>
              </div>
            </div>
          </div>
          <div>
            <SectionLabel className="mb-1.5">Overlays</SectionLabel>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Kbd>H</Kbd>
                <span>How to Play (toggle)</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>G</Kbd>
                <span>Settings ⚙ (toggle)</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Tab</Kbd>
                <span>Mode selector (toggle)</span>
              </div>
            </div>
          </div>
          <div>
            <SectionLabel className="mb-1.5">Mode Switching</SectionLabel>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Kbd>K</Kbd>
                <span>Classic</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>F</Kbd>
                <span>Flash</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>B</Kbd>
                <span>Blitz</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>A</Kbd>
                <span>AoX</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>D</Kbd>
                <span>Deduction</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>L</Kbd>
                <span>Lookup</span>
              </div>
            </div>
          </div>
        </div>
        <Subhead>Notes</Subhead>
        <UL>
          <li>Letter keys are case-insensitive.</li>
          <li>
            Letter and number keys are ignored while you're typing in an input field or when a
            modifier (Ctrl/Cmd/Alt/Shift) is held.
          </li>
          <li>
            <Kbd>Tab</Kbd> is the exception — it toggles the mode selector even from inputs (use Esc
            or Enter to leave an input first if you'd rather). Tab plus any modifier (Ctrl+Tab,
            Ctrl+Shift+Tab, etc.) passes through to the browser.
          </li>
          <li>Locked or already-pressed buttons are skipped, just like a click would be.</li>
          <li>
            Reset Stats (<Kbd>S</Kbd>) only applies to the casual modes (Classic, Deduction, Flash);
            pressing it in Blitz, AoX, or Lookup is a no-op, since those modes have no separate
            Reset Stats button (their round/run Reset clears in-round/in-run stats; persistent bests
            update only when set).
          </li>
        </UL>
      </GuideSection>
      <Divider label="Settings" />
      <GuideSection
        id="settings-overview"
        title="Settings Overview"
        openId={open}
        onToggle={toggle}
      >
        <Lead>
          The ⚙ menu groups every setting into three categories, with the Save Defaults and Reset
          buttons at the bottom.
        </Lead>
        <UL>
          <li>
            <b>Display</b> — how dates are shown and how you answer: Date Format (incl. Random
            Format), Input (Buttons / Dots), and Theme.
          </li>
          <li>
            <b>Dates</b> — which dates get generated: Year Range, Julian Calendar (+ Julian Chance),
            Leap Year Chance, and Jan/Feb Chance on Leap Years.
          </li>
          <li>
            <b>Stats</b> — Save Stats.
          </li>
        </UL>
        <p>
          At the foot of the menu: <b>Save Defaults</b>, <b>Reset Settings</b> and <b>Full Reset</b>{' '}
          (see the Data section); directly under them — once you've saved your own defaults — a{' '}
          <b>Clear saved defaults</b> link; then your Contact email, the Last Updated timestamp, and
          the <b>Check for updates</b> link.
        </p>
        <p className="text-purple-300/70 text-[12px]">
          Settings changes apply when you <b>close</b> the ⚙ menu, not on each adjustment — so
          changing several at once regenerates the date just once (and never restarts your solve
          timer mid-adjustment). The sections below cover each setting and exactly when a change
          regenerates a date or resets a round/run.
        </p>
      </GuideSection>
      <GuideSection id="dateformat" title="Display — Date Format" openId={open} onToggle={toggle}>
        <Lead>Choose how dates are written, or roll a random format each time.</Lead>
        <p>Five real-world formats:</p>
        <UL>
          <li>
            <b>Written MDY</b> — April 27, 1828
          </li>
          <li>
            <b>Written DMY</b> — 27 April 1828
          </li>
          <li>
            <b>Numeric MDY</b> — 4/27/1828 (separator "/")
          </li>
          <li>
            <b>Numeric DMY</b> — 27.4.1828 (separator ".")
          </li>
          <li>
            <b>Numeric YMD</b> — 1828-4-27 (separator "-")
          </li>
        </UL>
        <p>
          Years always show in full, never abbreviated. Only DMY, MDY, and YMD orderings are offered
          — they're the only orderings used in real life (orderings like YDM aren't standard
          anywhere).
        </p>
        <Subhead>Random Format</Subhead>
        <p>
          When on, it rolls one of the five formats per date in game modes only — your selected
          format is preserved underneath (the panels just lock visually). Lookup and the Last
          Updated timestamp ignore Random and always use the selected format; the timestamp uses the
          numeric version of whichever format you've selected.
        </p>
        <Subhead>When a format change regenerates the date</Subhead>
        <UL>
          <li>
            In Classic, Deduction, Flash, and AoX (idle), any format change — the Random Format
            toggle or the Date Format pick — regenerates an unanswered date so you don't return to a
            previously-seen date in a now-mismatched format. This applies across all modes at once.
          </li>
          <li>
            If you've already wrong-guessed, revealed, or shown codes on the displayed date, the
            change is deferred — the burned state is preserved and the new format applies on the
            next date.
          </li>
          <li>
            In Blitz rounds and AoX runs — active or just ended — a format change resets the
            round/run when you close the ⚙ menu, so the round on screen always matches your
            settings.
          </li>
        </UL>
        <p>
          In game modes' Show Codes, codes appear in the order the date is read (left to right),
          with Leap shown once you've seen both the year and month.
        </p>
      </GuideSection>
      <GuideSection id="input" title="Display — Input" openId={open} onToggle={toggle}>
        <Lead>Answer with labelled weekday buttons, or with the seven-dot logo layout.</Lead>
        <UL>
          <li>
            <b>Buttons</b> (default) — the seven weekdays as labelled buttons.
          </li>
          <li>
            <b>Dots</b> — seven unlabelled circles in the same layout as the app's logo (see below).
          </li>
        </UL>
        <p>
          Tap a dot, or press and slide to the one you want and release — exactly like the buttons.
          The setting applies to the weekday modes (Classic, Flash, Blitz, AoX). In Deduction the
          answers aren't weekdays, so the setting is shown but locked there (it keeps whatever you
          last chose and applies again in the weekday modes).
        </p>
        <Subhead>Which dot is which</Subhead>
        <div className="flex justify-center">
          <DotDiagram />
        </div>
        <p className="text-purple-300/70 text-[12px] text-center">
          Sunday sits in the centre. The dots are deliberately unlabelled — their positions follow
          the day-of-week practice movement, so choosing one is the same motion you trace when
          calculating.
        </p>
      </GuideSection>
      <GuideSection id="theme" title="Display — Theme" openId={open} onToggle={toggle}>
        <Lead>Five themes, with an option to follow your device's light/dark mode.</Lead>
        <UL>
          <li>
            <b>Dusk</b> — default dark navy
          </li>
          <li>
            <b>Midnight</b> — true black with purple
          </li>
          <li>
            <b>Nebula</b> — deep purple
          </li>
          <li>
            <b>Light</b> — clean white
          </li>
          <li>
            <b>Parchment</b> — warm cream
          </li>
        </UL>
        <p>
          Accessible from the ⚙ menu in any tab. Enable <b>Use System Settings</b> to match your
          device's light/dark mode automatically, with separate theme choices for each (a Dark pick
          and a Light pick). Disable it to pick one theme manually.
        </p>
      </GuideSection>
      <GuideSection id="range" title="Dates — Year Range" openId={open} onToggle={toggle}>
        <Lead>Controls which years dates are drawn from. Defaults to 1–10000 AD.</Lead>
        <UL>
          <li>
            Changing the range always regenerates the current date — but if you've already
            wrong-guessed on the current date, the change is deferred so the wrong-state is
            preserved; the new range applies to the next date.
          </li>
          <li>
            While browsing back, settings-driven regen always preserves your history: the date you
            were viewing and any forward entries are pushed back to history before the live slot is
            regenerated.
          </li>
          <li>
            In Blitz rounds and AoX runs (active or just ended), a range change resets the round/run
            when you close the ⚙ menu.
          </li>
        </UL>
        <Subhead>Year sub-mode auto-disable</Subhead>
        <p>
          Deduction's Year sub-mode requires either a range of at least 5 years (so a 5-year window
          can be built) or, with Julian on, a range that contains October 15, 1582 (so a 2-year Jul
          Cross window can be built). When neither holds, the Year sub-type button greys out, and if
          you were already in Year mode when the range changed, you're auto-switched to Day mode.
          Day and Month sub-modes work for any valid range.
        </p>
      </GuideSection>
      <GuideSection id="julian" title="Dates — Julian Calendar" openId={open} onToggle={toggle}>
        <Lead>
          Treats early dates as Julian; on by default. Includes the Julian Chance frequency control.
        </Lead>
        <p>
          When on, dates on or before October 4, 1582 are treated as Julian, which has different
          leap year rules — every year divisible by 4 is a leap year, with no century exception.
          This affects weekday calculation and the codes shown in Show Codes. October 5–14, 1582 are
          always excluded since those dates never existed; the Gregorian calendar skipped them to
          correct accumulated drift.
        </p>
        <Subhead>Toggling Julian</Subhead>
        <UL>
          <li>For dates after October 4, 1582, Julian has no effect.</li>
          <li>
            For Julian-eligible dates (October 4, 1582 or earlier), the date stays if you haven't
            wrong-guessed yet — the answer and codes simply update.
          </li>
          <li>
            If you've already wrong-guessed, the date regenerates and is added to your history with
            both your red guess and a green for the day that was correct under the calendar system
            in effect when it was first generated.
          </li>
          <li>
            Each date snapshots its calendar system at generation, so revisiting an earlier question
            via Back shows the highlights and codes correct under the system in effect when that
            date was generated.
          </li>
          <li>
            In Blitz rounds and AoX runs (active or just ended), a Julian toggle resets the
            round/run when you close the ⚙ menu.
          </li>
        </UL>
        <Subhead>Julian Chance</Subhead>
        <p>
          Sets how often a generated date lands in the Julian period (pre-Oct 15, 1582). Random uses
          the natural rate (depends on your year range, ~16% on the default 1–10000 range); 25%,
          50%, 75%, and 100% force higher rates. The listed percentage is the exact final rate of
          Julian dates, not a force probability. Changing the value always regenerates an unanswered
          date; burned dates defer like every other setting.
        </p>
        <p>The five buttons lock and fade in three cases:</p>
        <UL>
          <li>The Julian Calendar toggle above is off (no Julian dates can be generated).</li>
          <li>
            Your range is entirely post-Gregorian (minimum year 1583+), so no Julian dates exist in
            range.
          </li>
          <li>
            Your range is entirely pre-Gregorian (maximum year 1581 or earlier), so every date is
            already Julian and the setting has nothing to do.
          </li>
        </UL>
        <p>
          Year 1582 itself contains both Julian (Jan–Sep + Oct 1–4) and Gregorian (Oct 15+ + Nov +
          Dec) dates, so any range that includes 1582 counts as mixed and the row stays unlocked.
          The previously-selected value stays visually selected while locked, so it's restored when
          the lock condition clears.
        </p>
      </GuideSection>
      <GuideSection id="leap" title="Dates — Leap Year Settings" openId={open} onToggle={toggle}>
        <Lead>
          Two controls for how often leap years appear and which months they're paired with.
        </Lead>
        <UL>
          <li>
            <b>Leap Year Chance</b> — how often a generated date lands on a leap year. Random uses
            the natural rate (~24%); 50%, 75%, and 100% force higher rates.
          </li>
          <li>
            <b>Jan/Feb Chance on Leap Years</b> — how often a leap-year date lands on January or
            February. Random uses the natural rate (~17%, since 2 of 12 months are Jan/Feb); 25%,
            50%, 75%, and 100% force higher rates. The listed percentage is the exact final rate of
            Jan/Feb on leap-year dates, not just a force probability — under 50%, exactly half of
            leap-year dates are Jan/Feb.
          </li>
        </UL>
        <p>
          Both apply to all game modes' date generation; Lookup is unaffected. Changing any value
          regenerates the displayed date so the new setting takes effect when you close the ⚙ menu.
          If you've already wrong-guessed, revealed, or shown codes on the current date, the change
          is deferred and applies to the next date. In Blitz rounds and AoX runs (active or just
          ended), a chance change resets the round/run when you close the ⚙ menu.
        </p>
        <Subhead>Locking</Subhead>
        <UL>
          <li>
            If your year range contains no leap years (under the active calendar), the four Leap
            Year Chance buttons lock and fade; the previously-selected value stays visually selected
            so it's restored when you change the range back to one with a leap year reachable.
          </li>
          <li>
            Jan/Feb Chance stays unlocked, since the setting still applies on whatever leap years
            exist in the range.
          </li>
        </UL>
      </GuideSection>
      <GuideSection id="savestats" title="Stats — Save Stats" openId={open} onToggle={toggle}>
        <Lead>
          On by default. When off, your answers don't update stats or saved bests, and the stats
          panel dims.
        </Lead>
        <UL>
          <li>
            In the casual modes (Classic, Deduction, Flash), Override is locked when Save Stats is
            off — there's nothing to record.
          </li>
          <li>
            In the run modes (Blitz, AoX), Override works the same whether Save Stats is on or off,
            so a misclick can never throw away a whole round or run even in practice mode.
          </li>
        </UL>
        <p>The toggle works differently per mode:</p>
        <UL>
          <li>
            <b>Classic, Deduction, Flash (per-question)</b> — the value is locked in at your first
            stat-affecting action on the question (your first wrong guess, or your correct answer if
            you got it on the first try). Toggling afterward doesn't change that question's outcome
            but applies to the next. If you've already wrong-guessed, toggling does not regenerate
            the date — the frozen value sticks for the question. When off, the question doesn't
            update stats and isn't pushed to history (Back can't browse to it).
          </li>
          <li>
            <b>Blitz (round-level)</b> — in-round score, accuracy, streak, and Back/Forward all work
            normally regardless of the toggle. Whatever the toggle is when the round ends determines
            whether the round's Best Score and Best Streak update.
          </li>
          <li>
            <b>AoX (run-level)</b> — in-run score, streak, times, and Back/Forward all work normally
            regardless of the toggle. Whatever the toggle is when the run ends determines whether
            Best Average, Best Median, and Best Streak update.
          </li>
        </UL>
      </GuideSection>
      <Divider label="Data" />
      <GuideSection id="saved-progress" title="Saved Progress" openId={open} onToggle={toggle}>
        <Lead>What persists on this device between visits — and what resets each time.</Lead>
        <p>
          The app saves the following on this device and restores them when you return — after
          closing the app, refreshing, updating to a new version, or revisiting later (an app update
          never resets your saved data):
        </p>
        <UL>
          <li>
            <b>⚙ Settings</b> — date format, answer input (Buttons / Dots), calendar system, year
            range, the leap / Jan-Feb / Julian chances, Save Stats, and theme.
          </li>
          <li>
            <b>Your saved defaults</b> — the Save Defaults snapshot (next section), which even
            survives Full Reset.
          </li>
          <li>
            <b>Per-mode setup</b> — Flash speed; Blitz / Sudden timer lengths, Allow Mistakes, and
            Per-Round vs Per-Question; AoX count, Allow Mistakes, and One-By-One; the Deduction
            sub-type; and each mode's show / hide stat toggles.
          </li>
          <li>
            <b>Stats</b> in the casual modes (Classic, Flash, Deduction).
          </li>
          <li>
            <b>All-time bests</b> — Blitz score &amp; streak, Sudden score, AoX average &amp;
            median.
          </li>
          <li>
            <b>Lookup history.</b>
          </li>
        </UL>
        <p>Saved Average and Median use a rolling window of your most recent 1000 solves.</p>
        <Subhead>Not saved (resets each visit)</Subhead>
        <UL>
          <li>
            Any timed round or run on screen — whether still in progress OR ended but not yet Reset
            — and the current question. The round/run itself is discarded; only a Best it already
            recorded persists.
          </li>
          <li>The current tab — the app always opens to Classic.</li>
        </UL>
        <p>
          <b>Full Reset</b> (below) clears everything that is saved — except your saved defaults,
          which it restores rather than clears.
        </p>
      </GuideSection>
      <GuideSection
        id="reset-settings"
        title="Save Defaults, Reset Settings &amp; Full Reset"
        openId={open}
        onToggle={toggle}
      >
        <Lead>
          Three buttons at the foot of the ⚙ menu — save your own defaults, restore the menu, or
          reset the whole site.
        </Lead>
        <Subhead>Save Defaults (left)</Subhead>
        <p>
          Makes the current setup <i>your</i> defaults — from then on, the two Reset buttons restore
          these values instead of the launch ones. One snapshot captures:
        </p>
        <UL>
          <li>Every setting in the ⚙ menu (all of Display — Input included — Dates, and Stats).</li>
          <li>
            Four values from the mode screens: AoX run length (N), Flash speed, and both Blitz
            timers (Per Round and Per Question).
          </li>
        </UL>
        <p>
          Nothing else from the mode screens is captured — Blitz's Per Round vs Per Question, the
          Deduction sub-type, Allow Mistakes, One-By-One, and the show/hide stat toggles always
          reset to their launch values.
        </p>
        <UL>
          <li>
            Tapping the button opens a confirmation popup where the four mode-screen values can be
            edited before saving — so you can make, say, a different Flash speed your default
            without changing the live one. The menu settings are captured exactly as they are.
            Cancel discards any edits.
          </li>
          <li>
            While anything the snapshot covers differs from your defaults, the closed gear (⚙) shows
            a small violet bar along its bottom edge, and the Save Defaults button is active; once
            everything already matches your defaults, the bar disappears and the button dims —
            nothing new to save.
          </li>
          <li>
            Your saved defaults survive Full Reset — that's the point: Full Reset restores{' '}
            <i>them</i>. The way back to the launch defaults is the <b>Clear saved defaults</b> link
            at the foot of the ⚙ menu (below the reset buttons), shown only while you have saved
            defaults. It lives in the footer rather than the popup because the Save Defaults button
            — and with it the popup — dims whenever everything already matches your defaults; the
            footer link is always reachable.
          </li>
        </UL>
        <Subhead>Reset Settings (middle)</Subhead>
        <p>
          Restores everything in the menu to your saved defaults — or, if you haven't saved any, to
          the launch defaults:
        </p>
        <UL>
          <li>Random Format off, Written MDY</li>
          <li>Input on Buttons</li>
          <li>Julian on, Julian Chance Random</li>
          <li>Year range 1–10000</li>
          <li>Leap Year Chance Random, Jan/Feb Chance Random</li>
          <li>Save Stats on</li>
          <li>Theme back to Use System Settings with Dusk (dark) and Light (light)</li>
        </UL>
        <p>
          It does <b>not</b> touch mode-specific config outside the menu (AoX N, timer durations,
          Deduction sub-types and toggles) or your stats and history. No confirmation prompt — tap
          to apply. When every menu setting is already at your defaults, the button dims and locks
          since tapping it would have no effect.
        </p>
        <Subhead>Full Reset (right)</Subhead>
        <p>Restores the entire site to its launch state:</p>
        <UL>
          <li>
            Wipes all stats, all-time bests (Blitz, Sudden, AoX), Lookup history, and in-progress
            rounds and runs. Your stats, all-time bests, and Lookup history are saved on this
            device, so Full Reset clears that saved copy permanently.
          </li>
          <li>
            Resets every setting and toggle across all modes — both the ⚙ menu and the per-mode
            toggles. The menu settings and the four Save Defaults values (AoX N, Flash speed, both
            Blitz timers) restore to <i>your</i> saved defaults; everything else (Per Round / Per
            Question, Deduction sub-types and toggles, Allow Mistakes, One-By-One, the show/hide
            stat toggles) returns to its launch value. The saved defaults themselves survive.
          </li>
          <li>
            Closes any open overlay (How to Play, ⚙ menu, codes, method breakdown) and switches to
            Classic.
          </li>
        </UL>
        <p>
          Requires two taps to confirm: tap once and the button changes to "Confirm?"; tap again to
          fire. Auto-cancels after a few seconds, when you close ⚙, or if you tap any other control.
          When every setting, toggle, stat, best, history entry, and live state across the entire
          site is already where Full Reset would put it, the button dims and locks since tapping it
          would have no effect.
        </p>
      </GuideSection>
      <Divider label="Modes" />
      <GuideSection id="classic" title="Classic" openId={open} onToggle={toggle}>
        <Lead>The main practice mode — no time pressure, answer at your own pace.</Lead>
        <UL>
          <li>Override works after both wrong and correct answers.</li>
          <li>
            Reset Stats clears your stats and question history; when timing stats are hidden and you
            haven't burned the current date, the date is kept.
          </li>
        </UL>
      </GuideSection>
      <GuideSection id="aox" title="AoX" openId={open} onToggle={toggle}>
        <Lead>Average your times over a set number of correct solves (2–1000).</Lead>
        <p>
          The score shows correct answers out of total attempts; the run ends when correct answers
          reach your target. Press Begin to start a run.
        </p>
        <Subhead>Run options</Subhead>
        <UL>
          <li>
            <b>Allow Mistakes</b> — wrong answers don't end the run but don't count toward your
            score. With it on, Reveal and Show Codes also count as a miss but keep the run going:
            Reveal flashes the answer then automatically moves on; Show Codes opens the codes so you
            can study, then a <b>Next</b> button moves you on (it waits, since you need time to
            read). With One-By-One on, Reveal also waits on a Next button so you can see the answer
            before the next hidden date. With Allow Mistakes off, Reveal or Show Codes ends the run.
          </li>
          <li>
            <b>One-By-One</b> — hides the date between solves. Press Continue to reveal each new
            date.
          </li>
          <li>
            <b>Last / Avg / Med</b> — tap any of these to show or hide all three time stats.
          </li>
        </UL>
        <Subhead>Back / Forward &amp; Override</Subhead>
        <UL>
          <li>
            <b>Back / Forward</b> — browse previous dates from the current run without affecting it.
            Press Continue to resume; the date you were viewing and any forward entries are pushed
            back to your run history before a fresh date is generated, so nothing is lost. After a
            run completes, Back and Forward browse all dates from that run; press Reset to start
            fresh.
          </li>
          <li>
            <b>Override</b> — after wrong: gives credit with time recorded, preserves streak. After
            correct: undoes the credit, resets streak, and either ends the run (Allow Mistakes off)
            or advances to a new date (Allow Mistakes on). If a run ended (a wrong answer, a Reveal,
            or a Show Codes with Allow Mistakes off), Override credits that question and the run
            continues where it left off. You can also override past dates while browsing back. If
            overriding on the last question with Allow Mistakes on, a new date is generated to
            complete the average. One override per question. Override works the same whether Save
            Stats is on or off.
          </li>
        </UL>
        <Subhead>Stats &amp; bests</Subhead>
        <p>
          Stats in AoX are always visible and always track. Best average and best median are tracked
          independently — they can come from different runs. Beneath each best, the companion metric
          from the run that set it is also shown (e.g. the median from the run that set your best
          average). A <i>Same Round</i> or <i>Different Rounds</i> tag tells you whether your best
          average and best median came from the same exceptional run, or from two different strong
          ones.
        </p>
        <p>
          Bests stay honest under Override: a finished run's record follows its corrected stats —
          overriding away one of its credited solves (on the last question or while browsing back)
          restores the best that stood before the run, and a correction that changes the run's
          average or median updates its record to match. The score display freezes when a run ends
          and only resets after pressing Reset. Leaving AoX mid-run resets it; a finished run's
          summary is preserved when you return.
        </p>
        <p>
          Bests are tracked per exact configuration: AoX size (n), Allow Mistakes, Date Format (or
          Random Format on its own bucket), Leap Year Chance, Jan/Feb Chance on Leap Years, Julian
          Chance, year range, and Calendar System (Julian on/off). Changing any of these creates a
          separate bucket — your previous bests remain stored and reappear when you switch back to
          that exact config.
        </p>
        <p>
          The small <b>Q#</b> label at the top-right of the date card appears not only while
          back-browsing but also at run end (done/failed), so you can identify which question of the
          run you're viewing in the summary.
        </p>
      </GuideSection>
      <GuideSection id="deduction" title="Deduction" openId={open} onToggle={toggle}>
        <Lead>Identify the missing piece of a date given the rest plus the weekday.</Lead>
        <p>
          Choose Day, Month, or Year mode. The displayed date follows your selected Date Format (or
          random format snapshot, if Random Format is on), with a fixed-width underscore placeholder
          where the missing piece would normally appear.
        </p>
        <Subhead>Day</Subhead>
        <p>
          Seven consecutive days are shown, each with a unique day code. The correct day can appear
          in any position. <i>October 1582:</i> days 5–14 don't exist (the Gregorian transition
          skipped them), so the valid days are 1–4 and 15–31. When the window can't fit seven days
          on one side of the gap, it shrinks to four — codes 1, 2, 3, 4 repeat at days 15, 16, 17,
          18, so a five-day window crossing the gap would have a duplicate code.
        </p>
        <Subhead>Month</Subhead>
        <p>
          Seven fixed boxes group months that share the same month code, so tapping any month within
          a box gives the same weekday for that date. Tap the box containing the correct month. The
          boxes are always in the same position. In leap years, January shifts into the Apr/Jul box
          (becoming Jan/Apr/Jul) and February shifts into the Aug box (becoming Feb/Aug); the other
          boxes are unchanged.
        </p>
        <p>
          <i>Year 1582 with Julian on:</i> a special layout applies because the Julian/Gregorian
          transition splits the year — January through September and October 1–4 use Julian (year
          code +1), while October 15+ and November/December use Gregorian (year code −2). October's
          box position depends on the day: for days 1–4 it joins Jan and Nov ("Jan/Oct/Nov"); for
          days 15–31 it joins Jun ("Jun/Oct"); for days 5–14 it's excluded since those dates don't
          exist. The other six boxes are arranged differently from the standard layout — practice
          carefully.
        </p>
        <Subhead>Year</Subhead>
        <p>
          Five consecutive year options. Each has a unique year code, so only the correct year
          matches the displayed weekday. The correct year can appear in any position.{' '}
          <i>With Julian on:</i> when the five-year window would cross October 15, 1582 (the
          Julian/Gregorian boundary), it shrinks to two years — the calendar's 10-day jump produces
          a +5 weekday shift across that boundary that breaks distinctness for any longer window.{' '}
          <i>February 29:</i> only allowed when the window contains at least one leap year
          (Gregorian or Julian as appropriate). Non-leap years still appear as options but trivially
          can't be the answer, since Feb 29 doesn't exist in those years.
        </p>
        <Subhead>Per-mode toggles</Subhead>
        <p>
          These are mode-specific, not in the ⚙ Settings menu, since they only apply to one
          Deduction sub-mode. Year mode adds <i>ab</i> Cross (left of Day/Month/Year) and Jul Cross
          (right); Month mode adds 1582 Only (right).
        </p>
        <UL>
          <li>
            <b>
              <i>ab</i> Cross
            </b>{' '}
            (Year mode) — when on, the five-year window must cross a year ending in 00 (any 100-year
            boundary, both leap and non-leap centuries). Practice the <i>ab</i> code change
            mid-window. Disabled when your year range doesn't span any 100-year boundary.
          </li>
          <li>
            <b>Jul Cross</b> (Year mode) — when on, the two-year window must cross October 15, 1582
            (the Julian/Gregorian transition). N=2 always. Disabled when the Julian setting is off,
            or when your year range doesn't contain 1582 plus at least one of its neighbors (1581 or
            1583).
          </li>
          <li>
            <b>Both Year toggles on</b> — each puzzle randomly picks (50/50) which constraint to
            enforce. The two can't both be true for the same window.
          </li>
          <li>
            <b>1582 Only</b> (Month mode) — when on, every puzzle uses year 1582, forcing the
            special split layout described above. Disabled when the Julian setting is off or your
            year range excludes 1582. When the answer's cell groups months from both calendars, Show
            Codes uses slash notation (e.g., 1/-3, Julian/Gregorian) for any value that differs
            across the cell's months; values that are the same across all months collapse to a
            single value.
          </li>
        </UL>
        <Subhead>Sub-types &amp; stats</Subhead>
        <p>
          Switch sub-types anytime — progress in each is preserved, including question history.
          Stats are tracked separately for each sub-type, and Back/Forward only walks the current
          sub-type's entries. Reset Stats clears the current sub-type's stats and history only; the
          others are untouched. When timing stats are hidden and you haven't burned the current
          question, the question is kept.
        </p>
      </GuideSection>
      <GuideSection id="flash" title="Flash" openId={open} onToggle={toggle}>
        <Lead>The date is shown briefly, then hidden — answer from memory.</Lead>
        <UL>
          <li>
            The date is revealed for 0.1s–5.0s (default 2.0s; drag the slider or tap its value to
            type) then hidden.
          </li>
          <li>
            Reset Stats clears your stats and question history. Mid-question, Reset Stats always
            generates a new date and returns to the dash state.
          </li>
        </UL>
        <Subhead>While the date is showing</Subhead>
        <p>
          You can press Reveal or Show Codes — both freeze the countdown (the timer bar and the
          number stop together) and keep the date on screen. Reveal shows the answer and counts a
          miss; Show Codes does the same and also opens the calculation breakdown.
        </p>
      </GuideSection>
      <GuideSection id="blitz" title="Blitz" openId={open} onToggle={toggle}>
        <Lead>Answer as many dates as possible before time runs out.</Lead>
        <p>Score shows correct answers for the current round only.</p>
        <Subhead>Round options</Subhead>
        <UL>
          <li>
            <b>Allow Mistakes</b> — when on, wrong answers count against accuracy but don't end the
            round. When off, a wrong answer ends the round immediately.
          </li>
          <li>
            <b>Per Round / Per Question</b> — tap to switch. Per Round uses a single countdown for
            the whole round (10s–5m, default 60s). Per Question gives each question its own
            countdown (1s–30s, in half-seconds, default 10s); running out of time ends the round.
            Adjust either with its slider or tap the value to type. Per Question always enforces no
            mistakes: tapping Per Question auto-disables Allow Mistakes, and tapping Allow Mistakes
            on while in Per Question auto-switches back to Per Round.
          </li>
        </UL>
        <Subhead>Ending a round &amp; Override</Subhead>
        <p>
          When the round ends, the correct answer for the current date is highlighted and your bests
          are recorded. A round also ends if you give up on the current date with Reveal or Show
          Codes, or — with Allow Mistakes off (or in Per Question) — if you override a correct
          answer to wrong.
        </p>
        <p>
          You can then browse your round's history with Back/Forward and override past dates to
          adjust your score and saved bests. Overriding the question that ended the round — whether
          it ended on a wrong answer, a Reveal, or a Show Codes — credits it and resumes the round:
          the countdown picks up where it left off (Per Round) or a fresh question timer starts on
          the next date (Per Question), and the round's bests aren't locked in until the round ends
          for real (so a misclick you fix doesn't update your bests). Override works the same
          whether Save Stats is on or off.
        </p>
        <Subhead>Streak &amp; bests</Subhead>
        <UL>
          <li>
            Streak is hidden in Per Question, since any wrong answer ends the round, making streak
            equal to score.
          </li>
          <li>
            Best scores are tracked per exact configuration: timer duration, Allow Mistakes, Per
            Round/Per Question, Date Format (or Random Format as its own bucket), Leap Year Chance,
            Jan/Feb Chance on Leap Years, Julian Chance, year range, and Calendar System (Julian
            on/off). Changing any of these creates a separate bucket — your previous bests remain
            stored and reappear when you switch back.
          </li>
          <li>
            Best score and best streak are tracked independently in Per Round; a <i>Same Round</i>{' '}
            or <i>Different Rounds</i> tag tells you whether they came from the same exceptional
            round or two different strong ones.
          </li>
        </UL>
        <Subhead>Leaving &amp; resetting</Subhead>
        <p>
          Leaving Blitz mid-round abandons it — you return to a fresh, idle Blitz (no hidden
          countdown keeps running while you're away). If you leave after a round ends without
          pressing Reset, the round state (bests, history, final date) is preserved when you return.
          Press Reset to clear your current round, unlock the settings, and start fresh. Changing
          settings while idle resets the current round.
        </p>
      </GuideSection>
      <GuideSection id="lookup" title="Lookup" openId={open} onToggle={toggle}>
        <Lead>Enter any AD date to instantly see its weekday.</Lead>
        <UL>
          <li>
            Lookup input is always numeric and follows your selected Date Format (m/d/y, d.m.y, or
            y-m-d). It ignores Random Format and always uses the selected format directly. Changing
            the Date Format clears the input box.
          </li>
          <li>Supports years 1–10000.</li>
          <li>
            Show Codes is available for all results and stays open as you browse your history.
          </li>
          <li>
            The history panel shows up to 10 entries before scrolling and re-renders live when you
            change the Date Format.
          </li>
          <li>
            October 5–14, 1582 never existed and will appear in history as "Does Not Exist" with
            Show Codes unavailable.
          </li>
        </UL>
      </GuideSection>
    </div>
  )
}
