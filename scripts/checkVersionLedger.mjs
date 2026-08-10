// scripts/checkVersionLedger.mjs — the version bump guard, runnable on its own. The four lines of
// wiring around scripts/versionLedger.mjs, which holds the reasoning and every branch worth testing.
//
// WHY THIS IS A WORKFLOW STEP AND HAS NO vite PLUGIN HALF — a deliberate departure from the
// changelog guard next door, argued here rather than discovered later. checkChangelogDate.mjs is
// explicit that it "IS NOT THE AUTHORITY, AND MUST NOT BECOME ONE", because a check living only in
// the workflow cannot stop a local `npm run build` from producing a bad dist. That reasoning does
// not transfer, for two independent reasons:
//   1. A LOCAL BUILD IS NOT A DEPLOY. This rule is about what has been PUBLISHED to a site. A dist
//      sitting in a folder has published nothing, so there is nothing for it to collide with, and
//      failing a developer's build over it would be a false alarm every time.
//   2. THE LAPTOP'S LEDGER IS THE WRONG LEDGER. The working clone has BOTH remotes, so its tag list
//      is production's and staging's mixed together with no way to tell them apart — a local half
//      would be wrong more often than right. In CI the clone has exactly one remote, which is
//      precisely the site being deployed to.
// So the workflow IS the authority here, and there is no second copy to drift from it.
//
// ⚠ IT RUNS BEFORE `npm ci`, WHICH IS WHY IT IMPORTS NOTHING BUT NODE BUILT-INS. The whole point is
// to be the cheapest failure in the gate: a version that cannot ship should cost about two seconds,
// not a dependency install and a three-minute test run. That constraint is load-bearing — do not
// give this file a dependency, and do not move it below `npm ci` for tidiness.
//
// Run: `node scripts/checkVersionLedger.mjs`
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { GIT_TAG_ARGS, checkVersionLedger, describeVersionLedgerFailure } from './versionLedger.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Wrapped for the same reason the git call below is: every other failure in this file is written
// for someone reading a red deploy who did not write any of it, and a raw Node stack trace out of
// node:fs would be the one exception.
let version
try {
  ;({ version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')))
} catch (err) {
  console.error(
    `app-version: could not read package.json — ${err.message}\n` +
      `  That file holds the one copy of the app's version (see src/appVersion.ts), so the deploy\n` +
      `  cannot tell what it is about to publish. Nothing has been built or published.`,
  )
  process.exit(1)
}

// A git that cannot answer is not an empty ledger — it is an unknown one, and the difference decides
// whether a duplicate ships. So this rethrows rather than degrading to `[]`, which would land in the
// pass-by-default hole the empty-ledger branch exists to close.
let tags
try {
  tags = execFileSync('git', GIT_TAG_ARGS, { cwd: ROOT, encoding: 'utf8' }).split('\n')
} catch (err) {
  console.error(
    `app-version: could not run git (${GIT_TAG_ARGS.join(' ')}) — ${err.message}\n` +
      `  The version tags ARE the record of what has already shipped to this site, so a deploy that\n` +
      `  cannot read them cannot know whether it is about to repeat a version. It stops here rather\n` +
      `  than guessing. See scripts/versionLedger.mjs.`,
  )
  process.exit(1)
}

const result = checkVersionLedger({ version, tags })
if (!result.ok) {
  console.error(describeVersionLedgerFailure(result))
  process.exit(1)
}
// Hand the workflow the WHOLE REF — `v2.21.0`, not `2.21.0` for it to prefix. Two reasons, and the
// second was found by an adversarial review rather than by design:
//   1. The tagging step can then only ever write the exact string this guard validated. Re-reading
//      package.json there would be a second parse that could disagree with this one — the way a
//      guard like this gets defeated by its own plumbing.
//   2. ⚠ Handing over a bare version and letting YAML glue a `v` onto it is the bug itself. When the
//      guard still accepted a `v`-prefixed version, that concatenation produced `vv2.21.0` — a tag
//      `git tag --list v*` matches but parseVersion refuses, so the version became invisible and
//      could ship AGAIN. The version regex is now strict (versionLedger.mjs), and this removes the
//      last place where a ref is assembled outside the validated path. Belt and braces.
// `result.tag` is rebuilt from the parsed numbers and is null on every failing path, and this runs
// only after the exit above — so a rejected version can never reach the tagger. Nothing outside CI
// sets GITHUB_OUTPUT, so this is inert locally.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${result.tag}\n`)

console.log(
  `✅ Version ledger OK: ${result.version} is new to this site ` +
    `(highest already published: v${result.highest}; ${result.considered} version tag(s) checked).`,
)
