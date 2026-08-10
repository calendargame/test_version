// tests/versionLedger.test.js — the version bump guard (2026-08-10).
//
// THE CLASS THIS PINS is the same one tests/buildNumber.test.js pins, in different clothes: an
// answer that is WRONG BUT ENTIRELY PLAUSIBLE. Every loud failure here (git missing, a garbage
// version) would stop a deploy on its own. The one that would silently ship a duplicate forever is
// an EMPTY LEDGER read as "nothing to collide with" — which is what a checkout that did not fetch
// tags looks like from inside this function. So the empty case is tested as a FAILURE, deliberately,
// and that test is the reason the guard is safe to trust.
//
// The second silent-wrong case is ordering: "2.9.0" sorts AFTER "2.10.0" as text, so a lexical
// comparison would call a genuine downgrade an upgrade. Pinned below.
//
// WHY THESE CASES ARE CHEAP: checkVersionLedger takes plain DATA — a version string and an array of
// tag names — so a fresh repository, a mangled tag and a hundred prior releases are all one-line
// literals. No git process, no fixture repo, no temp directory. The wiring that feeds it lives in
// scripts/checkVersionLedger.mjs and is the part that cannot be subtly wrong.
import { describe, it, expect } from 'vitest'
import {
  GIT_TAG_ARGS,
  parseVersion,
  compareVersions,
  checkVersionLedger,
  describeVersionLedgerFailure,
} from '../scripts/versionLedger.mjs'

describe('parseVersion — strict, because a guess here is a duplicate later', () => {
  it('accepts a bare version and a v-prefixed tag identically', () => {
    expect(parseVersion('2.19.0')).toEqual([2, 19, 0])
    expect(parseVersion('v2.19.0')).toEqual([2, 19, 0])
  })

  it('tolerates the surrounding whitespace git hands back', () => {
    expect(parseVersion('  v2.19.0\r\n')).toEqual([2, 19, 0])
  })

  it('refuses anything that is not exactly three numbers', () => {
    // Each of these is a real shape someone could tag: a pre-release, semver build metadata, a
    // two-part version, a four-part one, and a word that merely starts with v.
    for (const bad of [
      'v2.19.0-rc.1',
      'v2.19.0+201',
      'v2.19',
      'v2.19.0.1',
      'vintage',
      '',
      'v2.x.0',
    ])
      expect(parseVersion(bad), bad).toBeNull()
  })
})

describe('compareVersions — numeric, not lexical', () => {
  // Text comparison gets this backwards ('2.9.0' sorts AFTER '2.10.0'), which is how a downgrade
  // would be waved through as an upgrade. Only the real comparator is asserted — a line asserting
  // that JavaScript's own `<` behaves that way would be a language fact wearing an expect(), and
  // could not fail however broken this module got.
  it('orders 2.9.0 BELOW 2.10.0, which text comparison gets backwards', () => {
    expect(compareVersions([2, 9, 0], [2, 10, 0])).toBeLessThan(0)
  })

  it('compares major, then minor, then patch', () => {
    expect(compareVersions([3, 0, 0], [2, 99, 99])).toBeGreaterThan(0)
    expect(compareVersions([2, 19, 1], [2, 19, 0])).toBeGreaterThan(0)
    expect(compareVersions([2, 19, 0], [2, 19, 0])).toBe(0)
  })
})

describe('checkVersionLedger — has this version already shipped to this site?', () => {
  it('passes a version strictly higher than everything published', () => {
    const r = checkVersionLedger({ version: '2.20.0', tags: ['v2.18.1', 'v2.19.0'] })
    expect(r.ok).toBe(true)
    expect(r.reason).toBe('ok')
    expect(r.highest).toBe('2.19.0')
    expect(r.considered).toBe(2)
  })

  it('REFUSES an exact repeat — the rule the owner called critical', () => {
    const r = checkVersionLedger({ version: '2.19.0', tags: ['v2.19.0'] })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('already-shipped')
  })

  it('REFUSES a downgrade, so a version can never go backwards', () => {
    const r = checkVersionLedger({ version: '2.18.4', tags: ['v2.18.1', 'v2.20.0'] })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('downgrade')
    expect(r.highest).toBe('2.20.0')
  })

  it('finds the highest tag numerically, not alphabetically', () => {
    // Alphabetically v2.9.0 is the largest of these. It is not the newest.
    const r = checkVersionLedger({ version: '2.10.1', tags: ['v2.9.0', 'v2.10.0', 'v2.8.7'] })
    expect(r.highest).toBe('2.10.0')
    expect(r.ok).toBe(true)
  })

  it('★ FAILS CLOSED on an empty ledger — a checkout that fetched no tags must not pass', () => {
    // The single most important case in this file. If this ever returns ok:true, a CI checkout
    // without tags would wave every duplicate through, forever, with nothing looking broken.
    const r = checkVersionLedger({ version: '2.20.0', tags: [] })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('empty-ledger')
  })

  it('treats a ledger of ONLY unparseable tags as empty, not as permission', () => {
    const r = checkVersionLedger({ version: '2.20.0', tags: ['vintage', 'v2.19.0-rc.1'] })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('empty-ledger')
    expect(r.ignored).toEqual(['vintage', 'v2.19.0-rc.1'])
  })

  it('ignores unparseable tags when real ones are present, and says how many', () => {
    const r = checkVersionLedger({ version: '2.20.0', tags: ['v2.19.0', 'vintage'] })
    expect(r.ok).toBe(true)
    expect(r.considered).toBe(1)
    expect(r.ignored).toEqual(['vintage'])
  })

  it("swallows the blank lines git's output always ends with", () => {
    const r = checkVersionLedger({ version: '2.20.0', tags: 'v2.19.0\n'.split('\n') })
    expect(r.ok).toBe(true)
    expect(r.ignored).toEqual([])
  })

  it('rejects a version that is not three numbers, without consulting the ledger', () => {
    const r = checkVersionLedger({ version: '2.19', tags: ['v2.19.0'] })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('bad-version')
  })

  // ── The version is held to a STRICTER test than a tag. These four pin that asymmetry, and the
  // first is the ship-blocker an adversarial review found: `v2.20.0` used to pass here, the
  // workflow glued another `v` on, and the resulting `vv2.20.0` was a tag `--list v*` matches but
  // this module refuses — so the version went unrecorded and could ship a SECOND time.
  it('★ REFUSES a v-prefixed VERSION, even though it accepts a v-prefixed TAG', () => {
    const r = checkVersionLedger({ version: 'v2.20.0', tags: ['v2.19.0'] })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('bad-version')
    // The same string is perfectly valid as a TAG — that is the asymmetry, stated outright.
    expect(parseVersion('v2.20.0')).toEqual([2, 20, 0])
  })

  it('refuses a VERSION carrying whitespace, which would become an illegal git ref', () => {
    for (const bad of ['2.20.0 ', ' 2.20.0', '  \n2.20.0\n  '])
      expect(checkVersionLedger({ version: bad, tags: ['v2.19.0'] }).reason, bad).toBe(
        'bad-version',
      )
  })

  it('hands back a CANONICAL tag on the pass, rebuilt rather than concatenated', () => {
    // This field becomes the git ref, so it is the single most consequential thing the module
    // returns — and nothing asserted it before a mutation test pointed that out.
    expect(checkVersionLedger({ version: '2.20.0', tags: ['v2.19.0'] }).tag).toBe('v2.20.0')
  })

  it('hands back NO tag on every failing path, so a rejected version can never be tagged', () => {
    for (const r of [
      checkVersionLedger({ version: '2.19.0', tags: ['v2.19.0'] }), // already shipped
      checkVersionLedger({ version: '2.18.0', tags: ['v2.19.0'] }), // downgrade
      checkVersionLedger({ version: '2.20.0', tags: [] }), // empty ledger
      checkVersionLedger({ version: 'nope', tags: ['v2.19.0'] }), // bad version
    ])
      expect(r.tag, r.reason).toBeNull()
  })

  it('FAILS CLOSED when tags is not an array at all', () => {
    // null/undefined/a bare string are all "I could not read the ledger", never "it is empty".
    for (const bad of [null, undefined, 'v2.99.0', 42])
      expect(checkVersionLedger({ version: '2.20.0', tags: bad }).ok, String(bad)).toBe(false)
  })

  it('asks git for tags only, and by pattern rather than through a shell', () => {
    // An array argv, so `v*` reaches git as git's pattern and is never glob-expanded by a shell
    // into whatever files happen to start with v.
    expect(GIT_TAG_ARGS).toEqual(['tag', '--list', 'v*'])
  })
})

describe('describeVersionLedgerFailure — the words a red deploy prints at 2am', () => {
  const failureFor = (version, tags) => {
    const r = checkVersionLedger({ version, tags })
    expect(r.ok).toBe(false)
    return describeVersionLedgerFailure(r)
  }

  it('offers BOTH bump choices with the rule for picking one', () => {
    const msg = failureFor('2.20.0', ['v2.20.0'])
    expect(msg).toContain('2.20.0 -> 2.21.0') // MINOR
    expect(msg).toContain('2.20.0 -> 2.20.1') // PATCH
    expect(msg).toContain('a player would notice')
    expect(msg).toContain('package.json')
  })

  it('pre-answers "but I DID bump it", because that is the objection that will occur', () => {
    const msg = failureFor('2.20.0', ['v2.20.0'])
    expect(msg).toContain('IF YOU ARE SURE YOU ALREADY BUMPED IT')
    expect(msg).toContain('A SKIPPED NUMBER COSTS NOTHING')
  })

  it('names BOTH causes of an empty ledger, since they need opposite fixes', () => {
    const msg = failureFor('2.20.0', [])
    expect(msg).toContain('SEED TAG IS MISSING')
    expect(msg).toContain('DID NOT FETCH TAGS')
    expect(msg).toContain('fetch-depth: 0')
  })

  it('says plainly that versions only go up when one tries to go down', () => {
    const msg = failureFor('2.18.4', ['v2.20.0'])
    expect(msg).toContain('Versions only ever go up')
    expect(msg).toContain('v2.20.0')
  })

  it('explains a malformed version without mentioning tags it never looked at', () => {
    const msg = failureFor('2.19', ['v2.19.0'])
    expect(msg).toContain('MAJOR.MINOR.PATCH')
    expect(msg).not.toContain('already been deployed')
  })

  it('tells the reader not to move the tags by hand', () => {
    expect(failureFor('2.20.0', ['v2.20.0'])).toContain('the deploy owns them')
  })

  it('★ every suggested bump actually CLEARS the ledger, proved by feeding it back in', () => {
    // The suggestion must be computed from the HIGHEST version already shipped, never from the one
    // that just failed. Computing it from the failing version passes every assertion about the
    // message's WORDING while handing the reader two numbers that fail again — which is exactly
    // what a mutation test showed the earlier cases could not catch. So the suggestions are not
    // read, they are EXECUTED.
    for (const [version, tags] of [
      ['2.20.0', ['v2.20.0']], // exact repeat
      ['2.9.9', ['v2.9.9']], // exact repeat, nonzero patch
      ['2.18.4', ['v2.20.0']], // downgrade — the case that breaks a naive implementation
      ['0.0.1', ['v2.19.0']], // downgrade by a mile
    ]) {
      const msg = failureFor(version, tags)
      const suggested = [...msg.matchAll(/-> (\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1])
      expect(suggested.length, msg).toBe(2)
      for (const s of suggested)
        expect(checkVersionLedger({ version: s, tags }).ok, `${version} -> ${s}`).toBe(true)
    }
  })

  it('zeroes the patch on a MINOR suggestion (2.9.9 -> 2.10.0, never 2.10.9)', () => {
    const msg = failureFor('2.9.9', ['v2.9.9'])
    expect(msg).toContain('2.9.9 -> 2.10.0')
    expect(msg).toContain('2.9.9 -> 2.9.10')
  })

  it('distinguishes a spent number from an unpublished one, since they need opposite actions', () => {
    // A build can pass, tag itself, and then fail to PUBLISH. Telling that reader to bump would
    // cost a pointless version and a changelog edit when the right move is to re-run only the
    // publish step.
    const msg = failureFor('2.20.0', ['v2.20.0'])
    expect(msg).toContain('Re-run failed')
    expect(msg).toContain('Do NOT press "Re-run all jobs"')
  })

  it('REFUSES to describe a PASSING result instead of inventing a failure for it', () => {
    const passing = checkVersionLedger({ version: '2.20.0', tags: ['v2.19.0'] })
    expect(passing.ok).toBe(true)
    expect(() => describeVersionLedgerFailure(passing)).toThrow(/PASSING/)
  })
})
