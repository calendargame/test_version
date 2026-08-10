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
//   • ★ CLAUDE ASSIGNS THE VERSION EACH DEPLOY, NOT THE OWNER. It is derived from what the deploy
//     contains, which is a judgement about the code, so it is the builder's call and part of the
//     deploy ritual — not a number the owner has to remember to hand over.
//
// WHERE 2.19.0 COMES FROM. The first version this file ever shipped is 2.19.0, and it is not a
// guess: all 26 deploys since the 2.0.0 cutover were classified against the changelog, the commit
// log and PROJECT.md's completed-work log, which put the build live before this one at 2.18.1. This
// deploy shows a version number in the changelog panel, which a player can see, so it is a MINOR.
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
