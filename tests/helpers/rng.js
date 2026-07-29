// Seeded PRNG shared by every test that needs REPRODUCIBLE randomness.
//
// mulberry32 — a small, fast, well-distributed 32-bit generator. It was independently copied into
// dateGen.dom, aoxBest and blitzBest before this file existed; those three now import it here so
// there is exactly one copy (rule #5).
//
// Two distinct uses in this suite:
//   1. As an explicit value source — `const rnd = mulberry32(12345)` — for fuzz/sweep drivers that
//      choose their own actions.
//   2. As a Math.random REPLACEMENT, so the app's own randomness (date and puzzle generation, which
//      call Math.random directly) becomes deterministic for the duration of a test. Use
//      `installSeededRandom` for that and always restore in a finally, or a leaked stub silently
//      makes every later test in the file deterministic too.
export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Replace Math.random with a seeded sequence. Returns the restore function.
//
//   const restore = installSeededRandom(1234)
//   try { ...drive the app... } finally { restore() }
//
// Why this exists: a DOM test that hunts a RARE puzzle layout by advancing until it appears has an
// unbounded iteration count in the tail, so its wall-clock is unbounded too — under full-suite load
// that is a timeout, i.e. a flaky gate. Fixing the seed makes the sequence (and therefore the
// iteration count) a constant, so the sweep is fast and can neither flake nor time out. Breadth
// belongs in the engine-layer fuzz, not in a DOM characterization test.
export function installSeededRandom(seed) {
  const real = Math.random
  const rng = mulberry32(seed)
  Math.random = () => rng()
  return () => {
    Math.random = real
  }
}
