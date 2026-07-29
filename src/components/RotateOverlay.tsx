import W5Logo from './W5Logo.jsx'

// RotateOverlay (Q11) — the full-screen "rotate back to portrait" screen for the platforms the
// manifest's orientation:'portrait' can't hard-lock (iOS parses + ignores the key; locked
// Android installs never rotate, so they never see this). Rendered by App while
// landscapeBlocked (touch device + CSS landscape + short viewport — the gate lives in App so
// the same boolean also pauses the countdown modes via clockPaused). Speaks the boot-splash
// visual language: the same .boot-overlay/.boot-mark/.boot-glow frame as #boot / BootOverlay
// (theme-aware bg + light-theme logo recolor come from those classes) with the W5 mark at the
// splash's exact size (W5Logo size 188 = the 174×188 splash glyph — no duplicated SVG). The
// fixed z-100 cover also blocks every interaction with the sideways app beneath it; rotating
// back unmounts it, no dismiss affordance by design.
function RotateOverlay() {
  return (
    <div className="boot-overlay">
      <div className="boot-mark">
        <div className="boot-glow" />
        <W5Logo size={188} />
      </div>
      <div className="rotate-caption">Rotate back to portrait</div>
    </div>
  )
}

export default RotateOverlay
