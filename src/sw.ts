/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

// sw.ts — PWA service-worker registration (Q3 auto-update-on-open).
//
// registerType is 'prompt' (vite.config), so a newly-deployed SW INSTALLS but WAITS — it does NOT silently
// activate + reload in the middle of a session. Instead:
//   • On LAUNCH, App's boot effect checks navigator.serviceWorker.getRegistration().waiting (instant, no
//     network); if a waiting worker is present (a new version downloaded on a previous visit), it shows the
//     "Updating…" screen and calls updateSW(true) — which messages skipWaiting + reloads once the new SW
//     takes control. So a fresh deploy lands cleanly + visibly on the NEXT open, not as a silent flash.
//   • onRegisteredSW kicks off a background registration.update() (after registration), so any newer SW
//     downloads + becomes the waiting worker, ready to apply on the next launch.
//   • NO visibility/focus re-check — cold-open only (the owner's call), so it never reloads on a mere
//     app resume.
// The Settings → "Check for updates" button (forceReloadLatest) stays as a force-clear fallback.
//
// updateSW(true) messages skipWaiting + reloads ONCE the new SW takes control. There's no reload loop —
// one waiting worker → one activation → one reload, and the reloaded page has no waiting worker so the boot
// check no-ops; App also adds a safety-timeout fallback (forceReloadLatest) in case activation never fires.
// This whole path is service-worker behaviour that only runs in a real browser with a built SW
// (devOptions.enabled is false, and jsdom has no SW), so it's verified ON-DEVICE on staging, not dev/tests.
export const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) registration.update().catch(() => {})
  },
})
