// buildNumber.mjs — THE SILENT BUILD NUMBER (round 17). Derives a monotonic integer for the build
// from git and refuses, loudly, to derive a wrong one. Wired into vite.config.js's `define` as
// __BUILD_NUMBER__ (read by src/appVersion.ts); the reasoning for the whole feature lives there.
//
// WHY THE COMMIT COUNT AND NOT A CI RUN NUMBER. This app deploys the SAME commit to TWO repos (live
// and staging), and the number's entire job is telling one deployed site apart from another. GitHub's
// `github.run_number` is per-repository, so the identical commit would carry a different number on
// each site — the number would then report a difference where there is none, which is worse than
// having no number at all. `git rev-list --count HEAD` is a property of the COMMIT: same commit,
// same count, both repos, forever, and it climbs by one per commit with nothing to maintain.
//
// ⚠ THE SHALLOW-CLONE TRAP, AND WHY THIS FILE EXISTS AT ALL. `actions/checkout` defaults to
// `fetch-depth: 1` — a clone with exactly ONE commit in it. `git rev-list --count HEAD` does not
// fail there; it cheerfully returns `1`. So the default CI configuration would have shipped a build
// number that was 1 on every deploy forever, and nothing would have looked broken. .github/
// workflows/deploy.yml therefore sets `fetch-depth: 0`, and this file refuses to return a number
// from a shallow repository so that the day someone drops that line, the BUILD fails instead of the
// number silently flattening.
//
// PURE BY CONSTRUCTION: `git` is injected as a function, so every failure mode below is unit-tested
// (tests/buildNumber.test.js) without a git process, a fixture repo, or a shallow clone to arrange.
// The precacheIntegrity / changelogStamp precedent — the checkable part is a plain module, and the
// plugin wiring is the four lines that cannot be subtly wrong.

// The two git invocations, exported so the test asserts the exact argv rather than paraphrasing it.
// `HEAD` and not a branch name: the deploy builds whatever was checked out.
export const GIT_SHALLOW_ARGS = ['rev-parse', '--is-shallow-repository']
export const GIT_COUNT_ARGS = ['rev-list', '--count', 'HEAD']

const FAIL = 'build-number'

// Every throw carries the same tail, because in every case the fix is about the CHECKOUT rather than
// about the code: whoever hits this is looking at a red build with no idea which knob is theirs.
const CONTEXT =
  'The build number is git rev-list --count HEAD (see scripts/buildNumber.mjs). It is derived only ' +
  'for a real `vite build`; dev and Vitest use a frozen sentinel and never reach this code.'

/**
 * The build number for the checkout `git` runs in.
 *
 * @param {(args: string[]) => string} git runs git with the given argv and returns its stdout as
 *   text. Throwing (git missing, not a repository, non-zero exit) is a valid outcome and is
 *   re-thrown with context — never swallowed, never defaulted.
 * @returns {number} a positive integer.
 */
export const readBuildNumber = (git) => {
  // ── 1. Is this a full checkout? A shallow one answers every question below plausibly and wrongly.
  let shallow
  try {
    shallow = String(git(GIT_SHALLOW_ARGS)).trim()
  } catch (err) {
    throw new Error(
      `${FAIL}: could not run git (${GIT_SHALLOW_ARGS.join(' ')}) — ${err.message}\n` +
        `A build cannot invent this number, so it fails here rather than emitting 0. ${CONTEXT}`,
    )
  }
  if (shallow === 'true')
    throw new Error(
      `${FAIL}: this is a SHALLOW git checkout, where the commit count is meaningless — it would be ` +
        `1 (or a small number) on every build forever, and nothing would look broken.\n` +
        `Fix: give the checkout the full history. In .github/workflows/deploy.yml that is\n` +
        `    - uses: actions/checkout@v4\n` +
        `      with:\n` +
        `        fetch-depth: 0\n` +
        `(the default is fetch-depth: 1). Locally: git fetch --unshallow. ${CONTEXT}`,
    )
  if (shallow !== 'false')
    throw new Error(
      `${FAIL}: git ${GIT_SHALLOW_ARGS.join(' ')} answered ${JSON.stringify(shallow)}, which is ` +
        `neither "true" nor "false", so whether this checkout has full history is unknown. ${CONTEXT}`,
    )

  // ── 2. The count itself.
  let raw
  try {
    raw = String(git(GIT_COUNT_ARGS)).trim()
  } catch (err) {
    throw new Error(
      `${FAIL}: could not run git (${GIT_COUNT_ARGS.join(' ')}) — ${err.message}\n` +
        `A build cannot invent this number, so it fails here rather than emitting 0. ${CONTEXT}`,
    )
  }
  // Digits only, and at least one commit. `Number('1e3')` is 1000 and `Number(' 12 ')` is 12, so the
  // shape is checked as TEXT before it is coerced — a lenient parse here is how a garbage stdout
  // becomes a plausible number.
  if (!/^\d+$/.test(raw))
    throw new Error(
      `${FAIL}: git ${GIT_COUNT_ARGS.join(' ')} printed ${JSON.stringify(raw)}, which is not a ` +
        `count. ${CONTEXT}`,
    )
  const count = Number(raw)
  if (count < 1)
    throw new Error(
      `${FAIL}: the commit count is ${count}, but a build always has at least one commit behind it, ` +
        `so this checkout is not what it claims to be. ${CONTEXT}`,
    )
  return count
}
