// lib/sliderValue.ts — pure commit math for the tap-to-type slider value editors (Round-2).
//
// Kept apart from the component (components/SliderValueEditor.tsx) for the same reason as
// lib/statFit.ts: the component file only exports components (the react-refresh rule), and the
// parse → convert → snap → clamp pipeline is trivially unit-testable without any DOM wiring.

export type SliderCommitCfg = {
  min: number // internal units (ms for Flash, seconds for the Blitz timers)
  max: number
  snap: number // the grid a typed value rounds onto (100ms / 5s / 0.5s), also in internal units
  fromText?: (n: number) => number // typed-number → internal units (Flash: seconds ×1000 → ms)
}

// Commit a typed slider value: parse the text, convert to internal units, snap to the slider's
// grid, clamp into range. `null` = nothing committable (empty / non-numeric) — the caller reverts
// to the current value, mirroring the AoX-N field's fallback-on-junk behavior. A comma decimal
// separator parses like a dot: iOS/Android decimal keypads in comma-locales (German, French, …)
// only offer ',', and parseFloat alone would read "2,5" as 2.
export const commitSliderText = (text: string, cfg: SliderCommitCfg): number | null => {
  const n = parseFloat(text.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const raw = cfg.fromText ? cfg.fromText(n) : n
  const snapped = Math.round(raw / cfg.snap) * cfg.snap
  return Math.min(cfg.max, Math.max(cfg.min, snapped))
}
