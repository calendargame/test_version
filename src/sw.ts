/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'
import { captureError } from './observability/sentry'

// sw.ts — PWA service-worker registration (Q3 auto-update-on-open).
//
// registerType is 'prompt' (vite.config), so a newly-deployed SW INSTALLS but WAITS — it does NOT silently
// activate + reload in the middle of a session. Instead:
//   • On LAUNCH, App's boot effect checks navigator.serviceWorker.getRegistration().waiting (instant, no
//     network — and IN PARALLEL with this module's dynamic import, since the check doesn't need it); if a
//     waiting worker is present (a new version downloaded on a previous visit), App shows the "Updating…"
//     screen, messages the waiting worker DIRECTLY with {type:'SKIP_WAITING'} (a message handler the
//     generateSW worker ships natively), and reloads exactly once on controllerchange. So a fresh deploy
//     lands cleanly + visibly on the NEXT open, not as a silent flash — with no dependence on this module
//     having loaded first (messaging through registerSW's returned updateSW() raced this registration and
//     could silently no-op; that's why nothing here is exported).
//   • onRegisteredSW kicks off a background registration.update() (after registration), so any newer SW
//     downloads + becomes the waiting worker, ready to apply on the next launch.
//   • NO visibility/focus re-check — cold-open only (the owner's call), so it never reloads on a mere
//     app resume.
// The Settings → "Check for updates" button CHECKS first and applies a real update through this same
// registration (Q7, round 11); forceReloadLatest is its fallback when there is nothing to hand off to.
//
// This whole path is service-worker behaviour that only runs in a real browser with a built SW
// (devOptions.enabled is false, and jsdom has no SW), so it's verified ON-DEVICE on staging, not dev/tests.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    // The background prefetch. Its rejection stays SILENT on purpose — unlike a failed
    // registration, a failed update() is the ordinary offline case (no network, nothing newer to
    // find) and the app is fully healthy without it: the worker it already has keeps serving, and
    // the next launch tries again. Reporting it would drown the signal below in expected noise.
    if (registration) registration.update().catch(() => {})
  },
  // Q10a (round 11): registration FAILING is the opposite case — it leaves the app running with NO
  // service worker at all (no offline copy, no update path, and the "Check for updates" button with
  // nothing to apply through). An agent hit exactly that state in July 2026 and nothing anywhere
  // said so, because this callback did not exist and the rejection had nowhere to go. It is rare
  // and always actionable, so it goes to Sentry. (The OTHER way the same outcome happens — this
  // module's chunk failing to load at all — is captured at the dynamic import in main.tsx; the two
  // fail independently, which is why both halves are wired.)
  onRegisterError(error) {
    captureError(error, { where: 'sw-register' })
  },
})
