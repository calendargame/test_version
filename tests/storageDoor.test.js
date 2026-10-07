// storageDoor — NOTHING IN src/ WRITES localStorage EXCEPT THROUGH store/storageHealth.
//
// Why it is pinned: store/storageHealth is the one door every save goes through, and two things
// rest on that being true. A save the device refuses is caught and held only at the door; and
// store/storageUsage's count of how full the device is moves only when the door reports a write or
// a removal — a write made around it is a save nobody holds and a size nobody counted.
//
// The one exception is src/changelog.ts, which must stay free of imports (vite.config.js imports it
// to check the changelog's date) and so cannot call the door. It writes its own few keys — the
// update dots, the changelog's seen-marker, none of it anything a player made — and tells the door
// about each one as it does (its reportWritesTo), so the count hears of those too. What is pinned
// for it here is that EVERY raw write it makes is followed by that telling; that the telling is
// counted exactly is pinned where the count is (tests/storageUsage.dom).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC = join(process.cwd(), 'src')
const THE_DOOR = 'store/storageHealth.ts'
const LEAF_WRITER = 'changelog.ts'

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}
// Comments out: this is about code, and plenty of comments talk about setItem.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const name = (path) => relative(SRC, path).split(sep).join('/')

describe('the storage door', () => {
  const files = sources(SRC).map((path) => ({
    file: name(path),
    text: code(readFileSync(path, 'utf8')),
  }))

  it('only the door, and the one leaf module, call setItem / removeItem / clear on a storage area', () => {
    // sessionStorage is a different allowance and has its own guarded writers; what must not
    // exist is a raw write that could be aimed at localStorage — a bare call on a Storage.
    const rawWriters = files
      .filter(({ text }) =>
        /\b(localStorage|ls|area|storage)\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(text),
      )
      .map(({ file }) => file)
      .sort()
    expect(rawWriters).toEqual([LEAF_WRITER, THE_DOOR].sort())
  })

  it('the leaf module is still a leaf, and nothing it writes is a store’s key', () => {
    const { text } = files.find(({ file }) => file === LEAF_WRITER)
    expect(text).not.toMatch(/^import /m) // the reason it may not use the door
    expect(text).not.toMatch(/cg-(progress|settings|modeprefs|userdefaults|presets|lookup|times)-/)
  })

  it('every write the leaf module makes is told to the door on the very next line', () => {
    const { text } = files.find(({ file }) => file === LEAF_WRITER)
    const writes = text.match(/\blocalStorage\.(setItem|removeItem|clear)\(/g) ?? []
    // The write, then — as the next statement — the same key named to whoever is listening.
    const told =
      text.match(/\blocalStorage\.(setItem|removeItem)\((\w+)\b[^\n]*\n\s*wrote\?\.\(\2\)/g) ?? []
    expect(writes.length).toBeGreaterThan(0)
    expect(told).toHaveLength(writes.length)
  })

  it('the door is who the leaf module tells', () => {
    const { text } = files.find(({ file }) => file === THE_DOOR)
    expect(text).toMatch(/\breportWritesTo\(/)
  })
})
