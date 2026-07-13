// Generates the iOS LAUNCH FRAMES (apple-touch-startup-image) — the static PNG iOS shows from the
// moment a home-screen app is tapped until the page's first web paint. iOS ignores the manifest's
// background_color, so without these the launch frame is blank white for the whole ~0.5–1s web-process
// spawn. Each PNG renders index.html's #boot splash EXACTLY — the W5 glyph (the same path/dots/
// circled-answer geometry as the inline #boot SVG, lavender #c4b5fd) over the faint radial glow
// (rgba(196,181,253,.2) → transparent at 66%, a 380 CSS-px circle), centered on a #0d1117 canvas —
// so the OS frame hands off seamlessly into the identical in-page splash. iOS only honors an image
// whose pixel size EXACTLY matches the device (pt × devicePixelRatio; a lone fallback is ignored),
// so one PNG is emitted per iPhone size class below, logo + glow scaled by that class's pixel ratio;
// index.html pairs each file with an exact-size media query. Keep the glyph/glow/bg here in sync with
// index.html's #boot (and src/components/W5Logo.tsx). Run: node design/icons/build-splash.mjs
//
// DELIBERATE (2026-07-12): NO gray staging variant — BOTH repos ship this identical lavender/#0d1117
// set (do NOT add these files to vite.config.js testIconVariant). The startup image's entire purpose
// is a seamless handoff into the #boot splash, which is lavender-on-dark on staging AND production;
// a gray launch frame would visibly pop against the lavender splash it hands off to. The gray staging
// distinction stays where it lives today: the app icons + the OG card.
//
// Caveats (researched 2026-07-12): iOS caches the frame at Add-to-Home-Screen time and never
// refreshes it for an existing install — delete + re-add the icon to pick up changes. The frame is
// static: Light/Parchment users see this dark frame until the theme-aware splash paints — accepted
// (dark is the default theme; the alternative is a blank white frame for everyone). Portrait-only:
// landscape launches fall back to the blank frame — accepted for a portrait-phone-first app.
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

// #boot splash geometry (index.html) in CSS px — multiplied by each device's pixel ratio below.
const LOGO_W = 174 //  the inline #boot <svg> width…
const LOGO_H = 188 //  …and height
const GLOW_D = 380 //  the .bg glow circle's diameter
// CSS radial-gradient(circle,…) sizes to the FARTHEST CORNER of its 380×380 box (190·√2 ≈ 268.7px),
// so #boot's 66%-stop actually reaches transparent at ≈177px from center — inside the
// border-radius:50% clip, which therefore never shows. Replicated exactly: a userSpaceOnUse
// gradient of that farthest-corner radius, painted over the full canvas (alpha is 0 past ≈177px).
const GLOW_R = (GLOW_D / 2) * Math.SQRT2

// One entry per iPhone PORTRAIT size class: [CSS-pt width, height] + devicePixelRatio. iOS matches
// the media query on pt/dpr and requires the PNG to be exactly pt×dpr pixels. Covers every distinct
// iPhone screen through the 16/17 era, incl. the owner's 15 Pro Max (430×932pt @3x → 1290×2796).
const SIZES = [
  { pt: [320, 568], dpr: 2, label: 'iPhone SE 1 / 5s' },
  { pt: [375, 667], dpr: 2, label: 'iPhone SE 2/3 / 6–8' },
  { pt: [414, 736], dpr: 3, label: 'iPhone 6–8 Plus' },
  { pt: [375, 812], dpr: 3, label: 'iPhone X / XS / 11 Pro' },
  { pt: [414, 896], dpr: 2, label: 'iPhone XR / 11' },
  { pt: [414, 896], dpr: 3, label: 'iPhone XS Max / 11 Pro Max' },
  { pt: [360, 780], dpr: 3, label: 'iPhone 12/13 mini' },
  { pt: [390, 844], dpr: 3, label: 'iPhone 12/13/14 / 16e' },
  { pt: [393, 852], dpr: 3, label: 'iPhone 14 Pro / 15 / 15 Pro / 16' },
  { pt: [402, 874], dpr: 3, label: 'iPhone 16 Pro / 17 / 17 Pro' },
  { pt: [420, 912], dpr: 3, label: 'iPhone Air' },
  { pt: [428, 926], dpr: 3, label: 'iPhone 12/13 Pro Max / 14 Plus' },
  { pt: [430, 932], dpr: 3, label: 'iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus' },
  { pt: [440, 956], dpr: 3, label: 'iPhone 16 Pro Max / 17 Pro Max' },
]

// One frame: bg + glow + the W5 glyph (nested <svg> reusing the #boot viewBox, so the glyph's
// internal geometry stays byte-identical to index.html; currentColor is resolved to the literal
// lavender the dark themes use). Centered like #boot's flexbox (the sub-pt offset iOS's status bar
// introduces in-page is invisible at splash scale and not worth per-device metrics).
const frame = async ({ pt: [wpt, hpt], dpr, label }) => {
  const W = wpt * dpr
  const H = hpt * dpr
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${W / 2}" cy="${H / 2}" r="${GLOW_R * dpr}">
      <stop offset="0" stop-color="#c4b5fd" stop-opacity="0.2"/>
      <stop offset="0.66" stop-color="#c4b5fd" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0d1117"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <svg x="${(W - LOGO_W * dpr) / 2}" y="${(H - LOGO_H * dpr) / 2}" width="${LOGO_W * dpr}" height="${LOGO_H * dpr}" viewBox="178 173 146 158" fill="none">
    <g fill="#c4b5fd" opacity="0.3"><circle cx="256" cy="256" r="10"/><circle cx="310" cy="316" r="10"/><circle cx="202" cy="316" r="10"/><circle cx="202" cy="256" r="10"/></g>
    <path d="M310,256 C313,226 313,206 310,196 C300,184 240,184 202,196" stroke="#c4b5fd" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <g fill="#c4b5fd"><circle cx="310" cy="256" r="10"/><circle cx="310" cy="196" r="10"/></g>
    <circle cx="202" cy="196" r="9" fill="#c4b5fd"/><circle cx="202" cy="196" r="19" fill="none" stroke="#c4b5fd" stroke-width="5"/>
  </svg>
</svg>`
  const out = join(root, 'public', `apple-splash-${W}-${H}.png`)
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out)
  console.log(`Wrote ${out} (${W}x${H} — ${wpt}x${hpt}pt @${dpr}x, ${label})`)
}

for (const s of SIZES) await frame(s)
