// appVersion.ts — WHICH VERSION OF THE APP THIS IS. Two build-time constants, and a leaf module with
// no imports of its own for the same reason deployStamp.ts is one: the ⚙ panel reads it and main.tsx
// must stay free to import the panel, so anything on this side of that seam cannot be allowed to
// import back. Read deployStamp.ts alongside this — the two are the same mechanism, injected by the
// same `define` block in vite.config.js, and neither is ever typed by hand at deploy time.
//
// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE VERSIONING SCHEME (owner's decision, 2026-08-10). The number lives in package.json's `version`
// field — the standard home, so every tool that already looks for a version finds the real one — and
// vite.config.js reads it from there and injects it as __APP_VERSION__. There is exactly one copy.
//
//   • MAJOR — the app became a fundamentally different thing. RESERVED; it is not a size-of-change
//     dial. `1.x` was the original single-file app (Oct 2025 – May 2026). `2.0.0` is the Vite/React
//     rewrite that went live 2026-06-05. `3.0.0` is reserved for the App Store release.
//   • MINOR — this deploy changes something a PLAYER WOULD NOTICE.
//   • PATCH — this deploy only fixes things, or changes nothing visible at all.
//   • ★ EVERY DEPLOY BUMPS EXACTLY ONE NUMBER — NEVER ZERO. No two deploys may ever share a version.
//     That is the whole point of having one: the version's job is telling two sites apart (live vs
//     staging, or the build in your hands vs the build you last had), and two different builds
//     wearing the same number destroys the only question it can answer. A deploy that ships nothing
//     visible is still a deploy and still takes a PATCH.
//   • WHEN A DEPLOY CORRECTS SOMETHING SHIPPED EARLIER THE SAME DAY, the original is the MINOR and
//     the correction is a PATCH — the correction did not add a thing a player would notice, it
//     finished the thing that was already announced. (This mirrors the changelog charter's same-day
//     rule, where the second deploy restates the day's net effect instead of logging itself twice.)
//   • ✅ AND IT IS ENFORCED, NOT TRUSTED, SINCE 2026-08-10. The deploy REFUSES to publish unless
//     this number is strictly greater than every version that site has already shipped — the
//     record being the `v*` tags each repo carries, written by the deploy itself just before it
//     publishes. scripts/versionLedger.mjs holds the whole design and the three candidate guards
//     that were killed to get there. What that means for whoever changes the number: raising it is
//     now a REQUIRED step of a deploy rather than a remembered one, a skipped number costs nothing,
//     and nobody should ever create or delete a `v*` tag by hand.
//   • ★ CLAUDE ASSIGNS THE VERSION EACH DEPLOY, NOT THE OWNER. It is derived from what the deploy
//     contains, which is a judgement about the code, so it is the builder's call and part of the
//     deploy ritual — not a number the owner has to remember to hand over.
//
// WHERE THE NUMBERS COME FROM, AND THE ONE THAT WAS WRONG. The first version this file ever shipped
// is 2.19.0 (commit 50ba020), derived by classifying every deploy since the 2.0.0 cutover against
// the changelog, the commit log and PROJECT.md's completed-work log. ⚠ THAT PASS COUNTED 26 DEPLOYS;
// THE LIVE REPO'S OWN ACTIONS HISTORY SAYS 28 — 30 deploy-workflow runs, every one of them after the
// cutover, 28 successful across 28 DISTINCT commits, so neither extra is a re-run or a cancelled
// publish. A log-based count reads short because the WRITTEN RECORD HIDES DEPLOYS: PROJECT.md's
// cutover entry names no commit and the cutover actually published twice, and its round-8 entry says
// round 8 went to staging, which stopped being true the next morning.
//
// THE TWO MISSING DEPLOYS, CLASSIFIED FROM THEIR COMMITS RATHER THAN ASSUMED:
//   • d03b30d (2026-06-05, five minutes after the cutover build) — a seven-line workflow change
//     emitting the CNAME. Nothing a player can see, and a same-day completion of what had just
//     shipped, which this scheme calls a PATCH.
//   • d2e2e5d (2026-07-26, round 8) — the Lookup fit-to-screen rebuild, theme PILLS replacing the
//     dropdowns, the tap-to-type geometry: 36 files of plainly player-visible change. A MINOR.
// The extra MINOR lifts the minor count by one; the extra PATCH sits on cutover day and is wiped by
// every later minor. So the build before 50ba020 was 2.19.1, not 2.18.1 — and 50ba020 itself SHOULD
// have shipped as 2.20.0. It shipped as 2.19.0 and is live, and a version is never reused, so that
// cannot be repaired retroactively: it is an error in the RECORD, not in the app.
//
// ★ WHICH IS WHY 2.20.0 IS DELIBERATELY SKIPPED. The deploy after 50ba020 is 2.21.0, so the count
// from here forward matches the real deploy history instead of inheriting the miscount forever
// (the owner's instruction, 2026-08-10: make the current number accurate given the miscount). It
// costs nothing — a skipped number is free, and the guard only ever demands STRICTLY GREATER.
// ⚠ THE SEED TAG ON 50ba020 STAYS v2.19.0. Tags record what ACTUALLY shipped, never what should
// have; the app running on the live site right now says 2.19.0, and the ledger must agree with it.
//
// WHERE IT SHOWS: the changelog popup's heading row and NOWHERE ELSE (components/SettingsPanel,
// `changelogJsx`). Not on the ⚙ panel's "Last Updated" row — the owner rejected that: the row has no
// space for it and he will not add another row. The full reasoning for the styling is at the render
// site, along with the accessible-name constraint that shapes the markup.
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// DELIBERATELY NO FALLBACK, the deployStamp.ts rule: `__APP_VERSION__` with no `typeof` guard and no
// default means a build that somehow lost the define fails LOUDLY at module load rather than
// shipping a plausible wrong version. vite.config.js also throws at config time if package.json's
// version is not three dotted numbers, so `vundefined` cannot reach a screen. The declarations live
// in src/vite-env.d.ts.
export const APP_VERSION = __APP_VERSION__

// ── THE SILENT BUILD NUMBER (owner's ask, 2026-08-10) ────────────────────────────────────────────
// A count that RENDERS NOWHERE TODAY. It exists so that the day the owner decides he wants a build
// number on screen, it can start from its true value instead of from 1 — a counter that only begins
// when someone displays it has thrown away every build before that.
//
// IT IS `git rev-list --count HEAD`, a property of the COMMIT rather than of the build machine. The
// same commit deployed to the live repo and to the staging repo therefore carries the SAME number,
// which is exactly what the live-vs-staging comparison needs; a CI run number would have differed
// per repo and quietly answered that question wrong. scripts/buildNumber.mjs derives it, refuses a
// shallow checkout (where the count is meaninglessly small but perfectly plausible), and fails the
// build rather than ever emitting 0 — see the long note there.
//
// ⚠ 0 MEANS "NOT A BUILD", AND IT IS THE ONLY THING 0 CAN MEAN. Dev and Vitest get the frozen
// sentinel 0 from vite.config.js, the deployStamp epoch-sentinel precedent: a value that moved with
// every commit would make the suite's assertions about it either vacuous or brittle, and a dev
// server is not a deploy. The real path cannot produce 0, because it throws instead.
//
// ⚠ TREE-SHAKEN OUT OF TODAY'S BUNDLE, BY DESIGN AND NOT BY ACCIDENT. Nothing imports this export
// yet, so rollup drops it from the shipped JS — the number is reachable in the SOURCE, waiting for a
// consumer, and costs the download nothing while it has none. TO SURFACE IT, a future round needs
// one line and no new machinery: import BUILD_NUMBER here and render it beside APP_VERSION in
// SettingsPanel's changelog heading row (`v2.19.0 · build 200`), or — if it should be inspectable
// without opening the app — inject it as a <meta> in vite.config.js the way buildIdentity injects
// the build id. Nothing about the derivation changes either way.
export const BUILD_NUMBER = __BUILD_NUMBER__
