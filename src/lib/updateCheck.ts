// lib/updateCheck.ts — "Check for updates" ACTUALLY CHECKS (Q7, round 11).
//
// Before this, the button was a lie by construction: it showed the Updating screen, waited, and ran
// forceReloadLatest() unconditionally — claiming to update even when nothing had changed, and
// destroying the offline copy every single time, including on the presses where there was nothing
// to get. This module is the detector half; main.tsx owns the UI state and the applier.
//
// ══ WHY THE DETECTOR IS A BUILD-TIME IDENTITY FILE, and not one of the obvious alternatives ══
// Every fact below was MEASURED against a real Workbox service worker before this was written.
//
//  • fetch(url, {cache:'reload'}) and {cache:'no-store'} DO NOT WORK. Those are HTTP-cache
//    directives and have no authority over a service worker: the SW's fetch handler intercepts the
//    request and hands back the OLD precached build. Proven by killing the server and watching the
//    fetch still return 200. What defeats a precache route is a URL the route does not match — a
//    novel QUERY PARAM. It must not match /^utm_/ or /^fbclid$/, which are Workbox's shipped
//    ignoreURLParametersMatching defaults and are stripped BEFORE the route is matched (CHECK_PARAM
//    below, pinned by a test). The URL is built from import.meta.env.BASE_URL because staging is a
//    SUBPATH (/test_version/) — a root-absolute URL would read the apex build and compare two
//    different sites.
//  • DEPLOY_TS is NOT the thing to compare, and round 16 did not change that. It is not in
//    index.html — it lives inside the ~476 KB bundle, so reading the deployed one would mean
//    downloading the whole build to ask a question about it. (Q1 did remove the OTHER objection
//    that used to stand here: it is no longer a hand-edited literal that a forgotten bump could
//    make lie. It is now injected from the build clock, and the changelog date is gated against it.
//    Still the wrong file to fetch.)
//  • index.html's hashed bundle name is not enough either: icons ship under STABLE filenames, so an
//    icon-only deploy changes the output without changing any name in the HTML. The owner's
//    requirement is explicitly that a deploy changing OUTPUT but not SOURCE is detected.
//  • registration.update() is the APPLIER, not the detector. Two false negatives were reproduced:
//    an edge-stale sw.js reports nothing while a new page + bundle are live, and a failed install
//    RESOLVES with updatefound true yet leaves installing and waiting both null. A worker already
//    parked in `waiting` also makes a fresh update() report nothing new — which is why the detector
//    checks reg.waiting FIRST and treats it as positive evidence on its own.
//
// So the detector compares two build IDENTITIES: the id of the build this page is RUNNING, and the
// id of the build the server is SERVING right now.
//   • The deployed id is dist/build-id.txt — written by vite.config.js's buildIdentity plugin,
//     which hashes every file in the finished dist (icons included). It is not precached (Workbox's
//     globPatterns cover js/wasm/css/html), so it is network-only by construction; offline it
//     simply fails, which is the "No connection" answer and not a lie in either direction.
//   • The running id is a <meta name="cg-build"> the same plugin injects into dist/index.html —
//     the HTML this document was actually parsed from, so it names this build with no
//     circularity and no dependence on a service worker existing. index.html is precached with a
//     REVISION (not a content-hashed name), and the plugin rewrites that revision to match the
//     injected bytes, so a client whose id is stale is a client Workbox knows to re-fetch. That is
//     what keeps the detector and the applier in agreement: any id change is also an index.html
//     change, so there is always a real new service worker for the applier to hand off to.
//
// Dev and tests have neither file: the meta is absent (readOwnBuildId → null) and the fetch 404s.
// checkForUpdate is written so that BOTH of those answer honestly rather than fabricating an
// update — see the null-ownId branch.

// The deployed build's identity file, relative to the app's base. Plain text, one line, the hash.
export const BUILD_ID_FILE = 'build-id.txt'
// The <meta name> carrying the running build's identity, injected into index.html at build time.
export const BUILD_ID_META = 'cg-build'
// The cache-busting query parameter. Deliberately NOT utm_* and NOT fbclid — Workbox strips those
// before matching a precache route, which would hand us the cached copy we are trying to get past.
export const CHECK_PARAM = 'cg'

// How long a result label stays before the button returns to rest (owner: exactly 3s).
export const UPDATE_RESULT_MS = 3000
// The give-up CEILING for a hung network. This is a FAILURE bound, not a display duration: the
// "Checking…" label lasts exactly as long as the check, and a check that has not answered in this
// long is treated as no connection. Generous, because a slow phone network answering at 6s is a
// real answer and cutting it off would report a fault that is not there.
export const UPDATE_CHECK_CEILING_MS = 8000

// The button's four states. The LABEL IS THE STATE (owner's UI call): one button, no second line,
// no toast. Every label is at most as wide as the resting one ("Check for updates", 16 chars), so a
// hidden strut at that width keeps the Changelog link beside it from ever shifting — pinned by a
// test, since a longer label added later would silently break that promise. No trailing periods:
// these are labels, not sentences.
export type UpdateCheckState = 'idle' | 'checking' | 'current' | 'offline'
export const UPDATE_CHECK_LABEL: Record<UpdateCheckState, string> = {
  idle: 'Check for updates',
  checking: 'Checking…',
  current: 'Up to date',
  offline: 'No connection',
}

// What a check concluded. 'update' means a different build is deployed (or one is already
// downloaded and waiting); 'current' means this build is the deployed one; 'offline' means the
// question could not be answered at all — never a claim in either direction.
export type UpdateVerdict = 'update' | 'current' | 'offline'

// A build id is one opaque token. Anything else is not an answer to the question we asked: a
// navigation-fallback index.html, a JSON error body, a captive-portal splash, a proxy notice. Those
// arrive with `ok: true` and would compare unequal to our id forever — a PERMANENT false "update
// available", i.e. the button applying an update on every press and never resolving. That is the
// worst failure this feature can have, so both sides of the comparison are validated and anything
// unrecognisable is treated as no answer at all.
// Deliberately a SHAPE, not the hash format: the build writes sha256 hex today, and pinning 64 hex
// digits here would mean a future change of hash makes every already-deployed client reject the new
// id and lose the button until it updated by some other route.
const BUILD_ID_TOKEN = /^[A-Za-z0-9._-]{8,128}$/
export const isBuildId = (value: string): boolean => BUILD_ID_TOKEN.test(value)

// The running build's id, read from the document this page was parsed from. Null in dev/tests
// (no build step ran, so no meta was injected) — a state checkForUpdate handles explicitly.
export function readOwnBuildId(doc: Document): string | null {
  const content = doc
    .querySelector(`meta[name="${BUILD_ID_META}"]`)
    ?.getAttribute('content')
    ?.trim()
  return content && isBuildId(content) ? content : null
}

// A fresh cache-buster per check. Two presses inside the same millisecond must not reuse a URL, so
// the clock alone is not enough.
export function makeCheckNonce(now: number = Date.now(), rand: number = Math.random()): string {
  return `${now.toString(36)}${Math.floor(rand * 1e6).toString(36)}`
}

// The identity file's URL under the app's base. Vite's BASE_URL always ends in '/', but a caller
// that trims it must not silently produce 'test_versionbuild-id.txt'.
export function buildIdUrl(base: string, nonce: string): string {
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}${BUILD_ID_FILE}?${CHECK_PARAM}=${nonce}`
}

// Ask whether a different build is deployed. Pure apart from the fetch + timer it is handed, so
// every branch below is driven directly by tests.
//
// `hasWaitingWorker` is checked FIRST and answers without touching the network: a worker parked in
// `waiting` IS a downloaded update by definition, and it is the case a fresh update() call reports
// nothing for. A null `ownId` (dev/tests, or a build somehow missing its meta) means we cannot
// compare — and a comparison against null would be unequal to every real id, i.e. a permanent
// false "update available". So it answers 'current': never claim an update we cannot evidence.
export async function checkForUpdate({
  ownId,
  url,
  hasWaitingWorker,
  fetchImpl,
  timeoutMs = UPDATE_CHECK_CEILING_MS,
  signal,
}: {
  ownId: string | null
  url: string
  hasWaitingWorker: boolean
  fetchImpl: typeof fetch
  timeoutMs?: number
  // The CALLER's cancel (the settings panel closing, the app unmounting). Distinct from the give-up
  // ceiling below, which is this function's own: one means "stop asking", the other "it never
  // answered". Both land in the same catch, and the caller is expected to ignore the verdict it
  // cancelled rather than read 'offline' out of it.
  signal?: AbortSignal
}): Promise<UpdateVerdict> {
  if (hasWaitingWorker) return 'update'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  try {
    const res = await fetchImpl(url, { signal: controller.signal })
    if (!res.ok) return 'offline'
    const deployedId = (await res.text()).trim()
    // A body that is not a build id is not evidence of anything — see BUILD_ID_TOKEN. It must not
    // be allowed to say "Up to date", and it must not be allowed to say "update" either.
    if (!isBuildId(deployedId)) return 'offline'
    if (ownId === null) return 'current'
    return deployedId === ownId ? 'current' : 'update'
  } catch {
    // Network failure, abort, or a body that could not be read — the question went unanswered.
    return 'offline'
  } finally {
    clearTimeout(timer)
  }
}
