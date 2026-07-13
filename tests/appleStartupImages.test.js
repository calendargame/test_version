// iOS launch frames (apple-touch-startup-image): index.html must pair one link per supported
// iPhone size class with a generated PNG in public/ (emitted by design/icons/build-splash.mjs).
// iOS silently ignores an image whose pixel size doesn't EXACTLY equal device pt × pixel ratio,
// so the contract under test is that exactness: every link's media query is well-formed (exact
// device-width/height + -webkit-device-pixel-ratio + portrait), its href encodes pt×ratio, and
// the PNG on disk exists at exactly those pixel dimensions. Driven on the SOURCE index.html
// (like bootCssPreload.test.js) — the build only rebases the hrefs, never the set.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(join(root, 'index.html'), 'utf8')
const links = html.match(/<link rel="apple-touch-startup-image"[^>]*>/g) ?? []

// The one accepted shape: exact-size portrait media query + a root-relative pt×ratio-named PNG.
const STRICT =
  /^<link rel="apple-touch-startup-image" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: portrait\)" href="\/apple-splash-(\d+)-(\d+)\.png">$/

// PNG pixel dimensions live in the IHDR chunk: width/height as big-endian u32 at bytes 16/20.
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })

describe('iOS apple-touch-startup-image launch frames (index.html + public/)', () => {
  it('declares a full portrait iPhone set — at least 12 sizes, no duplicate device classes', () => {
    expect(links.length).toBeGreaterThanOrEqual(12)
    const medias = links.map((l) => /media="([^"]*)"/.exec(l)?.[1])
    expect(new Set(medias).size).toBe(links.length)
  })

  it("includes the owner's iPhone 15 Pro Max class (430x932pt @3x → 1290x2796)", () => {
    expect(links.some((l) => l.includes('/apple-splash-1290-2796.png'))).toBe(true)
  })

  it('every link is well-formed and its href pixel size equals device pt × pixel ratio', () => {
    for (const link of links) {
      const m = STRICT.exec(link)
      expect(m, link).not.toBeNull()
      const [, wpt, hpt, ratio, wpx, hpx] = m.map(Number)
      expect(wpx, link).toBe(wpt * ratio)
      expect(hpx, link).toBe(hpt * ratio)
    }
  })

  it('every href has its generated PNG in public/, at exactly the advertised dimensions', () => {
    for (const link of links) {
      const [, file, wpx, hpx] = /href="\/(apple-splash-(\d+)-(\d+)\.png)"/
        .exec(link)
        .map((v, i) => (i >= 2 ? Number(v) : v))
      const path = join(root, 'public', file)
      expect(existsSync(path), file).toBe(true)
      expect(pngSize(readFileSync(path)), file).toEqual({ w: wpx, h: hpx })
    }
  })
})
