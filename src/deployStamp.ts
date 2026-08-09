// deployStamp.ts — WHEN THIS BUILD WAS DEPLOYED. One constant, and it has its own module because
// two things far apart in the app both read it:
//   • the ⚙ panel's "Last Updated" line (components/SettingsPanel), and
//   • App's build-change detection (src/main.tsx), which compares it against the last-run stamp in
//     localStorage (lib/buildStamp) to light the update breadcrumb and run the Q2 flash.
// It used to sit at module scope in src/main.tsx, which is fine while the panel's markup is also in
// main.tsx and impossible once it is not: main.tsx imports the panel, so the panel importing back
// would be a cycle. A leaf module with no imports of its own is the seam that cannot become one.
//
// ★ THIS IS THE LINE THE PER-DEPLOY RULE MEANS. Every deploy bumps it to the deploy time (rule 2 in
// PROJECT.md). Stored in UTC; the panel renders it in the viewer's local time, through the same
// numeric-coercing recipe the changelog dates use, so it follows the Date Format setting.
//
// Deliberately NOT re-exported from main.tsx: the observable contract is the localStorage stamp the
// detection writes (tests/buildStamp.dom), never this value, and an export from main.tsx would
// invite a test to assert the constant instead of the behaviour.
export const DEPLOY_TS = new Date('2026-08-09T20:45:00Z')
