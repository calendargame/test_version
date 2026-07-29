// The small shared presentation helpers the mode screens and App both use: the date-format roll,
// the touch probe, and the time / accuracy formatters. Extracted verbatim from main.tsx (Q1 phase
// 1) so the five mode screens can move into their own modules.
import type { FormatId } from './format.js'

// FORMAT_IDS / rollFormat live at module scope so App's genDate and every mode
// component can stamp a date's ._fmt at generation time.
export const FORMAT_IDS: FormatId[] = [
  'written-mdy',
  'written-dmy',
  'numeric-mdy',
  'numeric-dmy',
  'numeric-ymd',
]
export const rollFormat = () => FORMAT_IDS[Math.floor(Math.random() * FORMAT_IDS.length)]
export const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    matchMedia('(pointer:coarse)').matches)
export const fmtBlitzT = (s: number) => {
  const sec = Math.ceil(s)
  if (sec < 60) return sec + 's'
  const m = Math.floor(sec / 60),
    r = sec % 60
  return m + 'm ' + r + 's'
}
export const fmtFlashT = (ms: number) => (ms / 1000).toFixed(1) + 's'
// The ONE readout-width strut string shared by six of the SEVEN SliderValueEditor sites (3
// mode-screen + 3 timer rows in the Save Defaults popup; the seventh — the defaults manager's
// AoX run-length row — is a plain count, not a time, and carries its own "1000" strut): the
// widest value ANY timer readout can display, derivation at the first site (FlashMode). One
// const = all six of those columns identical, constant at runtime.
export const SLIDER_READOUT_WIDEST = fmtBlitzT(175) /* "2m 55s" */
// Time display follows WCA convention (regulation 9f1): individual single times
// (Last) are truncated to hundredths — the third decimal is dropped, never rounded.
// Averages, medians, and bests are rounded to nearest hundredth (toFixed(2)).
// truncTime drops the third decimal; fmtTime rounds via toFixed(2).
export const truncTime = (t: number | null) =>
  t == null || t >= 60 ? '—' : `${(Math.floor(t * 100) / 100).toFixed(2)}s`
export const fmtTime = (t: number | null) => (t == null || t >= 60 ? '—' : `${t.toFixed(2)}s`)
// WCA-consistent accuracy formatter: when there's at least one wrong answer, floor (truncate) the
// percentage so we never display "100.0%" for 9999/10000 (which rounds up under toFixed). Pure 100%
// displays normally. Same philosophy as truncTime (regulation 9f1) — never inflate the user's result.
export const fmtAccuracyPct = (good: number, played: number) => {
  if (!played) return '—'
  const pct = (good / played) * 100
  if (good < played && pct >= 99.95) return '99.9%'
  return `${pct.toFixed(1)}%`
}
// calcAvg / calcLast / calcMed → src/engine/stats.js, imported at top (shared by the mode strips).
export const blockMinus = (e: React.KeyboardEvent) => {
  if (e.key === '-' || e.key === 'Subtract' || e.key === 'Minus') e.preventDefault()
}
export const blockMinusBI = (e: React.FormEvent<HTMLInputElement> & { data?: string | null }) => {
  if (e.data && e.data.includes('-')) e.preventDefault()
}
