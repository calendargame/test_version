/// <reference types="vite/client" />

// Build-time constants substituted by vite.config.js's `define`. They are not real globals — the
// bundler replaces the identifier with a literal — so they exist for the type-checker only, and a
// declaration here is what keeps `tsc --noEmit` honest about them.
//
// __BUILD_TS__ — the deploy stamp (Q1, round 16): the ISO UTC instant this build started, or the
// frozen 1970 sentinel outside `vite build`. Read in exactly one place, src/deployStamp.ts, which
// explains both halves; declared as `string` rather than a template-literal type because the value
// is produced by Date#toISOString and there is nothing for a narrower type to catch.
declare const __BUILD_TS__: string
