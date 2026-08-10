// tests/buildNumber.test.js — the silent build number's derivation (2026-08-10).
//
// THE CLASS THIS PINS: a number that is WRONG BUT PLAUSIBLE. Every other failure mode here is loud
// — git missing, not a repository, a non-zero exit — and would stop a build on its own. The one that
// would have shipped is the shallow clone: `actions/checkout` defaults to fetch-depth 1, and in a
// one-commit clone `git rev-list --count HEAD` does not fail, it returns 1. Every deploy forever
// would have carried build 1, the number would have been useless for the one thing it exists for
// (telling two deployed sites apart), and nothing on screen or in the log would have looked wrong.
// deploy.yml now asks for the full history AND scripts/buildNumber.mjs refuses a shallow checkout,
// so the day someone trims that workflow line the build fails with instructions instead.
//
// WHY THESE CASES ARE CHEAP: readBuildNumber takes `git` as a FUNCTION, so a shallow clone, a broken
// git, and a garbage stdout are all one-line fakes — no fixture repo, no subprocess, no temp dir.
// The wiring it feeds (one `define` line in vite.config.js) is the part that cannot be subtly wrong.
import { describe, it, expect } from 'vitest'
import { readBuildNumber, GIT_COUNT_ARGS, GIT_SHALLOW_ARGS } from '../scripts/buildNumber.mjs'

// A fake git: answers the shallow probe with `shallow`, the count probe with `count`, and records
// every argv it was handed. Either answer may be an Error to throw instead.
const fakeGit = (shallow, count) => {
  const calls = []
  const git = (args) => {
    calls.push(args)
    const answer = String(args) === String(GIT_SHALLOW_ARGS) ? shallow : count
    if (answer instanceof Error) throw answer
    return answer
  }
  git.calls = calls
  return git
}

describe('readBuildNumber — the commit count, or a loud failure', () => {
  it('returns the count as a number from a full checkout', () => {
    expect(readBuildNumber(fakeGit('false\n', '200\n'))).toBe(200)
  })

  it('asks git exactly the two questions, shallow-probe FIRST', () => {
    // Order is the point: the count is only meaningful once the checkout is known to be complete,
    // so a shallow repo must never get as far as producing a number to be tempted by.
    const git = fakeGit('false\n', '200\n')
    readBuildNumber(git)
    expect(git.calls).toEqual([GIT_SHALLOW_ARGS, GIT_COUNT_ARGS])
    expect(GIT_SHALLOW_ARGS).toEqual(['rev-parse', '--is-shallow-repository'])
    expect(GIT_COUNT_ARGS).toEqual(['rev-list', '--count', 'HEAD'])
  })

  it('★ REFUSES A SHALLOW CHECKOUT — the failure that would otherwise be invisible', () => {
    const git = fakeGit('true\n', '1\n')
    // Not merely "throws": the message has to carry the fix, because whoever meets this is looking
    // at a red CI run and the cause is in the workflow file rather than in any code they changed.
    expect(() => readBuildNumber(git)).toThrow(/SHALLOW/)
    expect(() => readBuildNumber(git)).toThrow(/fetch-depth: 0/)
    // And it stops BEFORE counting — the plausible `1` is never even read.
    expect(git.calls).not.toContainEqual(GIT_COUNT_ARGS)
  })

  it('refuses an unrecognised answer to the shallow probe rather than assuming full history', () => {
    expect(() => readBuildNumber(fakeGit('', '200\n'))).toThrow(/neither "true" nor "false"/)
    expect(() => readBuildNumber(fakeGit('maybe', '200\n'))).toThrow(/is unknown/)
  })

  it('re-throws a broken git with context, at either probe — never a default', () => {
    const missing = new Error('spawn git ENOENT')
    expect(() => readBuildNumber(fakeGit(missing, '200\n'))).toThrow(/could not run git/)
    expect(() => readBuildNumber(fakeGit(missing, '200\n'))).toThrow(/ENOENT/)
    expect(() => readBuildNumber(fakeGit('false\n', missing))).toThrow(/rev-list --count HEAD/)
    // The owner's instruction, made structural: fail loudly rather than silently emitting 0.
    expect(() => readBuildNumber(fakeGit(missing, missing))).toThrow(/rather than emitting 0/)
  })

  it('refuses a count that is not digits — a lenient parse is how garbage becomes a number', () => {
    // Number() would happily turn every one of these into something: 1000, 12, 0, NaN.
    expect(() => readBuildNumber(fakeGit('false\n', '1e3'))).toThrow(/is not a count/)
    expect(() => readBuildNumber(fakeGit('false\n', '1 2'))).toThrow(/is not a count/)
    expect(() => readBuildNumber(fakeGit('false\n', '-4'))).toThrow(/is not a count/)
    expect(() => readBuildNumber(fakeGit('false\n', 'fatal: not a git repository'))).toThrow(
      /is not a count/,
    )
  })

  it('refuses zero — a build always has at least one commit behind it', () => {
    expect(() => readBuildNumber(fakeGit('false\n', '0\n'))).toThrow(/at least one commit/)
  })

  it('tolerates the whitespace git actually emits, and only that', () => {
    expect(readBuildNumber(fakeGit('false', '7'))).toBe(7)
    expect(readBuildNumber(fakeGit('  false  \n', '  7  \n'))).toBe(7)
  })
})
