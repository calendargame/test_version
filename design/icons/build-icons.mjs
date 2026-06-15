// Rasterize the chosen app-icon SVG masters into the PWA PNG set in public/.
// Reproducible: re-run with `node design/icons/build-icons.mjs` after editing a master.
//
//   icon-piday-trace.svg       (light master)  -> the standard/light icons + favicon
//   icon-piday-trace-dark.svg  (dark master)   -> the dark apple-touch-icon (iOS dark mode)
//
// The masters are finished, full-bleed 512x512 designs (the glyph already sits inside the
// 40% maskable safe circle), so each output is a straight high-quality downscale — no extra
// padding or background compositing. sharp renders the SVG at high density first (crisp), then
// resizes. Outputs are referenced by the web manifest (vite.config) and index.html.
//
// TWO sets are produced from the SAME light master:
//   • public/                    — the PURPLE icons (the LIVE site).
//   • design/icons/test-build/   — a GRAY-background variant (the TEST/staging site only), so the
//     two installed apps + browser tabs are distinguishable at a glance. The gray set is NOT in
//     public/ (so it never ships to live); a vite plugin copies it over dist/ for non-live builds
//     (see vite.config `testIconVariant`). Gray = a flat medium gray (#6b7280, owner's pick
//     2026-06-13) replacing the purple gradient + glow; the white glyph is unchanged.
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const outDir = join(root, 'public')
const testOutDir = join(here, 'test-build') // gray variant, copied into dist for non-live builds
mkdirSync(outDir, { recursive: true })
mkdirSync(testOutDir, { recursive: true })

const lightSvg = readFileSync(join(here, 'icon-piday-trace.svg'), 'utf8')
// The TEST (staging) variant: swap the purple gradient bg for a flat medium gray and drop the
// purple-tinted glow. The white glyph is untouched. (Owner's pick: #6b7280, 2026-06-13.)
const TEST_BG = '#6b7280'
const graySvg = lightSvg
  .replace('fill="url(#bg)"', `fill="${TEST_BG}"`)
  .replace('<rect width="512" height="512" fill="url(#glow)"/>', '')
  // Drop the now-unused gradient defs (bg + glow) so the gray asset carries no dead markup —
  // only `trace` (the glyph stroke) is still referenced.
  .replace(/\s*<linearGradient id="bg"[\s\S]*?<\/linearGradient>/, '')
  .replace(/\s*<radialGradient id="glow"[\s\S]*?<\/radialGradient>/, '')
// Dark home-screen icon is DISABLED — iOS doesn't reliably honor a dark-variant apple-touch-icon
// (it often needs a remove + re-add, or ignores it entirely), so we ship the single light icon.
// The dark master SVG is kept. To re-enable: uncomment the 3 dark lines here + re-run this script,
// and uncomment the dark <link> in index.html.
// const darkSvg = readFileSync(join(here, 'icon-piday-trace-dark.svg'))

// Render the SVG to a crisp 1024px base raster once, then downscale to each target.
const base = (svg) => sharp(svg, { density: 384 }).resize(1024, 1024).png().toBuffer()
const write = async (buf, size, dir, file) =>
  sharp(buf).resize(size, size).png({ compressionLevel: 9 }).toFile(join(dir, file))

// Produce the full PNG/SVG set from one full-bleed 512 master into `dir`.
//   • FAVICON (browser-tab icon) gets ROUNDED corners — the modern app-tile look. We round ONLY the
//     favicon, never the home-screen icons: iOS already rounds the apple-touch-icon into its squircle
//     and Android masks the maskable, so pre-rounding those would double-round them. The round = give
//     the full-bleed 512x512 background rect(s) an rx (~22.5%, matching the iOS squircle + the OG card
//     icon); the glyph sits centred (~80px clear of every edge) so it's never clipped.
//   • The MASKABLE (Android adaptive) variant re-renders the glyph at a REDUCED scale so it stays
//     inside the 40% maskable safe circle (a pure-circle mask would otherwise clip the big glyph).
//     The master's larger scale is kept for the visible icons (iOS apple-touch / "any" / favicon).
const FAVICON_RADIUS = 115 // ≈ 22.5% of 512
async function generateSet(masterSvg, dir) {
  const roundedFaviconSvg = masterSvg.replaceAll(
    '<rect width="512" height="512"',
    `<rect width="512" height="512" rx="${FAVICON_RADIUS}" ry="${FAVICON_RADIUS}"`,
  )
  const maskableSvg = masterSvg.replace(/scale\([\d.]+\)/, 'scale(1.9)')

  const visibleBase = await base(Buffer.from(masterSvg)) // big glyph: any / apple-touch / favicon
  const maskableBase = await base(Buffer.from(maskableSvg)) // reduced glyph: safe inside the mask circle
  const faviconBase = await base(Buffer.from(roundedFaviconSvg)) // rounded corners: the browser-tab favicon

  await Promise.all([
    // Web app manifest icons (any) — from the big-glyph master.
    write(visibleBase, 64, dir, 'pwa-64x64.png'),
    write(visibleBase, 192, dir, 'pwa-192x192.png'),
    write(visibleBase, 512, dir, 'pwa-512x512.png'),
    // Maskable (Android adaptive) — reduced glyph so a circle mask can't clip it.
    write(maskableBase, 512, dir, 'maskable-icon-512x512.png'),
    // iOS home-screen icon (180). Light only — the dark variant is disabled (see note above).
    write(visibleBase, 180, dir, 'apple-touch-icon.png'),
    // write(darkBase, 180, dir, 'apple-touch-icon-dark.png'),   // dark icon disabled
    // Favicon (browser tab): a scalable SVG (modern browsers) + a 32px PNG fallback — both ROUNDED.
    write(faviconBase, 32, dir, 'favicon-32x32.png'),
  ])
  // favicon.svg = the ROUNDED-corner master (the browser-tab icon), not the square home-screen master.
  writeFileSync(join(dir, 'favicon.svg'), roundedFaviconSvg)
}

await generateSet(lightSvg, outDir) // PURPLE → public/ (live)
await generateSet(graySvg, testOutDir) // GRAY → design/icons/test-build/ (test/staging only)

const files = [
  'pwa-64x64.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'maskable-icon-512x512.png',
  'apple-touch-icon.png',
  'favicon-32x32.png',
  'favicon.svg',
]
console.log('PWA icons written:')
for (const f of files) console.log('  public/' + f + '   (purple)')
for (const f of files) console.log('  design/icons/test-build/' + f + '   (gray, test build)')
