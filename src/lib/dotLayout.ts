// ─────────────────────────────────────────────────────────────────────────
// dotLayout.ts — the 7-dot answer layout's grid geometry (single source of truth)
//
// The logo's 7-position layout used by the Dots answer input (Settings →
// Display → Input; components/WeekdayAnswer) AND by How-to-Play's labelled
// DotDiagram (components/GuidePage) — both derive from THIS array, so the
// diagram can never drift from the real input. The array index is the weekday
// (0=Sun..6=Sat), so the dot buttons stay in DOM order Sun..Sat (the keyboard
// 0–9 path reads children[idx]); each entry is the 1-indexed CSS grid cell
// (row r, column c) the dot is placed in, matching the app icon / W5Logo:
// Sun centre, Mon bottom-right, Tue mid-right, Wed top-right, Thu bottom-left,
// Fri mid-left, Sat top-left. Centre-top (r1,c2) + centre-bottom (r3,c2)
// stay empty.
// ─────────────────────────────────────────────────────────────────────────
export const DOT_CELL: ReadonlyArray<{ r: number; c: number }> = [
  { r: 2, c: 2 }, // 0 Sunday    — centre
  { r: 3, c: 3 }, // 1 Monday    — bottom-right
  { r: 2, c: 3 }, // 2 Tuesday   — mid-right
  { r: 1, c: 3 }, // 3 Wednesday — top-right
  { r: 3, c: 1 }, // 4 Thursday  — bottom-left
  { r: 2, c: 1 }, // 5 Friday    — mid-left
  { r: 1, c: 1 }, // 6 Saturday  — top-left
]
