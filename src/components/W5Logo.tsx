// W5Logo — the in-app brand mark beside the title (Stage D3). It's the glyph from the app
// icon (design/icons/icon-piday-trace.svg): the Pi-Day 3/14/1592 day-of-week trace, finger
// positions 2 -> 3 -> 6 landing on the circled answer (6 = Saturday), with the rest of the
// 7-position board as faint dots.
//
// Theme-aware: everything is drawn in `currentColor`, so it inherits the title's text color
// and stays legible on all five themes (light-on-dark for dusk/midnight/nebula, dark-on-light
// for light/parchment) — no per-theme overrides needed. Decorative (aria-hidden); the adjacent
// <h1> carries the accessible name. The viewBox tightly frames the glyph (drawn in the icon's
// 512 coordinate space) so it sits at text height without the icon's purple tile/background.
export default function W5Logo({
  className = '',
  size = 26,
}: {
  className?: string
  size?: number
}) {
  const width = Math.round((146 / 158) * size)
  return (
    <svg
      width={width}
      height={size}
      viewBox="178 173 146 158"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* faint board dots not on the trace (positions 0, 1, 4, 5) */}
      <g fill="currentColor" opacity="0.3">
        <circle cx="256" cy="256" r="10" />
        <circle cx="310" cy="316" r="10" />
        <circle cx="202" cy="316" r="10" />
        <circle cx="202" cy="256" r="10" />
      </g>
      {/* the trace: 2 -> 3 -> 6, one smooth flowing curve (shape W5) */}
      {/* trace dimmed 0.7 — matches the icon master (line dimmer than dots); keep #boot / W5Logo / BootOverlay identical */}
      <path
        d="M310,256 C313,226 313,206 310,196 C300,184 240,184 202,196"
        stroke="currentColor"
        strokeOpacity={0.7}
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* on-path nodes 2, 3 (aligned on the right column) */}
      <g fill="currentColor">
        <circle cx="310" cy="256" r="10" />
        <circle cx="310" cy="196" r="10" />
      </g>
      {/* the landed answer (6 = Saturday), circled */}
      <circle cx="202" cy="196" r="9" fill="currentColor" />
      <circle cx="202" cy="196" r="19" fill="none" stroke="currentColor" strokeWidth="5" />
    </svg>
  )
}
