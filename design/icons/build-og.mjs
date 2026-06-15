// Generates the Open Graph / social-share preview image (1200x630) — the card a shared link renders.
// Two variants from one template (mirrors build-icons.mjs):
//   • public/og-image.jpg                    — PURPLE brand card (the LIVE site).
//   • design/icons/test-build/og-image.jpg   — GRAY card (the TEST/staging site only), so a shared
//     staging link is visually distinct. Not in public/, so it never ships to live; the vite plugin
//     copies it over dist/ for non-live builds (and rewrites the og:image/og:url meta to staging).
// The W5 app icon + the app name & tagline are baked INTO the image (a common system sans-serif via
// sharp/resvg) so the card reads identically everywhere. Run: node design/icons/build-og.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const W = 1200
const H = 630
const ICON = 330
const ICON_LEFT = 45 //  icon's left margin (45px); the title's right margin is matched to it (symmetric)
const ICON_TOP = Math.round((H - ICON) / 2)
const TEXT_X = 415 //     left edge (anchor) of the title
const SUB_X = 417 //      tagline anchor — nudged right 2px so its visible LEFT edge sits flush with the title's
const SUB_SIZE = 38.3 //  tagline size — shrunk a hair so its visible RIGHT edge sits flush with the title's too
const radius = Math.round(ICON * 0.22) // ~22% — echoes how iOS renders the home-screen icon as a tile

// One card. `stops` = the bg linear-gradient (deep -> light); `glow` = the soft radial glow behind the
// icon; `tagline` = the sub-title text color; `iconPath` = the rounded app-icon composited at left.
// Title is always white. The title/tagline x+size are pixel-tuned against the real resvg render so the
// tagline's visible left AND right edges sit flush with the title's (the "C" and "M" have different
// left side bearings, so a shared anchor + size leaves them ~2px off; dialed in 2026-06-07).
const card = async ({ stops, glow, tagline, iconPath, out }) => {
  const gradStops = stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${gradStops}</linearGradient>
    <radialGradient id="glow" cx="${((ICON_LEFT + ICON / 2) / W).toFixed(3)}" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${glow}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <text x="${TEXT_X}" y="310" font-family="Arial, Helvetica, sans-serif" font-size="101.6" font-weight="700" fill="#ffffff">Calendar Game</text>
  <text x="${SUB_X}" y="378" font-family="Arial, Helvetica, sans-serif" font-size="${SUB_SIZE}" font-weight="400" fill="${tagline}">Master Mental Day-of-the-Week Calculation</text>
</svg>`
  const roundMask = Buffer.from(
    `<svg width="${ICON}" height="${ICON}"><rect width="${ICON}" height="${ICON}" rx="${radius}" ry="${radius}"/></svg>`,
  )
  const icon = await sharp(iconPath)
    .resize(ICON, ICON)
    .composite([{ input: roundMask, blend: 'dest-in' }])
    .png()
    .toBuffer()
  await sharp(Buffer.from(bg))
    .composite([{ input: icon, left: ICON_LEFT, top: ICON_TOP }])
    .jpeg({ quality: 90, mozjpeg: true }) // JPEG: standard for OG, ~5x smaller than PNG at card quality
    .toFile(out)
  console.log(`Wrote ${out} (${W}x${H})`)
}

// PURPLE (live) — colors match the icon palette (#2e1065 / #5b21b6 / #7c3aed, glow #a855f7).
await card({
  stops: [
    ['0', '#2e1065'],
    ['0.55', '#5b21b6'],
    ['1', '#7c3aed'],
  ],
  glow: '#a855f7',
  tagline: '#ddd0fb',
  iconPath: join(root, 'public', 'pwa-512x512.png'),
  out: join(root, 'public', 'og-image.jpg'),
})

// GRAY (test/staging) — a gray gradient ending at the icon's #6b7280, a soft light-gray glow, and a
// light-gray tagline (no purple). Uses the GRAY app icon. Distinguishes a shared staging link.
await card({
  stops: [
    ['0', '#374151'],
    ['0.55', '#4b5563'],
    ['1', '#6b7280'],
  ],
  glow: '#9ca3af',
  tagline: '#d1d5db',
  iconPath: join(here, 'test-build', 'pwa-512x512.png'),
  out: join(here, 'test-build', 'og-image.jpg'),
})
