import './index.css' // Tailwind (v3, compiled in-build) + the app's custom CSS — replaces the old Play-CDN <script> + inline <style>.
import * as React from 'react'
import ErrorBoundary, { ModeErrorBoundary } from './ErrorBoundary'
import { initObservability, captureError } from './observability/sentry'
// The original loaded the full ReactDOM UMD global, which exposes BOTH createRoot and
// createPortal. The modern modular build splits them: createRoot is in 'react-dom/client',
// createPortal is in 'react-dom'. Reconstruct a ReactDOM with both so the app's
// ReactDOM.createRoot (mount) and ReactDOM.createPortal (dropdowns/popovers) both work.
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { rangeHasLeapYear } from './lib/calendar.js'
import { fmt, numericFormatOf } from './lib/format.js'
import { randomDate } from './lib/dateGen.js'
import { makeDedPuzzle } from './lib/dedPuzzle.js'
import { SectionLabel } from './components/primitives.jsx'
import { PillTray } from './components/PillTray.jsx'
import { PillGroup } from './components/PillGroup.jsx'
import { UpdateDot } from './components/UpdateDot.jsx'
import CustomSelect from './components/CustomSelect.jsx'
import GuidePage from './components/GuidePage.jsx'
import LookupCard from './components/LookupCard.jsx'
import W5Logo from './components/W5Logo.jsx'
import { useBackButton } from './components/useBackButton.js'
import { SCROLLER_CORE_CLASS, SCROLL_REGION_CLASS, scrollFadeClass, useScrollEdgeState, scrollEdgeGaps, isAtBottom, isScrolledFromTop, edgeShade, readShadeRampPx, writeShade, observeScrollExtent, BOTTOM_EDGE_BAND_PX } from './components/scrollRegion.js'
import { sharedFitScale } from './lib/statFit.js'
import { installPointerGestures } from './lib/pointerGestures.js'
import { readBuildStamp, writeBuildStamp, buildChanged } from './lib/buildStamp.js'
import { checkForUpdate, readOwnBuildId, buildIdUrl, makeCheckNonce, UPDATE_CHECK_LABEL, UPDATE_RESULT_MS } from './lib/updateCheck.js'
import type { UpdateCheckState } from './lib/updateCheck.js'
import { useSettingsCloseEffect } from './components/useSettingsCloseEffect.js'
import { CHANGELOG, GEAR_DOT_KEY, CHANGELOG_DOT_KEY, readUpdateDot, markUpdateDot, clearUpdateDot } from './changelog.js'
import { useSettings, SETTINGS_DEFAULTS } from './store/settings.js'
import type { InputStyle, SettingsValues } from './store/settings.js'
import { useModePrefs } from './store/modePrefs.js'
import { useUserDefaults, effectiveSettingsDefaults, effectivePrefDefaults, normalizeAoxN, prefsMatchDefaults } from './store/userDefaults.js'
import type { PrefDefaults } from './store/userDefaults.js'
import { useProgress } from './store/progress.js'
import type { LookupEntry } from './store/progress.js'
import { reportWebVitals } from './dev/webVitals.js'
import type { FormatId } from './lib/format.js'
import type { CodeDate } from './components/MethodBreakdown.jsx'
import RotateOverlay from './components/RotateOverlay.jsx'
import BootOverlay from './components/BootOverlay.jsx'
import DefaultsCard from './components/DefaultsCard.jsx'
import { RESET_BTN_CLASS, FOOTER_RESET_BTN_CLASS, FOOTER_LINK_ROW_CLASS, NUM_INPUT_CLASS } from './components/controlClasses.js'
import { rollFormat, isTouch, blockMinus, blockMinusBI } from './lib/modeFormat.js'
import ClassicMode from './modes/ClassicMode.jsx'
import FlashMode from './modes/FlashMode.jsx'
import DeductionMode from './modes/DeductionMode.jsx'
import AoxMode from './modes/AoxMode.jsx'
import BlitzMode from './modes/BlitzMode.jsx'
const ReactDOM = { createRoot, createPortal }

    // Shared mode types (GenDate/FmtDate/FlashState/GameEngine/ModeProps/DedOpts) -> src/modes/modeTypes.ts, imported at top.
// AoxBest / BlitzBest / SuddenBest moved to store/progress.ts (the persisted store owns them); imported above.

    const {useEffect,useLayoutEffect,useRef,useState,useCallback,useMemo} = React;
    // ─────────────────────────────────────────────────────────────────────────
    // Date snapshot fields. Every generated date object carries these stamps
    // so that back-browse and codes display always reflect the system that was
    // active when the date was generated, not the current setting:
    //   y, m, d   — year, month, day (1-indexed month)
    //   _fmt      — date format ID at generation (e.g. 'written-mdy', 'numeric-dmy').
    //               Random Format on → random roll per date; off → current dateFormat.
    //               Display layer always trusts _fmt over the live dateFormat setting.
    //   _jul      — useJulian boolean at generation. Used by codes panel + history
    //               so revisiting a Julian-era date via Back keeps Julian highlights/
    //               codes even if the user has since toggled Julian off.
    // Deduction puzzles additionally carry: _abx (abCrossOnly), _julx (julCrossOnly),
    // _m1582 (monthOnly1582) — informational snapshots of per-mode toggles at spawn.
    // ─────────────────────────────────────────────────────────────────────────
    // Shared control className tokens + buttonStateClass -> src/components/controlClasses.ts, imported at top.
    // DOT_CELL — the logo's 7-position layout for the Dots input → src/lib/dotLayout.ts (shared with
    // HtP's DotDiagram, which derives its diagram from the same array), imported at top.
    // WeekdayAnswer -> src/components/WeekdayAnswer.tsx, imported at top.
    // MONTH / DAY name tables → src/lib/format.js, imported at top.
    // MODE_LABELS drives the header mode CustomSelect (the customSelect dropdown
    // that replaced the native <select>). Order here = order shown in the dropdown.
    const MODE_LABELS=[{value:'classic',label:'Classic'},{value:'aox',label:'AoX'},{value:'deduction',label:'Deduction'},{value:'flash',label:'Flash'},{value:'blitz',label:'Blitz'},{value:'lookup',label:'Lookup'},{value:'guide',label:'How to Play'}];
    // ⚙ Settings PICKER option arrays — one array per PillTray tray (components/PillTray), and
    // this is ALL of them, because round-9 made the tray the treatment for every picker in the
    // panel (THE PICKER RULE, stated once at the Display section in the popover below). Order
    // here = left→right segment order.
    // Date Format — five ids across TWO trays but ONE setting and ONE radiogroup, so whichever
    // half doesn't hold the active id simply shows no selected segment. Sharing a group is also
    // why 'MDY' and 'DMY' each appear twice: every pill states its half in its accessible name
    // while the visible label stays the bare initialism.
    const WRITTEN_FORMATS: {value: FormatId; label: string; ariaLabel: string}[]=[{value:'written-mdy',label:'MDY',ariaLabel:'Written MDY'},{value:'written-dmy',label:'DMY',ariaLabel:'Written DMY'}];
    const NUMERIC_FORMATS: {value: FormatId; label: string; ariaLabel: string}[]=[{value:'numeric-mdy',label:'MDY',ariaLabel:'Numeric MDY'},{value:'numeric-dmy',label:'DMY',ariaLabel:'Numeric DMY'},{value:'numeric-ymd',label:'YMD',ariaLabel:'Numeric YMD'}];
    // Input — the day-of-week answer layout. Both names are unique in the panel, so no ariaLabel.
    const INPUT_STYLES: {value: InputStyle; label: string}[]=[{value:'buttons',label:'Buttons'},{value:'dots',label:'Dots'}];
    // Theme — two independent picks under Use System Settings, one pick ACROSS both rows when
    // it's off (see the Theme block in the popover).
    const DARK_THEMES=[{value:'dusk',label:'Dusk'},{value:'midnight',label:'Midnight'},{value:'nebula',label:'Nebula'}];
    const LIGHT_THEMES=[{value:'light',label:'Light'},{value:'parchment',label:'Parchment'}];
    // The Dates section's chance weights. Julian and Jan/Feb offer the same five; Leap Year drops
    // 25% because ~1-in-4 IS its natural rate — a "25%" weight there would force nothing. Values
    // are the store's own strings ('random' | the percentage), so no mapping is needed anywhere.
    const chanceOptions=(...steps: string[])=>steps.map(v=>({value:v,label:v==='random'?'Random':v+'%'}));
    const CHANCE_OPTIONS=chanceOptions('random','25','50','75','100'),LEAP_CHANCE_OPTIONS=chanceOptions('random','50','75','100');
    // Method-code maps + the per-date code summary (METHOD_*, JULIAN_AB_MAP, normalizeMod7,
    // canonicalizeMod, calcDayCode, calcCdCode, yearParts, computeMethodSummary) → src/lib/method.js,
    // imported at top. (computeMethodSummary is the only one used here; the rest are its internals.)
    // Deduction option constants, yearGridLayout + the MONTH_BOXES tables -> src/lib/dedPuzzle.ts, imported at top.
    // Day-of-week & calendar math (toAstro, isLeap, dim, jdn*, wday*, isJulian*, isGap*, rangeHasLeapYear) → src/lib/calendar.js, imported at top.
    // Date formatting (fmtYear, fmt, fmtPartial, numericFormatOf) → src/lib/format.js, imported at top.
    // rint + randomDate (the weekday-question generator) -> src/lib/dateGen.ts, imported at top.
    // Shared format/time helpers -> src/lib/modeFormat.ts, imported at top.

    // entryWithGreen → src/engine/answerButtons.js, imported at top (shared with the reducer + AoxMode).

    // FLASH_MS + the shared mode-screen hooks -> src/modes/modeHooks.ts, consumed there by the five
    // screens; nothing here reaches into src/modes for them. The one that is NOT mode-specific,
    // useSettingsCloseEffect, lives in src/components/useSettingsCloseEffect.ts (App uses it too,
    // for the Q7 update-check reset) and is imported at top.

    // computeHasCredit, markBtns, mkBtnsWithCorrect → src/engine/answerButtons.js, imported at top.

    // Expander → src/components/Expander.jsx. No longer used directly here: every panel in main.tsx
    // reaches it through MethodBreakdownSection (Q5, round 8 — AoX was the last hand-rolled site).



    const DEPLOY_TS=new Date('2026-08-08T05:30:00Z');

    // Post-update splash skip: a one-time sessionStorage flag stamped by BOTH update paths
    // immediately before their reload — the AUTO path's gated reload (controllerchange or the
    // 4s-safety handoff, via makeUpdateReloadGate below) and the MANUAL Check-for-updates path
    // (forceReloadLatest below) — and CONSUMED (read + removed) by the next boot's hold
    // computation: the user just watched the Updating screen ≥1s, so the follow-on LOADING splash
    // skips its artificial 500ms hold and shows only as long as the real boot takes. It still
    // waits for css-ready + mount, so even the manual path's genuinely network-cold boot (caches
    // wiped) can never reveal an unstyled frame — post-update, the splash always shows only real
    // boot time. The consumed value is also shared (skipHoldConsumedRef in App) with the Q2
    // build-change flash effect: a boot that just came through the real Updating flow lands on a
    // changed build stamp by definition, and it must RESTAMP silently — the screen already showed,
    // and a second one back-to-back is exactly what the flash must never add. try/catch
    // throughout: sessionStorage can throw (privacy modes) and a broken flag must never break
    // boot.
    const SKIP_BOOT_HOLD_KEY='cg-skip-boot-hold';
    const markSkipBootHold=()=>{try{sessionStorage.setItem(SKIP_BOOT_HOLD_KEY,'1');}catch{/* best-effort */}};
    const consumeSkipBootHold=()=>{try{const set=sessionStorage.getItem(SKIP_BOOT_HOLD_KEY)!==null;sessionStorage.removeItem(SKIP_BOOT_HOLD_KEY);return set;}catch{return false;}};

    // Force the very latest deployed version, bypassing the service-worker cache — the big hammer
    // BEHIND Settings → "Check for updates", and since Q7 (round 11) no longer what that button
    // does. The button checks first and applies through the service worker; this runs only when a
    // check FOUND something the gentle path cannot deliver (no registration at all, or no handoff
    // within UPDATE_HANDOFF_MS). It stays reachable because it is the only cure for the round-7
    // class — an asset whose bytes changed while its precache revision did not, which Workbox will
    // never re-download (scripts/precacheIntegrity.mjs now makes that unshippable at build time).
    // (The NORMAL update path is two-step prompt-mode:
    // a newly-deployed SW installs + WAITS in the background, and App's auto-update boot effect
    // applies it on the next cold open behind the Updating screen.) It covers what that path
    // can't — a stuck/ancient SW or cached icon you can't shake on a phone with no hard-refresh:
    // it unregisters the service worker(s) and deletes the Cache-API caches (the precached app shell
    // + assets), then reloads — so the next load fetches everything fresh from the server. NEVER use
    // it on the automatic path: with the caches wiped, an offline launch has nothing to serve (the
    // auto path's safety fallback is a plain reload instead). It does NOT touch localStorage, so
    // saved stats, settings, bests, and Lookup history are all preserved (only the app code/asset
    // cache is cleared). Like the auto path's gated reload, it stamps cg-skip-boot-hold just before
    // navigating (markSkipBootHold above): the user already sat through the ≥1s Updating hold, so
    // the post-reload splash shows only the real (network-cold) boot time — no artificial 500ms
    // hold stacked on top.
    const forceReloadLatest=async()=>{
      try{
        if('serviceWorker' in navigator){
          const regs=await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r=>r.unregister()));
        }
        if('caches' in window){
          const keys=await caches.keys();
          await Promise.all(keys.map(k=>caches.delete(k)));
        }
      }catch{/* best-effort — reload regardless */}
      markSkipBootHold();
      window.location.reload();
    };

    // index.html's inline boot scripts stamp these: __bootShownAt = the requestAnimationFrame
    // timestamp of the #boot splash's first rendering opportunity (≈ its first paint); __cssReady =
    // set (with a window 'app-css-ready' event) by the preload-swapped stylesheet link's
    // onload/onerror — see vite.config.js bootCssPreload.
    declare global{interface Window{__bootShownAt?:number;__cssReady?:boolean}}

    // The page's LOADING splash is #boot in index.html — a body-level sibling of #root (so React's
    // first commit can't wipe it), inline-styled so it paints before any external resource. App owns
    // its removal, from exactly two places: the boot-hold effect (normal launch — after ≥0.5s visible
    // AND the real stylesheet has applied) and the auto-update path (the Updating overlay replaces
    // it). Optional-chained: tests don't create #boot, and a repeat call is a no-op.
    const dismissBootSplash=()=>{document.getElementById('boot')?.remove();};

    // The boot effects' shared "has the real stylesheet applied?" check: true once the preload-swapped
    // CSS link (vite.config.js bootCssPreload) has stamped __cssReady, or when no preload link exists
    // at all (dev/tests — the CSS arrives through the JS module graph before mount). Both boot paths —
    // the normal splash dismissal AND the auto-update Updating handoff — gate on it, so neither can
    // ever reveal an unstyled frame.
    const appCssApplied=()=>window.__cssReady===true||!document.querySelector('link[rel="preload"][as="style"]');

    // Q3 auto-update loop breaker: the count of consecutive auto-update attempts, persisted in
    // sessionStorage (it survives same-tab reloads — exactly the shape of the failure loop — but not a
    // fresh open). Counted up when the boot check engages the Updating flow, cleared on success
    // (controllerchange) and on any boot that finds no waiting worker; after 2 failed attempts the
    // boot check STOPS re-entering the flow (see the auto-update effect), so a persistently-failing
    // SKIP_WAITING / broken waiting worker can never trap the user in an Updating→reload loop — the
    // app always renders (on the old version) and the manual Check-for-updates hammer stays reachable.
    // try/catch throughout: sessionStorage can throw (privacy modes) and a broken counter must never
    // break boot.
    const UPDATE_ATTEMPTS_KEY='cg-update-attempts';
    const readUpdateAttempts=()=>{try{return parseInt(sessionStorage.getItem(UPDATE_ATTEMPTS_KEY)||'0',10)||0;}catch{return 0;}};
    const writeUpdateAttempts=(n: number)=>{try{sessionStorage.setItem(UPDATE_ATTEMPTS_KEY,String(n));}catch{/* best-effort */}};
    const clearUpdateAttempts=()=>{try{sessionStorage.removeItem(UPDATE_ATTEMPTS_KEY);}catch{/* best-effort */}};

    // Q3 min-hold: the guaranteed minimum time the "Updating…" screen stays visible, shared by BOTH
    // update paths so they feel identical — the AUTO path gates its reload on it (makeUpdateReloadGate
    // below) and the manual Check-for-updates button waits it out before forceReloadLatest. Without a
    // hold, activating an already-waiting worker completes in tens of ms and the reload outraces
    // React's paint of the overlay — the owner never saw the screen (1s picked 2026-07-13).
    const MIN_UPDATING_MS=1000;

    // Q7: how long the manual applier waits for the service-worker handoff (controllerchange) before
    // giving up and reaching for forceReloadLatest. A FAILURE bound, not a display duration — the
    // Updating screen is up the whole time either way. Generous, because a slow phone finishing an
    // install at 6s is a real success and cutting it off would wipe the offline copy for nothing;
    // the auto path's own 4s net is shorter because there it only ever activates an ALREADY
    // downloaded worker, while this one may still be fetching the new build.
    const UPDATE_HANDOFF_MS=8000;

    // makeUpdateReloadGate (pure, exported for tests) — the AUTO update path's reload gate: reload()
    // fires only when BOTH the SW handoff (controllerchange, or the 4s safety timeout — either calls
    // onHandoff) AND the armed MIN_UPDATING_MS visible hold have completed, and at most ONCE. The
    // hold is a plain setTimeout, never rAF — background-tab rAF throttling could park the callback
    // and hang the reload forever. cancel() clears the hold timer AND marks the gate dead (wired to
    // the update effect's cleanup) so a torn-down gate can never fire a stray reload — not even via
    // a late onHandoff after the hold already elapsed.
    const makeUpdateReloadGate=({minHoldMs,reload}:{minHoldMs:number;reload:()=>void})=>{
      let handoff=false,held=false,reloaded=false;
      let holdId: number|undefined;
      const tryReload=()=>{if(handoff&&held&&!reloaded){reloaded=true;reload();}};
      return{
        armHold:()=>{holdId=window.setTimeout(()=>{held=true;tryReload();},minHoldMs);},
        onHandoff:()=>{handoff=true;tryReload();},
        cancel:()=>{reloaded=true;if(holdId!==undefined)window.clearTimeout(holdId);},
      };
    };

    // Pure (exported for tests): how much longer #boot must stay up. The splash needs ≥500ms of
    // VISIBLE time or a fast cached load flashes it for a frame, which reads as a glitch — and
    // visible time starts at the __bootShownAt stamp, NOT at navigation start (the old bug:
    // `500 - performance.now()` clamps to 0 whenever React mounts >500ms after navigation — i.e. on
    // every real network / SW cold boot — so the splash flashed exactly where it mattered). A
    // missing stamp (inline script failed/stripped) holds the full 500ms from now: the safe direction.
    // skipHold (the consumed cg-skip-boot-hold flag — the boot right after an update, auto OR the
    // manual Check-for-updates reload; both paths stamp it) drops the
    // artificial hold entirely: remaining=0, the splash stays only for the real boot work.
    const bootHoldRemaining=(shownAt:number|undefined,now:number,skipHold=false)=>skipHold?0:shownAt===undefined?500:Math.max(500-(now-shownAt),0);

    // BootOverlay + BOOT_TRACE_ANIMATED -> src/components/BootOverlay.tsx, imported at top (still re-exported below for tests/bootFlowDriver.dom).

    // RotateOverlay -> src/components/RotateOverlay.tsx, imported at top.

    // makeDedPuzzle -> src/lib/dedPuzzle.ts, imported at top.

    // StatPanel → src/components/StatPanel.jsx, imported at top.

    // CustomSelect → src/components/CustomSelect.jsx, imported at top.

    // AoxMode -> src/modes/AoxMode.tsx, imported at top.

    // ClassicMode -> src/modes/ClassicMode.tsx, imported at top.

    // FlashMode -> src/modes/FlashMode.tsx, imported at top.

    // BlitzBestRow -> src/components/BlitzBestRow.tsx, imported at top.

    // BlitzMode -> src/modes/BlitzMode.tsx, imported at top.

    // DeductionMode -> src/modes/DeductionMode.tsx, imported at top.

    // ============================================================
    // DefaultsCard — the ONE shared defaults card (Q5 round-6): the Save Defaults popup and the
    // defaults manager both render THIS dialog card, so there are never two styles editing the
    // same four values. Parameterized by seed source alone — the Save card seeds `prefs`/`seed`
    // from the LIVE stores at open, the manager from the SAVED/effective defaults — plus the one
    // `manage` flag covering every deliberate difference between the two:
    //   • the AoX row: the Save card keeps its visible input box (the shared NUM_INPUT_CLASS
    //     idiom, Q18); the manager renders the row like the Blitz timer readouts instead — a
    //     plain tap-to-type SliderValueEditor value with its own widest-string strut "1000",
    //     no box (min/max/snap 2–1000/1 mirror the normalizeAoxN clamp; junk/empty reverts,
    //     the editor's contract, rather than the box's junk→10 fallback);
    //   • buttons: the Save card is an action card — Cancel + Save always; the manager rests
    //     read-only (one full-width Close in the Cancel recipe) and swaps to Cancel + Save only
    //     once something is dirty;
    //   • the footnote slot: the manager shows `note` while clean and the restricted-write
    //     warning ("Saving here updates only these values.") while dirty — the manager's Save
    //     writes ONLY these four values, so the swap appears exactly when it becomes relevant;
    //     the Save card writes the whole snapshot and needs neither.
    // A row is DIRTY when its pending value differs from the seed (aoxN normalized on both
    // sides, the store's defensive rule); dirty rows flag their value box/readout in the
    // btn-solid accent tier (the AoX box swaps its surface-tray surface whole for btn-solid +
    // border-transparent so the rendered height never changes; the readouts take
    // SliderValueEditor's accent pill).
    // Stateless by design — the popup lifecycle (portal, scrim, Escape, Back, focus) stays with
    // the callers in App; edits touch only the caller's pending snapshot via setPrefs.
    // ============================================================
    // DefaultsCard -> src/components/DefaultsCard.tsx, imported at top.
    // ============================================================
    // App — the top-level component for the remaining fused modes
    //
    // Manages mode switching, per-mode preserved state (dateByMode, calcOpenByMode,
    // preservedByModeRef, stacksByModeRef, timerDoneSnapRef), stats tracking, and the
    // still-fused rendering (Lookup/How to Play). Classic, Flash, Blitz, Deduction + AoX are
    // their own self-contained components (ClassicMode/FlashMode/BlitzMode/DeductionMode on the
    // shared engine, AoxMode).
    // ============================================================
    function App(){
      const [mode,setMode]=useState("classic");   // the app always opens to Classic (the current tab is not persisted)
      // Tracks the most recent non-guide mode so the H key bind can toggle out of
      // guide back to where the user was. Updated whenever mode changes (excluding
      // changes INTO guide). Initial value 'classic' covers the never-left-classic case.
      // Distinct from the unrelated prevModeRef declared further down which tracks
      // mode changes for codes-freeze logic.
      const prevNonGuideModeRef=useRef('classic');
      useEffect(()=>{if(mode!=='guide')prevNonGuideModeRef.current=mode;},[mode]);
      const modeSelectRef=useRef<HTMLDivElement | null>(null);
      const [systemIsDark,setSystemIsDark]=useState(()=>typeof window!=="undefined"?window.matchMedia("(prefers-color-scheme: dark)").matches:true);
      // ⚙ Settings store (Stage C, Step 5a). The 13 settings values + their setters
      // + resetSettings now live in the Zustand store (src/store/settings.js), bound
      // here to the SAME local names App used before so every read site, setter call
      // (incl. functional updaters), and the settingsAtDefaults/isFullyReset booleans
      // keep working unchanged. minInputVal/maxInputVal stay as local useState below.
      // Each setter is selected individually so component re-renders only when the
      // specific value it reads changes (Zustand selector subscriptions).
      const useSystem=useSettings(s=>s.useSystem),setUseSystem=useSettings(s=>s.setUseSystem);
      const darkTheme=useSettings(s=>s.darkTheme),setDarkTheme=useSettings(s=>s.setDarkTheme);
      const lightTheme=useSettings(s=>s.lightTheme),setLightTheme=useSettings(s=>s.setLightTheme);
      const manualTheme=useSettings(s=>s.manualTheme),setManualTheme=useSettings(s=>s.setManualTheme);
      const minY=useSettings(s=>s.minY),setMinY=useSettings(s=>s.setMinY);
      const maxY=useSettings(s=>s.maxY),setMaxY=useSettings(s=>s.setMaxY);
      const useJulian=useSettings(s=>s.useJulian),setUseJulian=useSettings(s=>s.setUseJulian);
      const saveStats=useSettings(s=>s.saveStats),setSaveStats=useSettings(s=>s.setSaveStats);
      const dateFormat=useSettings(s=>s.dateFormat),setDateFormat=useSettings(s=>s.setDateFormat);
      const randomFormat=useSettings(s=>s.randomFormat),setRandomFormat=useSettings(s=>s.setRandomFormat);
      const inputStyle=useSettings(s=>s.inputStyle),setInputStyle=useSettings(s=>s.setInputStyle);
      const leapChance=useSettings(s=>s.leapChance),setLeapChance=useSettings(s=>s.setLeapChance);
      const janFebChance=useSettings(s=>s.janFebChance),setJanFebChance=useSettings(s=>s.setJanFebChance);
      const julianChance=useSettings(s=>s.julianChance),setJulianChance=useSettings(s=>s.setJulianChance);
      const applySettingsStore=useSettings(s=>s.applySettings);
      // Personal defaults (Q7 Save Defaults): `saved` is the user's snapshot (null = none). The
      // EFFECTIVE defaults derived from it feed Reset Settings, Full Reset, settingsAtDefaults,
      // and the gear's "modified" indicator; the mode components read their own slices for their
      // freshness checks. Survives Full Reset by design (see store/userDefaults).
      const savedDefaults=useUserDefaults(s=>s.saved);
      const saveUserDefaults=useUserDefaults(s=>s.saveDefaults);
      const clearUserDefaults=useUserDefaults(s=>s.clearDefaults);
      const defSettings=useMemo(()=>effectiveSettingsDefaults(savedDefaults),[savedDefaults]);
      const defPrefs=useMemo(()=>effectivePrefDefaults(savedDefaults),[savedDefaults]);
      // prefsAtDefaults: do the four capturable mode-screen prefs match their effective defaults?
      // A BOOLEAN zustand selector, so App re-renders only when the answer FLIPS — a slider drag
      // in Flash/Blitz never re-renders App per tick.
      const prefsAtDefaults=useModePrefs(s=>prefsMatchDefaults(s,defPrefs));
      const applyModePrefs=useModePrefs(s=>s.applyPrefs);

      const activeTheme=useSystem?(systemIsDark?darkTheme:lightTheme):manualTheme;
      useEffect(()=>{const mq=window.matchMedia("(prefers-color-scheme: dark)");const h=(e: MediaQueryListEvent)=>setSystemIsDark(e.matches);mq.addEventListener("change",h);return()=>mq.removeEventListener("change",h);},[]);
      useEffect(()=>{
        document.documentElement.setAttribute("data-theme",activeTheme);
        const tc=getComputedStyle(document.documentElement).getPropertyValue("--tc").trim();
        const meta=document.querySelector("meta[name='theme-color']");
        if(meta&&tc)(meta as HTMLMetaElement).content=tc;
        // Keep <html>'s background in step too: index.html's boot script stamped the saved theme's
        // color on it so no pre-stylesheet frame ever paints white — without a re-stamp a runtime
        // theme switch would leave the document canvas (what iOS shows on overscroll) at the stale
        // boot color. tc is '' before the stylesheet applies (tests/dev first pass) → keep the stamp.
        if(tc)document.documentElement.style.background=tc;
      },[activeTheme]);
      // Q11 portrait lock, the non-Android half: the manifest's orientation:'portrait'
      // (vite.config.js webManifest) hard-locks installs only on Android, so on every platform
      // that ignores it (iOS foremost) App covers a sideways screen with RotateOverlay. Gate =
      // ALL of: a touch device (isTouch — desktop windows are never blocked), CSS landscape, and
      // a SHORT viewport (max-height 500px: only phone-in-landscape heights match — iPad
      // landscape is ≥768px tall, so tablets stay free; ~500 also clears the tallest phone
      // landscape, 440px-class, with margin). One combined media query so a single change
      // listener tracks rotation in both directions; the same boolean pauses the countdown
      // modes via clockPaused (an accidental mid-round rotation must not burn the clock behind
      // the overlay). Deliberately NOT the startup-image path — those stay portrait-only; the
      // overlay takes over after first paint.
      const [landscapeBlocked,setLandscapeBlocked]=useState(false);
      useEffect(()=>{
        if(!isTouch)return;
        const mq=window.matchMedia("(orientation: landscape) and (max-height: 500px)");
        const h=()=>setLandscapeBlocked(mq.matches);
        h();   // launched already-sideways → blocked from the first commit
        mq.addEventListener("change",h);
        return()=>mq.removeEventListener("change",h);
      },[]);
      // Save Stats toggle. Flips the global ⚙ setting; each always-mounted mode component
      // reads the new saveStats prop itself (display dimming + Best-recording gate). Save Stats
      // is not a date-generation setting, so it never regenerates a date.
      const toggleSaveStats=()=>setSaveStats(v=>!v);
      // minY/maxY now from the settings store (bound at top of App). minInputVal/maxInputVal stay local (transient text mirrors).
      const [minInputVal,setMinInputVal]=useState("1");
      const [maxInputVal,setMaxInputVal]=useState("10000");
      const minInputRef=useRef<HTMLInputElement | null>(null),maxInputRef=useRef<HTMLInputElement | null>(null);
      // Lookup history persists across reloads (Stage D1): sourced from the progress store
      // instead of local useState. The store setter accepts a direct value OR a functional
      // updater, so the push/move/clear handlers below stay unchanged.
      const lookupHistory=useProgress(s=>s.lookupHistory);
      const setLookupHistory=useProgress(s=>s.setLookupHistory);
      const resetProgress=useProgress(s=>s.resetProgress);   // Full Reset wipes saved progress too (Stage D1)
      const resetModePrefs=useModePrefs(s=>s.resetModePrefs);   // Full Reset restores the per-mode setup too
      const [lookupInput,setLookupInput]=useState("");
      const [lookupOutput,setLookupOutput]=useState("");
      const [lookupCalcDate,setLookupCalcDate]=useState<CodeDate | null>(null);
      const [lookupSelectedHistoryId,setLookupSelectedHistoryId]=useState<string | null>(null);
      const [lookupCalcOpen,setLookupCalcOpen]=useState(false);
      // #6 — removed prevLookupCalcKeyRef and its effect; lookup Show Codes now only closes
      // when runLookup() fires a new result or the user manually closes it.
      // Bar height tracking. The htp-sticky-bar is position:fixed (chrome-style fixed
      // element above everything), so it has no natural effect on the flow of the
      // appScrollRef container below it. We measure the bar's border-box height here and
      // write it to a CSS custom property (--bar-h) on the document root; the scroll
      // container reads it via padding-top:var(--bar-h) so its content starts below
      // the bar instead of being covered by it. ResizeObserver fires on initial mount
      // and any time the bar's height changes (e.g., mode switch flips pb-2.5 in
      // guide mode vs none in game modes, or content reflows). Writing to a CSS
      // variable instead of JS-applying padding directly keeps the styling
      // declarative and avoids React state churn for a value that's not part of
      // application logic. syncBarHeight is the ONE writer of the variable, shared with the
      // scroll-ownership effect below: on a mode change the bar's height and the guide's scroll
      // range change in the SAME commit, and a ResizeObserver callback lands only after every
      // layout effect has run — so a scroll restore that trusted the observer would clamp against
      // a document 10px too short. Calling it directly reads the post-commit truth (the rect read
      // forces layout), which is why it's a callback rather than a closure inside the effect.
      // ⚠ THE THREE EFFECTS BELOW ARE ONE ORDERED CHAIN, and the order is the declaration order:
      // React runs layout effects top-down, so this one measures the bar, the scroll-ownership
      // effect positions against a document sized by that measurement, and the edge-indicator
      // effect evaluates against the position that left. All three are LAYOUT effects for the same
      // reason — a passive one anywhere in the chain runs after the whole chain and after paint,
      // which is one wrong frame. That is why this is useLayoutEffect and not useEffect: as a
      // passive effect it landed AFTER the edge evaluation, which then measured the first frame of
      // every cold start against index.css's placeholder --bar-h:57px.
      // ⚠ SUB-PIXEL PRECISION (round 10) — the measure is getBoundingClientRect().height, NOT
      // offsetHeight. offsetHeight is specified to return a ROUNDED INTEGER: on the owner's device
      // the bar is really 71.765625px tall and offsetHeight reported 72, so --bar-h — and with it
      // everything positioned from --bar-h — sat 0.234px too low. That was the whole of the
      // hairline he reported in How to Play (a faint line of the PREVIOUS panel's bottom border
      // touching the bar with no gap, gone after scrolling a hair further). SEVEN readers share
      // this one token and every one of them sharpens at once:
      //   1. --seat-top (index.css) — the accordion's reading line, --bar-h + one panel gap.
      //   2. scroll-padding-top on that same rule — the native scrollport seat (Tab to a header).
      //   3. .doc-fade-top's top offset — where the guide's top feather starts.
      //   4. the app scroller's paddingTop below — the content's start, i.e. the document height.
      //   5. the settings popover's max-height calc.
      //   6. CustomSelect's open dropdown, which WATCHES this property: its trigger is in the bar,
      //      so a change here means the trigger moved and the fixed panel must re-measure.
      //   7. GuidePage's seat ladder, last rung (--seat-top → scroll-padding-top → --bar-h).
      // Reader 3 is the structural one, and the reason this fix is a guarantee rather than a hope
      // about how a given renderer rounds: with an exact --bar-h the feather begins EXACTLY where
      // the bar ends, so it covers anything that could still bleed through. At 0.234px low there
      // was a band painted by neither the bar nor the fade.
      // ⚠ getBoundingClientRect() is TRANSFORM-AWARE — it reports the VISUAL box. The bar carries
      // no transform today and must not gain one: a scale on the bar would silently corrupt all
      // seven readers at once (animate a child instead).
      // ⚠ Do NOT "modernise" this into ResizeObserver's borderBoxSize (fractional too): this
      // callback is ALSO invoked directly from the mode-change layout effect below, where there is
      // no observer entry to read, so a rect read is needed regardless — and two sources for one
      // number is exactly the drift the ONE-writer note above exists to prevent.
      const htpStickyBarRef=useRef<HTMLDivElement | null>(null);
      const syncBarHeight=useCallback(()=>{const el=htpStickyBarRef.current;if(el)document.documentElement.style.setProperty('--bar-h',`${el.getBoundingClientRect().height}px`);},[]);
      useLayoutEffect(()=>{
        const el=htpStickyBarRef.current;if(!el)return;
        syncBarHeight();
        // Mounted once ([] via the stable callback), so it catches every LATER height change —
        // a font/safe-area shift, a reflow. A mode change is not one of those: it lands in the
        // same commit as the scroll work below, which is why that effect re-syncs directly.
        const ro=new ResizeObserver(syncBarHeight);
        ro.observe(el);
        return()=>ro.disconnect();
      },[syncBarHeight]);
      // Q3 document scroll — HtP ONLY. iOS's tap-the-status-bar-to-scroll-to-top targets the
      // ROOT scroller exclusively; an inner overflow-y div can never receive it (no JS event
      // exists to intercept the tap), so it was a no-op on every page. In guide mode — the one
      // true reading page — <html data-doc-scroll> releases the app's three scroll clamps
      // (html/body overflow:hidden + the fixed 100dvh #root box; the release rules live next
      // to those clamps in index.css) so the DOCUMENT becomes the scroller and the native
      // affordance works. All other modes keep the locked fit-to-screen architecture, and the
      // bar stays position:fixed throughout (the iOS status-bar tint sampling depends on it).
      const docScroll=mode==="guide";
      const appScrollRef=useRef<HTMLDivElement | null>(null);
      // The guide's two fixed soft edges (index.css .doc-fade-*), refs so the edge effect below can
      // write their --shade. Mounted for the whole of guide mode now that their strength is
      // continuous — a strip at --shade 0 paints nothing, so there is no on/off left to render.
      const docFadeTopRef=useRef<HTMLDivElement | null>(null);
      const docFadeBottomRef=useRef<HTMLDivElement | null>(null);
      // The mask fades on the CLAMPED-mode container, and nothing else — the bar's shadow and the
      // guide's strips are continuous now and read --shade instead (see the effect below). Guide
      // mode therefore leaves these untouched and un-rendered-from: scrolling How to Play sets no
      // React state at all, which is the point on the app's one long reading page. They are
      // deliberately kept, not vestigial: fade-scroll-* is a state CLASS, so the container's two
      // masks still need the booleans.
      const [appAtBottom,setAppAtBottom]=useState(true);
      const [appScrolledFromTop,setAppScrolledFromTop]=useState(false);
      // The guide's reading position, in document scroll units — the app's ONLY per-mode scroll
      // memory (the game modes always open at their own top; only the guide is a reading page).
      // A ref because nothing renders from it, and deliberately NOT persisted anywhere: a refresh
      // or a cold start opens Classic with a fresh ref and a fresh GuidePage, which is the whole
      // of "a new launch starts at the top with every panel closed".
      const guideScrollYRef=useRef(0);
      // switchMode — the ONE door every mode change goes through. It exists to take the guide's
      // scroll reading at the only moment the number can be trusted: synchronously inside the
      // event that switches the mode, BEFORE React re-renders and hides the guide. Read it one
      // commit later — from an effect cleanup, the obvious place — and a real engine has already
      // collapsed the document to a screenful and clamped its scroll offset to ~0, so the reader
      // silently loses their place; jsdom lays nothing out, so no test could ever catch that.
      // Hence a door rather than a guard. The condition is <html data-doc-scroll>, not
      // mode==='guide': the effect below owns that attribute, so it states exactly what the
      // reading needs — "the DOCUMENT is the scroller right now, so window.scrollY is this
      // screen's position". Stable identity ([] deps) because the keyboard effect depends on it.
      const switchMode=useCallback((next: React.SetStateAction<string>)=>{
        if(document.documentElement.hasAttribute('data-doc-scroll'))guideScrollYRef.current=window.scrollY;
        setMode(next);
      },[]);
      // Scroll ownership on a mode change — ONE effect, no second opinion. Every scroll position
      // the app sets when you switch screens is set here, and the whole policy is two rules:
      //   • guide → RESTORE the reader's place (switchMode saved it on the way out). The attribute
      //     releases the clamps so the document can scroll at all, and only then does the offset
      //     land — it is clamped against the document's height on the way in.
      //   • every other mode → TOP, by resetting the inner container. Without it, leaving a
      //     scrolled screen would show the next mode from the middle.
      // syncBarHeight comes FIRST and applies to BOTH branches, because the bar's guide-only
      // pb-2.5 makes a mode change a bar-height change in EITHER direction: entering, --bar-h feeds
      // the container's padding-top, i.e. the document's height, i.e. what the restored offset gets
      // clamped against; leaving, a --bar-h left 10px too tall pads the game screen it hands over
      // to, and the edge-indicator effect below would read that inflated scrollHeight and paint a
      // bottom fade on a mode with nothing to scroll. The bar's own ResizeObserver cannot cover
      // either case — it fires after every layout effect has run, i.e. a frame late. It can sit
      // ahead of the attribute because the bar does not care about it: the bar is position:fixed
      // against the viewport, so releasing #root's clamps changes nothing about its height. What
      // IS load-bearing is that both land before the window.scrollTo below — the attribute because
      // the document cannot scroll without it, the measurement because it sets the height the offset
      // is clamped against.
      // A LAYOUT effect so all of that happens before the browser paints the new mode, and on
      // leave the window is zeroed BEFORE the attribute comes off — a residual document scrollTop
      // would permanently offset the re-clamped fixed layout. That leave-zero is also the only
      // one needed: the document cannot scroll in a clamped mode, so the game-mode branch has no
      // window reset to make. Nothing else in the app moves a scroller on a mode change, which is
      // what makes the restore safe — there is no later effect left to overwrite it.
      useLayoutEffect(()=>{
        syncBarHeight();
        if(docScroll){
          document.documentElement.setAttribute('data-doc-scroll','');
          window.scrollTo(0,guideScrollYRef.current);
          return()=>{window.scrollTo(0,0);document.documentElement.removeAttribute('data-doc-scroll');};
        }
        const el=appScrollRef.current;if(el)el.scrollTop=0;
      },[mode,docScroll,syncBarHeight]);
      // App-wide scroll-state tracking, sourced from ONE of two scrollers, branched on docScroll:
      //   • clamped modes: the confined scroll container (appScrollRef) via its own scroll
      //     listener. Container scrolls when content overflows the viewport-below-bar (any mode
      //     where content can't fit at the current viewport size).
      //   • guide mode: the DOCUMENT (data-doc-scroll) via window scroll/resize, reading
      //     document.scrollingElement against window.innerHeight.
      // BOTH branches then add observeScrollExtent (components/scrollRegion) on the container,
      // because a scroll event answers only "where is the scroller" and the edge question also
      // asks "how much content is there" — see round 11 Q4 below.
      // What it drives, in two languages (round 10 item B):
      //   • CONTINUOUS, both branches — the bar's boundary shadow, and in guide mode the two
      //     doc-fade strips, all via the 0…1 --shade written straight onto those elements. That
      //     is what killed the shadow that lingered after a status-bar tap: strength is a
      //     function of position, so a stopped scroller is already at its final value.
      //   • BOOLEAN, clamped branch only — the container's own fade-scroll-* masks, which are
      //     state classes and so still need appScrolledFromTop / appAtBottom.
      // The arithmetic is NOT written out here: scrollEdgeGaps and its two predicates
      // (components/scrollRegion) are the one owner of "how far is this scroller from its edges",
      // shared with useScrollEdgeState, so the shadow and the mask can never answer differently.
      // What stays bespoke is only the SOURCING — the document scroller has no element to observe,
      // so this branch reads document.scrollingElement and listens on window; the inner regions
      // (popover, changelog, lookup) go through the shared hook.
      // A missing scrollingElement is treated as an unscrollable document rather than skipped, so
      // even then every boundary gets written to a defined resting 0 instead of being left at the
      // @property initial value.
      // Defaults: appAtBottom true / appScrolledFromTop false (no indicators on first
      // paint before scroll state is evaluated). The listener runs on every mode change
      // so it picks up the right scroller and re-evaluates against new content.
      // A LAYOUT effect, and the LAST of the three declared above, so React runs it third: the
      // first evaluate() of a mode therefore measures a bar already re-synced and a position
      // already applied, and the indicators are right on the FIRST painted frame. As a passive
      // effect it would evaluate after the paint, so returning to a scrolled guide flashed one
      // frame with no bar shadow and no top fade.
      useLayoutEffect(()=>{
        const rampPx=readShadeRampPx();
        // One writer for every boundary this screen owns; a ref that isn't mounted is skipped.
        const paint=(scrollTop:number,scrollHeight:number,clientHeight:number)=>{
          const gaps=scrollEdgeGaps(scrollTop,scrollHeight,clientHeight);
          const top=edgeShade(gaps.top,0,rampPx);
          writeShade(htpStickyBarRef.current,top);
          writeShade(docFadeTopRef.current,top);
          writeShade(docFadeBottomRef.current,edgeShade(gaps.bottom,BOTTOM_EDGE_BAND_PX,rampPx));
          return gaps;
        };
        // Same rule as scrollRegion's no-scroller path: a boundary surface with no scroller to
        // track must REST at 0, never at @property's initial 1. Unreachable today (the container
        // renders unconditionally) and hoisted ABOVE the branch so both modes obey it — leaving
        // the hole on either side would make the pattern "safe here, unsafe there", and its twin
        // in Lookup was a live full-strength-shadow bug.
        const el=appScrollRef.current;if(!el){paint(0,0,0);return;}
        // ROUND 11 Q4 — the container is handed to observeScrollExtent in BOTH modes, because in
        // both it is the thing the CONTENT hangs off:
        //   • clamped: it is the scroll box, and `absolute inset-0` pins that box to the viewport
        //     BY CONSTRUCTION — so the ResizeObserver that used to watch it was watching the one
        //     number no content change can move, and every mask froze the moment content changed
        //     without a scroll (open Show Codes while resting at the top and the bottom fade kept
        //     the answer from before it opened). The helper reaches the one child, the mode-content
        //     wrapper, whose height IS this scroller's scrollHeight.
        //   • guide: it is a plain flow block, so its own height is what the document scrolls, and
        //     there was no observer here at all — window scroll + resize only. An accordion toggle
        //     changes the document's height and produces neither event (a tap that seats an already
        //     seated panel scrolls nowhere, and the panel keeps growing for the rest of its
        //     animation after the glide's last scroll event), which is the doc-fade freeze.
        // It also makes the two branches answer the same question the same way, which the one
        // watching a pinned box and the one watching nothing did not.
        // The observer now fires once per animation FRAME while content is transitioning — that is
        // the point (the indicators track a panel opening instead of snapping after it) and it
        // costs nothing on the frames that move no boundary: writeShade skips an unchanged number
        // and React bails on a setState to the value already held, so those frames re-render
        // nothing. tests/scrollExtent.dom pins the whole contract, fixtures included.
        if(docScroll){
          const evaluate=()=>{const se=document.scrollingElement;paint(se?se.scrollTop:0,se?se.scrollHeight:0,window.innerHeight);};
          evaluate();
          window.addEventListener('scroll',evaluate,{passive:true});
          window.addEventListener('resize',evaluate);
          const stopExtent=observeScrollExtent(el,evaluate);
          return()=>{window.removeEventListener('scroll',evaluate);window.removeEventListener('resize',evaluate);stopExtent();};
        }
        const evaluate=()=>{
          const gaps=paint(el.scrollTop,el.scrollHeight,el.clientHeight);
          setAppAtBottom(isAtBottom(gaps));
          setAppScrolledFromTop(isScrolledFromTop(gaps));
        };
        evaluate();
        el.addEventListener('scroll',evaluate,{passive:true});
        const stopExtent=observeScrollExtent(el,evaluate);
        return()=>{el.removeEventListener('scroll',evaluate);stopExtent();};
      },[mode,docScroll]);
      // Root-scroll invariant on MOUNT and on BFCache restore — nothing else. The division of
      // labour, stated explicitly because this effect used to overreach (Q6, round 8):
      //   • the scroll-ownership layout effect above owns the position on a mode switch (restore
      //     for the guide, top for everything else), and fullReset owns it on a reset (it zeroes
      //     both scrollers inline, and clears the guide's saved position with them).
      //   • THIS effect owns only the clamped-layout root invariant: the app mounts in Classic
      //     (the current tab is never persisted, so a cold start or refresh ALWAYS lands there)
      //     where html/body/#root are clamped and a non-zero root scrollTop would permanently
      //     offset the fixed layout. A FRESH LOAD can hand back exactly that — history scroll
      //     restoration on a reload replays the offset the document had last session, which may
      //     have been guide mode's legitimately-scrolled document, into a layout that is now
      //     clamped — so mount + a non-persisted pageshow re-assert it, with rAF + setTimeout
      //     because iOS Safari applies that restoration AFTER the event fires. Resets
      //     window/documentElement/body (defense-in-depth — body has overflow:hidden so it can't
      //     scroll, but a restore might try anyway) AND the inner container, the surface the user
      //     actually scrolls in the clamped modes.
      //   • A BFCACHE RESTORE (event.persisted) IS SKIPPED ENTIRELY (Q3, round 11) — the opposite
      //     case, and the reason the gate exists. `pageshow` fires for both a genuine load and a
      //     back-forward-cache restore, and a restore is not a navigation: the JS heap is kept
      //     alive, so the app comes back in the SAME mode with the SAME DOM it left. Whatever
      //     scroll offset the browser hands back is therefore the one that belongs to this layout
      //     — in guide mode the reader's place, in a clamped mode a zero the document could not
      //     have moved off — and zeroing it is pure loss. That is exactly the mistake round 8
      //     removed from visibilitychange (come back, lose your place in How to Play), surviving
      //     in a second event; round 9 then built the guide's position preservation on top of it.
      //     The invariant above is untouched by the gate: a restore cannot smuggle in a stale
      //     offset, because the mode that produced it is the mode being restored.
      //   • BACKGROUNDING NOW MOVES NOTHING — a deliberate behaviour CHANGE (Q6, round 8), not a
      //     tidy-up. There was a visibilitychange→reset listener here calling this same reset(),
      //     which zeroes the inner scroller too: switching apps and coming back jumped you to the
      //     top of whatever you were reading. That was invisible for a long time only because the
      //     clamped modes rarely overflow, and round-7's guide doc-scroll made it unmissable ("come
      //     back, lose your place in How to Play"). Removed rather than special-cased to the guide:
      //     foregrounding an app is not a navigation, the browser runs no scroll restoration for
      //     it, so there was never a root-scroll invariant for this listener to defend — in EVERY
      //     mode. The guide's in-flight scroll writer is cancelled when the app is backgrounded
      //     by GuidePage itself, which is where that concern belongs.
      useEffect(()=>{const reset=()=>{window.scrollTo(0,0);if(document.documentElement.scrollTop!==0)document.documentElement.scrollTop=0;if(document.body.scrollTop!==0)document.body.scrollTop=0;if(appScrollRef.current)appScrollRef.current.scrollTop=0;};const onPageShow=(e: PageTransitionEvent)=>{if(e.persisted)return;reset();requestAnimationFrame(reset);setTimeout(reset,0);};reset();window.addEventListener('pageshow',onPageShow);return()=>{window.removeEventListener('pageshow',onPageShow);};},[]);
      // Keyboard input — desktop convenience, mobile-no-op.
      // Three categories of keys are handled, all subject to the same gates: not in
      // an input/textarea/contentEditable, no modifiers held (Cmd+L stays browser),
      // not a key repeat or IME composition.
      //
      // 1. Number keys 0–9 trigger the visible answer-grid button at that 0-based
      //    index, left-to-right and top-to-bottom. Indexing matches the book's day
      //    codes (Sun=0 ... Sat=6) for day grids; positional for Deduction Month/Year.
      // 2. Letters (case-insensitive) and ArrowLeft/Right walk the DOM for a button
      //    with matching data-key attribute and click the first one that's both
      //    visible (offsetParent != null) and not locked (no pointer-events-none class).
      //    Game-loop binds: N (New/Begin/Reset), R (Reveal), O (Override), C (Show/Hide
      //    Codes), S (Reset Stats), ← Back, → Forward.
      // 3. Special direct-action keys, no DOM button needed:
      //    - Mode switching: K Classic, F Flash, B Blitz, A AoX, D Deduction, L Lookup
      //    - H toggles to/from guide (returns to prevNonGuideModeRef when leaving guide)
      //    - G toggles the settings popover
      //
      // All keyboard activations bypass CSS pointer-events via .click(), so the
      // pointer-events-none className check is mandatory to mirror real-click locks.
      // settingsOpen is declared here — above the keyboard effect that toggles it (G key) — so it's
      // not read before its declaration (the compiler flags accessing a binding before it's declared).
      const [settingsOpen,setSettingsOpen]=useState(false);
      // Q3: the "Updating…" overlay (BootOverlay updating) — three triggers: the Settings "Check for
      // updates" button raises it once a check has FOUND something (Q7's applier below — never on a
      // press that turns out to have nothing to get), the auto-update-on-open effect below shows it
      // for at least MIN_UPDATING_MS while a WAITING new version activates (both cleared by their
      // reload), and the Q2 build-change flash effect shows it for exactly that hold — no reload —
      // when a boot detects an update that already landed silently (cleared by its own hold-end).
      const [updating,setUpdating]=useState(false);
      // Q3 Loading screen: remove index.html's #boot splash once BOTH are true —
      //   • it has been VISIBLE ≥0.5s (bootHoldRemaining, anchored to the __bootShownAt rAF stamp — not
      //     navigation start), so a fast cached load doesn't flash it for a single frame (which read
      //     like a glitch); on a slow load it has already served its time → the hold clamps to 0; and
      //     the boot right after an update — auto OR the manual Check-for-updates reload, BOTH stamp
      //     the one-time cg-skip-boot-hold flag, consumed here — skips the hold entirely (the user
      //     just watched the Updating screen ≥1s, so the splash shows only as long as the real boot
      //     takes);
      //   • the real stylesheet has APPLIED — the build swaps the render-blocking CSS <link> into a
      //     preload (vite.config.js bootCssPreload) so the splash can be the page's first paint, and
      //     the swap stamps window.__cssReady + fires 'app-css-ready'. Removing #boot before then would
      //     reveal an unstyled app: the module script is NOT CSSOM-blocked (it precedes the link), so on
      //     a SW-cached load React commits before the CSS lands. In dev/tests no preload link exists
      //     (CSS arrives through the JS module graph before mount) → the querySelector check is ready.
      // When an update-overlay path below has claimed the handoff (updateEngagedRef — the auto-update
      // flow or the Q2 build-change flash), finish leaves #boot alone — the Updating overlay replaces
      // it (the updating effect), never a frame with neither.
      const updateEngagedRef=useRef(false);
      // The raw consumed cg-skip-boot-hold value, written by the boot-hold effect below (which owns
      // the flag's one-per-boot consumption) and read by the Q2 build-change flash effect after it —
      // same-kind effects run in declaration order, so the write is always ahead of the read.
      const skipHoldConsumedRef=useRef(false);
      // Set by the auto-update flow's engage(): a gated reload is coming (success or the safety net),
      // so the Updating overlay must stay up until that navigation — the Q2 flash's hold-end checks
      // this before revealing the app (the rare same-boot overlap: a freshly-downloaded new build
      // AND an even newer version already waiting).
      const updateReloadPendingRef=useRef(false);
      // ══ Q7 (round 11): "Check for updates" ACTUALLY CHECKS ═══════════════════════════════════
      // It used to show the Updating screen and run forceReloadLatest unconditionally — claiming an
      // update on every press and destroying the offline copy even on the presses where nothing had
      // changed. Now it asks first. The DETECTOR (why it is a build-identity file and not a fetch
      // with cache:'reload', not DEPLOY_TS, not registration.update()) is documented at length in
      // lib/updateCheck.ts; what lives here is the UI state and the APPLIER.
      //
      // STATE — one button whose LABEL IS ITS STATE, never a second line or a toast (owner's call).
      // idle → checking → (current | offline) → idle after UPDATE_RESULT_MS, or → the Updating
      // overlay when there is something to get. A press during a RESULT starts another check (the
      // result is information, not a mode you have to dismiss); a press during 'checking' cannot
      // happen — the button is disabled — and is refused anyway so a synthetic click cannot start a
      // second in-flight check.
      //
      // The applier reuses the auto-update path wholesale: SKIP_WAITING to the waiting worker, one
      // reload through makeUpdateReloadGate so the MIN_UPDATING_MS visible hold is honoured and the
      // reload fires at most once, and markSkipBootHold so the boot it causes doesn't stack a second
      // artificial splash hold. That KEEPS THE OFFLINE COPY, which the old unconditional
      // forceReloadLatest destroyed every time.
      // forceReloadLatest is still reachable, and deliberately — but be exact about WHEN, because
      // the round-7 class is not it. It fires from inside this applier and nowhere else, on the two
      // ways the gentle path can fail to deliver what the check promised: no registration to hand
      // off to at all, or no controllerchange within UPDATE_HANDOFF_MS. Having promised an update,
      // the button must produce one.
      // The round-7 class — an asset whose bytes changed while its precache revision did not, which
      // Workbox will never re-download — is now handled a step earlier and better: Q10b's
      // scripts/precacheIntegrity.mjs FAILS THE BUILD unless every revision in dist/sw.js is the
      // md5 of the file actually shipped, so such a build cannot exist to be installed. A client
      // still carrying one from round 7 is cured by the next deploy through this same gentle path
      // (its cached revision is the stale one, the new manifest carries the true md5, so Workbox
      // does re-download). What no client-side button can cure is an edge serving wrong bytes for a
      // correct revision: the check's own fetch would be served the same stale bytes and say "up to
      // date". That is a server-side problem and belongs to the deploy, not to this button.
      const [updateCheck,setUpdateCheck]=useState<UpdateCheckState>('idle');
      const updateResultTimerRef=useRef<number|undefined>(undefined);
      const updateCheckAbortRef=useRef<AbortController|null>(null);
      const applyUpdate=useCallback((reg: ServiceWorkerRegistration|null)=>{
        updateReloadPendingRef.current=true; // the overlay is owned through to a navigation now
        setUpdating(true);
        // No service worker at all (unsupported, blocked, or a registration that failed — the state
        // Q10a now reports): there is nothing to hand off to, so the hammer IS the update path.
        if(!reg){window.setTimeout(forceReloadLatest,MIN_UPDATING_MS);return;}
        // `settled` = this applier is FINISHED — it has either navigated (the gate's reload) or given
        // up (the handoff deadline below, which hands over to forceReloadLatest). Nothing it started
        // still matters after that, and one thing actively harms: reg.update() may still be in flight
        // when forceReloadLatest unregisters the worker, and the browser then rejects it with
        // InvalidStateError — an error the app MANUFACTURED by abandoning the operation, reported as
        // if the update had failed on its own. So the deadline marks the applier settled first, and
        // everything the applier still owns (the report below, the SKIP_WAITING handoff, the
        // controllerchange listener) is torn down or suppressed against that one flag.
        let settled=false;
        const gate=makeUpdateReloadGate({minHoldMs:MIN_UPDATING_MS,reload:()=>{settled=true;markSkipBootHold();window.location.reload();}});
        gate.armHold();
        const onControllerChange=()=>gate.onHandoff();
        navigator.serviceWorker.addEventListener('controllerchange',onControllerChange,{once:true});
        const handOff=(w: ServiceWorker|null|undefined)=>{if(w&&!settled)w.postMessage({type:'SKIP_WAITING'});};
        // A worker already parked in `waiting` is the update — messaging it directly is the whole
        // job. Only when there is none do we go to the network, and update() is used here as the
        // APPLIER it is: it fetches + installs, and the new worker arrives as `waiting` (or as
        // `installing` we then wait out). A resolved update() that produces neither is the failed
        // install reproduced in the Q7 research; the safety net below covers it.
        if(reg.waiting)handOff(reg.waiting);
        else reg.update().then(()=>{
          if(reg.waiting){handOff(reg.waiting);return;}
          const installing=reg.installing;
          if(installing)installing.addEventListener('statechange',()=>{if(installing.state==='installed')handOff(reg.waiting??installing);});
        }).catch(err=>{if(!settled)captureError(err,{where:'update-apply'});});
        window.setTimeout(()=>{if(settled)return;settled=true;navigator.serviceWorker.removeEventListener('controllerchange',onControllerChange);gate.cancel();forceReloadLatest();},UPDATE_HANDOFF_MS);
      },[]);
      const onCheckUpdates=useCallback(()=>{
        if(updateCheck==='checking')return;
        if(updateResultTimerRef.current!==undefined){window.clearTimeout(updateResultTimerRef.current);updateResultTimerRef.current=undefined;}
        updateCheckAbortRef.current?.abort();
        const controller=new AbortController();
        updateCheckAbortRef.current=controller;
        setUpdateCheck('checking');
        void(async()=>{
          let reg: ServiceWorkerRegistration|null=null;
          try{if(typeof navigator!=='undefined'&&'serviceWorker' in navigator)reg=(await navigator.serviceWorker.getRegistration())??null;}catch{/* no registration readable — the identity fetch still answers the question */}
          if(controller.signal.aborted)return;
          const verdict=await checkForUpdate({
            ownId:readOwnBuildId(document),
            url:buildIdUrl(import.meta.env.BASE_URL,makeCheckNonce()),
            hasWaitingWorker:Boolean(reg?.waiting),
            // Wrapped, not passed by reference: a bare `fetch` detached from window throws Illegal
            // Invocation in some engines, and an engine with no fetch at all must throw INSIDE
            // checkForUpdate's try (where it reads as 'offline') rather than out here.
            fetchImpl:(input,init)=>fetch(input,init),
            signal:controller.signal,
          });
          if(controller.signal.aborted)return;
          if(verdict==='update'){applyUpdate(reg);return;}
          setUpdateCheck(verdict);
          updateResultTimerRef.current=window.setTimeout(()=>{updateResultTimerRef.current=undefined;setUpdateCheck('idle');},UPDATE_RESULT_MS);
        })();
      },[updateCheck,applyUpdate]);
      // Closing ⚙ Settings ends the whole interaction early: the pending revert timer is cleared,
      // the label is back at rest for the next open, and an in-flight check is ABORTED rather than
      // left to land behind a panel the user has just dismissed — a full-screen Updating overlay
      // appearing after the menu closed would be the app acting on its own. Fires only when the
      // state actually moved while the panel was open, which is exactly when there is anything to
      // undo (useSettingsCloseEffect's contract).
      useSettingsCloseEffect(settingsOpen,[updateCheck],()=>{
        updateCheckAbortRef.current?.abort();
        if(updateResultTimerRef.current!==undefined){window.clearTimeout(updateResultTimerRef.current);updateResultTimerRef.current=undefined;}
        setUpdateCheck('idle');
      });
      // Unmount teardown: drop an in-flight check and any pending revert. The refs are this
      // component's own timer/abort handles, so reading them at teardown is exactly the point.
      useEffect(()=>()=>{updateCheckAbortRef.current?.abort();if(updateResultTimerRef.current!==undefined)window.clearTimeout(updateResultTimerRef.current);},[]);
      useEffect(()=>{
        let disposed=false;
        let cssFallbackId: number | undefined;
        const finish=()=>{if(!disposed&&!updateEngagedRef.current)dismissBootSplash();};
        // Consume the skip flag unconditionally (it must never linger) and share the raw value with
        // the Q2 build-change flash effect below via skipHoldConsumedRef (its silent-restamp
        // suppression), but only HONOR it for the hold when no update attempt is pending: on the
        // safety-retry boot (worker still waiting, attempts>0) the 500ms hold is what covers the
        // async getRegistration→updateEngagedRef claim — skipping it there could reveal the app for
        // a few frames before the Updating overlay paints.
        const skippedHold=consumeSkipBootHold();
        skipHoldConsumedRef.current=skippedHold;
        const id=window.setTimeout(()=>{
          if(disposed)return;
          if(appCssApplied())finish();
          else{
            window.addEventListener('app-css-ready',finish,{once:true});
            // Escape hatch (the css twin of the SW path's safety timeout): if the preload link fires
            // neither onload nor onerror — rel=preload unsupported, or an extension stripped the inline
            // handlers — nothing would EVER signal readiness and the splash would sit up forever. After
            // 4s, do exactly what the link's own onload does: swap it to a live stylesheet, stamp
            // __cssReady, fire 'app-css-ready' (which runs finish above and also unblocks the
            // auto-update path's css gate).
            cssFallbackId=window.setTimeout(()=>{
              if(disposed||appCssApplied())return;
              const link=document.querySelector('link[rel="preload"][as="style"]') as HTMLLinkElement | null;
              if(link)link.rel='stylesheet';
              window.__cssReady=true;
              window.dispatchEvent(new Event('app-css-ready'));
            },4000);
          }
        },bootHoldRemaining(window.__bootShownAt,performance.now(),skippedHold&&readUpdateAttempts()===0));
        return ()=>{disposed=true;window.clearTimeout(id);if(cssFallbackId!==undefined)window.clearTimeout(cssFallbackId);window.removeEventListener('app-css-ready',finish);};
      },[]);
      // Q3 auto-update-on-open: in PRODUCTION only, register the SW (src/sw.ts, DYNAMICALLY imported so
      // the registration never runs in dev/tests and its chunk never loads there; registering also kicks off src/sw.ts's
      // background registration.update() prefetch) and — IN PARALLEL, since this check needs only the
      // browser's registration, never that module — look for a new version that installed on a previous
      // visit and is WAITING. If one is: claim the #boot handoff, wait for the css-ready gate the normal
      // boot path enforces (the Updating overlay is styled by the real stylesheet — entering sooner would
      // paint it unstyled), show the Updating screen (the updating effect below removes #boot AFTER the
      // overlay commits), message the waiting worker DIRECTLY ({type:'SKIP_WAITING'} — a handler the
      // generateSW worker ships natively, so unlike any handle src/sw.ts could hand back this cannot race
      // the register module's own registration and no-op), and reload exactly ONCE through the reload
      // gate (makeUpdateReloadGate): only after BOTH the SW handoff (controllerchange — which can also
      // fire for unrelated SW handoffs, hence the gate's one-shot guard — or the 4s safety net) AND the
      // MIN_UPDATING_MS visible hold, so the Updating screen always registers (activating an
      // already-waiting worker takes tens of ms, and an ungated reload outraces the overlay's paint —
      // the owner never saw the screen). The gate's reload also stamps cg-skip-boot-hold, so the boot
      // it triggers skips the splash's artificial 500ms hold — the full flow: logo → Updating ≥1s →
      // reload → the splash shows only as long as the real boot takes → the app. Cold-open only — NO
      // resume/focus re-check (owner's call). All SW behaviour is on-device. This flow only covers an
      // update still WAITING at boot; the other half — one whose activation completed BETWEEN
      // sessions, so nothing is waiting here — is the Q2 build-change flash effect below. The whole flow is wrapped
      // in the sessionStorage attempt counter (the loop breaker — see readUpdateAttempts): after 2
      // straight failed attempts the flow is SKIPPED, the counter cleared, and the app renders on the
      // old version instead of looping Updating→reload forever.
      // Q10a (round 11) — BOTH ways the registration can fail now REPORT instead of vanishing. The
      // dynamic import's rejection (the ./sw.js chunk itself failing to load) is captured below, and
      // the registration call's own failure is captured inside src/sw.ts via onRegisterError. Either
      // one leaves the app running with NO service worker — no offline copy, no update path, and
      // (before this) nothing anywhere saying so: an agent hit exactly that state in July 2026 and it
      // was invisible. These are the two halves because they fail independently — the chunk can load
      // and register() still be rejected (an unsupported scope, a blocked SW, a 404 on sw.js).
      useEffect(()=>{
        if(!import.meta.env.PROD||typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
        let cancelled=false;
        let engageOnCss: (()=>void) | null=null;
        let gate: ReturnType<typeof makeUpdateReloadGate> | null=null;
        // Held so the cleanup can DETACH it: {once:true} only removes a listener that actually fired,
        // and the whole point of the 4s safety net is that controllerchange may never arrive at all.
        // Without both halves this effect leaks a live listener onto navigator.serviceWorker — a
        // global that outlives the component — holding its gate and closure alive for the page's life.
        let onControllerChange: (()=>void) | null=null;
        import('./sw.js').catch(err=>captureError(err,{where:'sw-module-import'})); // Q10a: never swallowed — a chunk that won't load means NO service worker at all (see the note above)
        navigator.serviceWorker.getRegistration().then(reg=>{
          if(cancelled)return;
          const waiting=reg?.waiting;
          if(!waiting){clearUpdateAttempts();return;} // nothing waiting — a healthy boot resets the loop breaker
          const attempts=readUpdateAttempts();
          if(attempts>=2){
            // Loop breaker tripped: two consecutive attempts already failed (SKIP_WAITING is broken /
            // the waiting worker can't take control). Do NOT re-enter the Updating flow — clear the
            // counter and boot normally on the OLD version (sw.ts's background update() may still
            // repair the waiting worker for a later launch, and Check for updates stays reachable).
            clearUpdateAttempts();
            return;
          }
          updateEngagedRef.current=true; // claim the #boot handoff NOW, before the css gate — the normal boot effect must not remove the splash while the overlay is still pending
          const engage=()=>{
            if(cancelled)return;
            writeUpdateAttempts(attempts+1);
            updateReloadPendingRef.current=true; // the overlay is now owned through to this flow's reload — the Q2 flash's hold-end must not drop it
            setUpdating(true); // #boot comes down only after this commits (the updating effect below)
            // The reload gate (armed now, released by whichever handoff arrives): both the success
            // reload and the safety reload go through it, so both honor the min-hold, fire at most
            // once, and stamp the next boot's splash skip just before navigating away.
            gate=makeUpdateReloadGate({minHoldMs:MIN_UPDATING_MS,reload:()=>{markSkipBootHold();window.location.reload();}});
            gate.armHold();
            onControllerChange=()=>{clearUpdateAttempts();gate?.onHandoff();};
            navigator.serviceWorker.addEventListener('controllerchange',onControllerChange,{once:true}); // success — reset the loop breaker, then the gated one-shot reload. {once:true} costs nothing: the gate is already one-shot, so only the FIRST controllerchange has ever done anything
            waiting.postMessage({type:'SKIP_WAITING'});
            // Safety net: if activation never fires controllerchange (skipWaiting failed), don't leave the
            // Updating screen stuck — a PLAIN reload after a few seconds (the old worker serves the old app
            // again; the update retries next launch). NEVER forceReloadLatest here: it wipes every cache,
            // and offline that bricks the app — the manual Check-for-updates button keeps that big hammer.
            // The attempt counter deliberately SURVIVES this reload (sessionStorage) — that's what limits
            // the retry to two rounds via the >=2 check above. (At 4s the min-hold is long done, so this
            // handoff reloads immediately through the gate.)
            window.setTimeout(()=>{if(!cancelled)gate?.onHandoff();},4000);
          };
          if(appCssApplied())engage();
          else{engageOnCss=engage;window.addEventListener('app-css-ready',engage,{once:true});}
        }).catch(()=>{});
        return ()=>{cancelled=true;gate?.cancel();if(engageOnCss)window.removeEventListener('app-css-ready',engageOnCss);if(onControllerChange)navigator.serviceWorker.removeEventListener('controllerchange',onControllerChange);};
      },[]);
      // Q2 (round 6): the cold-open build-change "Updating" flash — the visible signal for updates
      // that land SILENTLY, with nothing waiting for the auto flow above to bridge. The primary case:
      // closing the app releases the old worker's last client, the browser completes the waiting
      // worker's activation in the background, and the next open is already the new version (an
      // evicted Safari tab's fresh download reads the same). Detection is the plain-localStorage
      // build stamp (lib/buildStamp): every boot compares the stored stamp against this build's
      // DEPLOY_TS and then RESTAMPS — the one detection per boot, and where everything else that
      // reacts to a build change (the Q6 update-signal dots) hooks in. On a mismatch the SAME
      // Updating screen holds for MIN_UPDATING_MS — no reload; hold-end reveals the app — under the
      // auto flow's exact discipline: claim the #boot handoff synchronously (the boot-hold effect
      // must leave the splash to the overlay), engage only once the real stylesheet has applied
      // (appCssApplied / app-css-ready — an unstyled Updating frame must never paint), and let the
      // updating effect below take #boot down only after the overlay commits. Two boots restamp
      // SILENTLY, with no screen: the first-ever visit (no stamp — nothing to announce) and the boot
      // right after the REAL Updating flow (skipHoldConsumedRef — that flow already showed the
      // screen ≥1s and its reload lands on a changed stamp by definition; without this suppression
      // every real update would be chased by a second screen back-to-back, the exact thing the owner
      // ruled out). If the auto flow engages during the hold (an even newer version already
      // waiting), hold-end defers to its reload (updateReloadPendingRef) instead of revealing the
      // app for a moment before the navigation.
      // The two update-signal dot states (Q6) mirror the PERSISTED flags (src/changelog — the
      // flags alone survive reloads; state is just the render mirror): the detection below marks
      // both on every build change, opening Settings retires the gear's (the effect further down),
      // and the first tap on the footer's Changelog link retires the link's — the two-stage
      // breadcrumb to the changelog popup. Declared HERE, above the effect that sets them.
      const [gearDot,setGearDot]=useState(()=>readUpdateDot(GEAR_DOT_KEY));
      const [changelogDot,setChangelogDot]=useState(()=>readUpdateDot(CHANGELOG_DOT_KEY));
      useEffect(()=>{
        const current=DEPLOY_TS.toISOString();
        const changed=buildChanged(readBuildStamp(),current);
        writeBuildStamp(current); // restamp on EVERY boot — the stamp always names the build that last ran
        // The changelog breadcrumb (Q6) lights on EVERY build change — including one the real
        // Updating flow just bridged (the skip-hold boot below suppresses only the SCREEN; the
        // changelog still has news either way). Persisted flags + the render mirrors.
        if(changed){markUpdateDot(GEAR_DOT_KEY);markUpdateDot(CHANGELOG_DOT_KEY);setGearDot(true);setChangelogDot(true);}
        if(!changed||skipHoldConsumedRef.current)return;
        updateEngagedRef.current=true; // claim the #boot handoff NOW — the splash hands off to the overlay, never to the app
        let cancelled=false;
        let holdId: number | undefined;
        let engageOnCss: (()=>void) | null=null;
        const engage=()=>{
          if(cancelled)return;
          setUpdating(true); // #boot comes down only after this commits (the updating effect below)
          holdId=window.setTimeout(()=>{if(!updateReloadPendingRef.current)setUpdating(false);},MIN_UPDATING_MS);
        };
        if(appCssApplied())engage();
        else{engageOnCss=engage;window.addEventListener('app-css-ready',engage,{once:true});}
        return()=>{cancelled=true;if(holdId!==undefined)window.clearTimeout(holdId);if(engageOnCss)window.removeEventListener('app-css-ready',engageOnCss);};
      },[]);
      // The update paths' #boot handoff (paired with updateEngagedRef above — the auto-update flow
      // and the Q2 build-change flash): remove the splash only AFTER the Updating overlay has
      // COMMITTED — effects run post-commit, so by now the overlay is in the DOM and there is never
      // a frame with neither splash nor overlay. A no-op for the manual Check-for-updates trigger
      // (#boot is long gone by then; dismissBootSplash is idempotent).
      useEffect(()=>{if(updating)dismissBootSplash();},[updating]);
      useEffect(()=>{const onKey=(e: KeyboardEvent)=>{
        if(e.repeat||e.isComposing)return;
        // Tab: toggle the mode selector dropdown. Plain Tab only — Ctrl+Tab, Ctrl+Shift+Tab,
        // Shift+Tab, Alt+Tab all pass through to the browser. Works universally, including
        // when an input is focused (Esc/Enter already blur inputs, so the standard "leave
        // this input" role of Tab is unneeded). focus() before click() so the dropdown's
        // arrow-nav handler (handleTriggerKeyDown on the trigger) sees subsequent keys.
        if(e.key==='Tab'){
          if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
          // An open settings MODAL (Save Defaults / the defaults manager / Clear confirm / Changelog) owns Tab while
          // it's up (its scrim's focus trap) — opening the mode dropdown behind an aria-modal dialog
          // would break the modal contract. The trap already stopPropagation()s presses inside its
          // tree; this covers presses that start outside it.
          if(document.querySelector('[data-settings-modal]'))return;
          if(modeSelectRef.current){
            const trigger=modeSelectRef.current.querySelector('button');
            if(trigger){e.preventDefault();trigger.focus();trigger.click();}
          }
          return;
        }
        if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
        const k=e.key;
        const ae=document.activeElement as HTMLElement | null;
        if(ae){const tag=ae.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||ae.isContentEditable)return;}
        // Category 1: 0–9 → answer grid
        if(k>='0'&&k<='9'){
          const grids=document.querySelectorAll<HTMLElement>('[data-answer-grid="true"]');
          let visible: HTMLElement | null=null;
          for(const g of grids){if(g.offsetParent!==null){visible=g;break;}}
          if(!visible)return;
          const idx=parseInt(k,10);
          const btn=visible.children[idx] as HTMLElement | undefined;
          if(!btn||btn.tagName!=='BUTTON')return;
          if(btn.className.includes('pointer-events-none'))return;
          e.preventDefault();
          btn.click();
          return;
        }
        // Determine target key string for letters and arrows
        let dataKey=null;
        if(k==='ArrowLeft')dataKey='ArrowLeft';
        else if(k==='ArrowRight')dataKey='ArrowRight';
        else if(k.length===1){const upper=k.toUpperCase();if(upper>='A'&&upper<='Z')dataKey=upper;}
        if(!dataKey)return;
        // Category 3a: mode switching — direct switchMode (no DOM button per mode)
        const MODE_KEYS: Record<string, string>={K:'classic',F:'flash',B:'blitz',A:'aox',D:'deduction',L:'lookup'};
        if(MODE_KEYS[dataKey]){e.preventDefault();switchMode(MODE_KEYS[dataKey]);setSettingsOpen(false);return;}
        // Category 3b: H — toggle to/from guide, preserving previous non-guide mode
        if(dataKey==='H'){e.preventDefault();switchMode(m=>m==='guide'?(prevNonGuideModeRef.current||'classic'):'guide');setSettingsOpen(false);return;}
        // Category 3c: G — toggle settings popover
        if(dataKey==='G'){e.preventDefault();setSettingsOpen(v=>!v);return;}
        // Category 2: data-key DOM walk for game-loop letters and arrows
        const tagged=document.querySelectorAll<HTMLElement>(`[data-key="${dataKey}"]`);
        for(const btn of tagged){
          if(btn.tagName!=='BUTTON')continue;
          if(btn.offsetParent===null)continue;
          if(btn.className.includes('pointer-events-none'))continue;
          e.preventDefault();
          btn.click();
          return;
        }
      };window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[switchMode]);
      // Q4: install the global press-drag-release input controller (slide-off-to-cancel on every button
      // + answer-grid drag-to-select). One set of document pointer listeners; cleanup on unmount.
      useEffect(()=>installPointerGestures(),[]);
      function applyMinValue(val: number){if(val!==minY)setMinY(val);}
      function applyMaxValue(val: number){if(val!==maxY)setMaxY(val);}
      const commitMin=()=>{const p=parseInt(minInputVal);if(isNaN(p)){setMinInputVal(String(minY));return;}const v=Math.max(1,Math.min(maxY,p));applyMinValue(v);setMinInputVal(String(v));};
      const commitMax=()=>{const p=parseInt(maxInputVal);if(isNaN(p)){setMaxInputVal(String(maxY));return;}const v=Math.max(minY,Math.min(10000,p));applyMaxValue(v);setMaxInputVal(String(v));};
      useEffect(()=>{if(document.activeElement===minInputRef.current)return;setMinInputVal(String(minY));},[minY]);
      useEffect(()=>{if(document.activeElement===maxInputRef.current)return;setMaxInputVal(String(maxY));},[maxY]);
      const pushLookupHistory=(entry: LookupEntry)=>setLookupHistory(prev=>[entry,...prev].slice(0,20));
      const moveHistoryEntryToTop=(id: string)=>setLookupHistory(prev=>{const idx=prev.findIndex(e=>e.id===id);if(idx<=0)return prev;const entry=prev[idx];return[entry,...prev.slice(0,idx),...prev.slice(idx+1)];});
      const clearLookupHistory=()=>setLookupHistory([]);
      // Date format / randomFormat / leapChance / janFebChance / julianChance now from the
      // settings store (bound at top of App). Semantics unchanged:
      //   dateFormat: 'written-mdy'|'written-dmy'|'numeric-mdy'|'numeric-dmy'|'numeric-ymd'.
      //   randomFormat overrides the selected format for game-mode dates only (Lookup + DEPLOY_TS ignore it).
      //   leap/janFeb/julianChance: Option-A date-generation biases (apply to all game modes; Lookup unaffected).
      //   julianChance's picker is locked when useJulian is off OR the year range is all-Gregorian
      //   (minY>=1583) or all-Julian (maxY<=1581); year 1582 is mixed so any range including it is unlocked.
      // FORMAT_IDS and rollFormat are defined at module scope (see top of file)
      // so the dateByMode useState initializer can also use them.
      // fmtDate: every date stamps _fmt (always present), so display always uses
      // the date's stored format. Falls through to dateFormat only if a malformed
      // legacy date without _fmt slips through (defensive).
      const fmtDate=(y: number,m: number,d: number,storedFmt?: FormatId)=>fmt(y,m,d,storedFmt||dateFormat);
      // Generate a new game-mode date with the current settings baked in.
      // Stamps _fmt and _jul at generation. _fmt is always present — random roll
      // when randomFormat is on, current dateFormat when off. The display layer always
      // trusts _fmt.
      // On a Cat A unanswered untouched live date, format setting changes
      // can trigger a fresh genDate call via regenDecisionFor (Random off→on always; Random
      // on→off and dropdown changes regen only on _fmt mismatch with the now-active format).
      // Wrong guesses defer format regen — the new format only applies on the next genDate.
      // _jul is the calendar system in effect when the date was generated; used by stack
      // entries (and deduction) so revisiting a past question shows codes consistent with
      // the system that was active when it was created. Live questions ignore _jul and use
      // current useJulian, so toggling Julian on a live (un-guessed) date updates the answer.
      const genDate=(lo: number,hi: number)=>{
        const dt=randomDate(lo,hi,useJulian,leapChance,janFebChance,julianChance);
        dt._fmt=randomFormat?rollFormat():dateFormat;
        dt._jul=useJulian;
        return dt;
      };
      const settingsRef=useRef<HTMLDivElement | null>(null);
      const settingsPopoverRef=useRef<HTMLDivElement | null>(null);
      // Full Reset state: armed=true means the user tapped once and the next tap fires.
      // Auto-disarms after a short timer, when settings closes, or when the user taps any
      // other interactive control inside the popover. Implemented as a per-tap state machine
      // rather than a dialog so the destructive nature is communicated by the in-place label
      // and color change without a modal interruption.
      const [fullResetArmed,setFullResetArmed]=useState(false);
      const fullResetBtnRef=useRef<HTMLButtonElement | null>(null);
      const fullResetTimerRef=useRef<ReturnType<typeof setTimeout> | null>(null);
      // Save Defaults (Q7) confirmation popup state. pendSettings snapshots the full 14-value
      // panel at OPEN (the popup doesn't edit panel values); pendPrefs seeds the four editable
      // mode-screen rows from the live modePrefs store at open, and pendSeed keeps that seed for
      // the shared card's dirty-row comparison (Q5 round-6). Edits touch ONLY this pending
      // snapshot — Cancel/scrim/Back/settings-close discard it; Save commits it (aoxN normalized).
      const [saveDefaultsOpen,setSaveDefaultsOpen]=useState(false);
      const saveDefaultsCardRef=useRef<HTMLDivElement | null>(null); // the dialog card — focused on open (the modal a11y contract below)
      const pendSettingsRef=useRef<SettingsValues | null>(null);
      const [pendPrefs,setPendPrefs]=useState<PrefDefaults>(()=>effectivePrefDefaults(null));
      const [pendSeed,setPendSeed]=useState<PrefDefaults>(()=>effectivePrefDefaults(null));
      // Defaults manager (Q12 → editable, Q5 round-6) popup state — the footer link's window onto
      // the saved (or, with nothing saved, factory) defaults, on the SAME shared card as the Save
      // popup. managePrefs is its pending snapshot, seeded from the EFFECTIVE defaults (defPrefs)
      // at open; the seed itself needs no copy — defPrefs cannot change while the modal is up
      // (this modal owns the only editor). Cancel/scrim/Back/settings-close discard edits.
      const [manageDefaultsOpen,setManageDefaultsOpen]=useState(false);
      const manageDefaultsCardRef=useRef<HTMLDivElement | null>(null); // its dialog card — same focus-on-open contract
      const [managePrefs,setManagePrefs]=useState<PrefDefaults>(()=>effectivePrefDefaults(null));
      // Clear-saved-defaults confirm popup (Q5 round-6): the footer's Clear link asks before it
      // forgets the snapshot — a small modal in the established recipe (Cancel + a red-tier
      // Clear), full scrim/focus/Escape/Back parity with the other settings modals.
      const [clearConfirmOpen,setClearConfirmOpen]=useState(false);
      const clearConfirmCardRef=useRef<HTMLDivElement | null>(null); // its dialog card — same focus-on-open contract
      // Changelog popup (Q6) — the plain-words what-changed list (src/changelog), opened from the
      // footer's Changelog link. Its dot states (gearDot / changelogDot — the breadcrumb here)
      // live up with the build-stamp detection that lights them.
      const [changelogOpen,setChangelogOpen]=useState(false);
      const changelogCardRef=useRef<HTMLDivElement | null>(null); // its dialog card — same focus-on-open contract
      // aoxIsFresh — reported up from AoxMode via the onFreshChange prop. AoxMode's ~24
      // internal state fields are otherwise opaque to the App, so we mirror their combined
      // freshness state here to use in isFullyReset (the Full Reset dim/lock check below).
      // Initialized to true (matches fresh-mount reality); AoxMode's useEffect calls
      // onFreshChange on every freshness flip so this stays in sync.
      const [aoxIsFresh,setAoxIsFresh]=useState(true);
      // classicIsFresh — reported up from ClassicMode (its state is self-owned now), same as
      // aoxIsFresh. Used by isFullyReset so the Full Reset button reflects Classic's activity.
      const [classicIsFresh,setClassicIsFresh]=useState(true);
      const [flashIsFresh,setFlashIsFresh]=useState(true); // ditto from FlashMode
      const [blitzIsFresh,setBlitzIsFresh]=useState(true); // ditto from BlitzMode
      const [deductionIsFresh,setDeductionIsFresh]=useState(true); // ditto from DeductionMode (all 3 silos)
      // AoxMode is always-mounted-with-display-none (rather than conditionally rendered) so its
      // internal state persists across mode switches — that's intentional UX (a paused AoX
      // run survives a detour into Classic). But it means none of AoxMode's ~25 useStates and
      // refs auto-reset when fullReset switches mode away from 'aox'. Solution: bump this key
      // in fullReset to force a one-shot AoxMode remount, which runs all its useState/useRef
      // initializers fresh. Normal mode switching doesn't change this key, so the cross-mode
      // persistence behavior is preserved everywhere except the explicit Full Reset path.
      const [aoxResetKey,setAoxResetKey]=useState(0);
      // Same remount trigger for ClassicMode (also always-mounted, owns its own engine state):
      // Full Reset bumps this so Classic returns to its launch state.
      const [classicResetKey,setClassicResetKey]=useState(0);
      const [flashResetKey,setFlashResetKey]=useState(0); // ditto for FlashMode
      const [blitzResetKey,setBlitzResetKey]=useState(0); // ditto for BlitzMode
      const [deductionResetKey,setDeductionResetKey]=useState(0); // ditto for DeductionMode
      // ditto for GuidePage, whose one piece of state is the open panel (Q6, round 9 — it joined
      // the always-mounted screens so that panel, and the reading position, survive a detour into
      // a game mode; Full Reset is the one thing that must still close it).
      const [guideResetKey,setGuideResetKey]=useState(0);
      // Scroll-state tracking for the two inner scroll regions this component owns — the settings
      // popover's scroll wrapper and the changelog popup's list — both on the shared
      // useScrollEdgeState (components/scrollRegion; the Q5 round-7 extraction of what were
      // per-region copies of one listener). The flags drive the shared edge indicators:
      //   …ScrolledFromTop → top fade (no shadow at the top — no fixed UI there)
      //   …AtBottom        → bottom fade (both signal "more below")
      // While closed the hook holds the defaults (scrolledFromTop false, atBottom true) so
      // reopening never flashes stale indicators; both fade flags combine into fade-scroll-both
      // inside scrollFadeClass when both edges overflow.
      // The popover ALSO hands the hook its sticky footer as the bottom boundary surface: that
      // shadow is continuous now (--shade, round 10 item B), so it is no longer derived from
      // popoverAtBottom at the JSX — the hook writes it. The changelog names no boundary surface;
      // its Close row is plain, so both trailing arguments are omitted.
      const popoverInnerScrollRef=useRef<HTMLDivElement | null>(null);
      const popoverFooterRef=useRef<HTMLDivElement | null>(null);
      const {scrolledFromTop:popoverScrolledFromTop,atBottom:popoverAtBottom}=useScrollEdgeState(popoverInnerScrollRef,settingsOpen,undefined,popoverFooterRef);
      const changelogScrollRef=useRef<HTMLDivElement | null>(null);
      const {scrolledFromTop:changelogScrolledFromTop,atBottom:changelogAtBottom}=useScrollEdgeState(changelogScrollRef,changelogOpen);
      // Footer-button caption auto-fit (Round-2) — the StatPanel value-fit pattern applied to the
      // Save Defaults / Reset Settings / Full Reset trio: on a narrow phone the three flex-1 buttons
      // can get too tight for their captions, so ONE shared font-size (never per-button — unequal
      // caption sizes across a matched row read as a glitch) shrinks all three together. Naturals
      // come from hidden STATIC twins of the widest caption set ("Save Defaults" / "Reset Settings" /
      // "Full Reset"), never the live captions — the Full Reset → "Confirm?" swap would otherwise
      // shrink the measurement and jiggle the whole row's size while arming. The math is
      // lib/statFit's sharedFitScale (min ratio, capped at 1) off the trio's resting text-xs —
      // the popover's control tier (Round-3 font normalization), so the fit CEILINGS there and
      // shrinks below 12px only when a narrow screen forces it; an 11px floor keeps the captions
      // legible over cosmetic fit, and overflow-hidden on the buttons (below) contains the extreme
      // remainder. In jsdom every width is 0 → scale 1 → no-op (the statFit convention).
      const footerFitRef=useRef<HTMLDivElement | null>(null);
      const fitFooterBtns=()=>{
        const row=footerFitRef.current;if(!row)return;
        const labels=Array.from(row.querySelectorAll<HTMLElement>('[data-fitlabel]'));
        const twins=Array.from(row.querySelectorAll<HTMLElement>('[data-fittwin]'));
        if(labels.length===0||twins.length===0)return;
        const naturals=twins.map(t=>t.scrollWidth);
        // ⚠ These two stay integer-valued measures on purpose — round 10's sub-pixel sweep
        // (--bar-h, GuidePage's panel heights) deliberately skipped them. scrollWidth is the only
        // platform read of a clamped span's NATURAL width; a rect would report the clamped width,
        // a different number rather than a sharper one. clientWidth EXCLUDES border and scrollbar
        // where rect.width includes both, so swapping it would change which box is being fitted —
        // a semantic change, not a precision one. Both feed a font-size ratio, where a rounded
        // pixel is imperceptible anyway.
        const avails=labels.map(l=>{const btn=l.parentElement;if(!btn)return 0;const cs=getComputedStyle(btn);return btn.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0);});
        const scale=sharedFitScale(naturals,avails);
        // Base font off a STATIC twin, never a live caption: the captions carry the inline
        // fontSize the PREVIOUS pass set, so reading them would compound the shrink on every
        // re-run of the dep-less effect (12·s, 12·s², … → pinned at the floor). Same feedback
        // loop StatPanel guards against by resetting before measuring (StatPanel.tsx fitAll);
        // here the twin — same text classes, never inline-sized — is the clean base.
        const base=parseFloat(getComputedStyle(twins[0]).fontSize)||0;
        const px=scale<1&&base>0?Math.max(11,base*scale)+"px":"";
        // Apply the fitted size to the BUTTON, not the caption span: the caption inherits it, so
        // the button's line-box strut shrinks WITH the text and the label stays vertically
        // centered. (Sizing the inline span alone left it baseline-aligned inside the button's
        // un-shrunk resting-size strut — measured ~0.6px low on-device, the owner's 2026-07-13 catch.)
        labels.forEach(l=>{const b=l.parentElement;if(b)b.style.fontSize=px;});
      };
      // Dep-less like StatPanel's: cheap (3 spans), and the trio row only exists while settings is
      // open (fitFooterBtns bails on the null ref otherwise). Re-observe on open/close; a web-font
      // swap changes the natural widths, so document.fonts.ready refits too.
      useLayoutEffect(()=>{fitFooterBtns();});
      useEffect(()=>{
        const row=footerFitRef.current;
        if(!row||typeof ResizeObserver==='undefined')return;
        const ro=new ResizeObserver(()=>fitFooterBtns());
        ro.observe(row);
        let cancelled=false;
        if(typeof document!=='undefined'&&document.fonts?.ready)document.fonts.ready.then(()=>{if(!cancelled)fitFooterBtns();});
        return()=>{cancelled=true;ro.disconnect();};
      },[settingsOpen]);
      // Settings popover click-outside handler. Closes settings when the user taps
      // anywhere outside three regions: the gear button itself (settingsRef), the
      // popover content (settingsPopoverRef), and the mode CustomSelect wrapper
      // (modeSelectRef). The mode CustomSelect exclusion is what lets the user open
      // and pick from the mode dropdown without the settings popover auto-closing
      // on the same tap — taps inside the mode trigger or its open dropdown panel
      // are inside modeSelectRef's subtree and therefore "inside" for this check.
      useEffect(()=>{if(!settingsOpen)return;const h=(e: MouseEvent | TouchEvent)=>{const target=e.target as Element | null;const inBtn=settingsRef.current&&settingsRef.current.contains(target);const inPop=settingsPopoverRef.current&&settingsPopoverRef.current.contains(target);const inSel=modeSelectRef.current&&modeSelectRef.current.contains(target);
        // Mousedown on the browser scrollbar registers e.target as <html> on Windows. Ignore that
        // case so dragging the scrollbar doesn't close the popover.
        const onScrollbar=target===document.documentElement||target===document.body;
        if(onScrollbar)return;
        // The open CustomSelect dropdown panel (the bar's mode select — the app's last one since
        // the theme selects became PillTray rows) portals out to #root with role="listbox", so a
        // tap on an option lands OUTSIDE the popover in the DOM. Treat that as "inside" so
        // picking a mode doesn't slam the settings popover shut before the selection registers.
        const inListbox=!!(target&&target.closest&&target.closest('[role="listbox"]'));
        // The settings modals (Save Defaults Q7 / the defaults manager Q12+Q5 / the Clear confirm
        // Q5 / Changelog Q6) portal to #root with a full-screen scrim — clicks on any (scrim
        // included) are "inside": a scrim tap cancels only the POPUP (its own onClick handler),
        // never the settings panel beneath it.
        const inModal=!!(target&&target.closest&&target.closest('[data-settings-modal]'));
        if(!inBtn&&!inPop&&!inSel&&!inListbox&&!inModal){
          // Year-range inputs (and any future input in the popover) commit on blur. When closing
          // settings via click-outside on a non-focusable element, the input keeps focus until
          // the popover unmounts — and React's synthetic onBlur doesn't reliably fire on unmount,
          // so the typed value gets dropped. Programmatically blur first so onBlur runs
          // synchronously (commit), then close. (Mobile happens to work without this because
          // tapping a non-focusable target on touch normally fires blur before touchstart.)
          const ae=document.activeElement as HTMLElement | null;
          if(ae&&ae.tagName==='INPUT'&&settingsPopoverRef.current&&settingsPopoverRef.current.contains(ae))ae.blur();
          setSettingsOpen(false);
        }};document.addEventListener('mousedown',h);document.addEventListener('touchstart',h);return()=>{document.removeEventListener('mousedown',h);document.removeEventListener('touchstart',h);};},[settingsOpen]);
      // Escape closes the settings popover. Doesn't fire when a TEXT-ENTRY input has focus — those
      // have their own Escape handling (the year-range inputs revert their value) and stopPropagation
      // isn't used, so this listener would double-handle the same press. The guard is deliberately
      // NOT "any INPUT": range sliders keep focus after an adjust and have no Escape semantics of
      // their own — bailing on them would leave Escape dead until something else got focus.
      useEffect(()=>{if(!settingsOpen)return;const h=(e: KeyboardEvent)=>{if(e.key!=="Escape")return;const ae=document.activeElement as HTMLInputElement | null;if(ae&&ae.tagName==="INPUT"&&ae.type!=="range")return;e.preventDefault();setSettingsOpen(false);};document.addEventListener('keydown',h);return()=>document.removeEventListener('keydown',h);},[settingsOpen]);
      // Close-on-drag-activate (Q5 rework): the pointer controller dispatches a bubbling "drag-dismiss"
      // CustomEvent from a drag-clicked member of a data-drag-dismiss menu (lib/pointerGestures) — the
      // settings popover card is the only such menu. Closing here is exactly a normal close, so the
      // settings apply-on-close pass (useSettingsCloseEffect) fires naturally. Installed once; the ref
      // check scopes it to the popover, and it's a no-op while settings is already closed (no popover DOM).
      useEffect(()=>{const h=(e: Event)=>{const t=e.target as Element | null;if(t&&settingsPopoverRef.current&&settingsPopoverRef.current.contains(t))setSettingsOpen(false);};document.addEventListener('drag-dismiss',h);return()=>document.removeEventListener('drag-dismiss',h);},[]);
      // Save Defaults popup lifecycle (Q7): closing Settings by ANY path closes the popup too —
      // it's a child flow of the panel (Cancel semantics; the pending snapshot is discarded).
      useEffect(()=>{if(!settingsOpen)setSaveDefaultsOpen(false);},[settingsOpen]);
      useEffect(()=>{if(!settingsOpen)setManageDefaultsOpen(false);},[settingsOpen]);   // the defaults manager (Q12/Q5) is a child flow of the panel too
      useEffect(()=>{if(!settingsOpen)setClearConfirmOpen(false);},[settingsOpen]);   // and the Clear confirm (Q5) — its link lives in the panel's footer
      useEffect(()=>{if(!settingsOpen)setChangelogOpen(false);},[settingsOpen]);   // and the Changelog popup (Q6) — its link lives in the panel's footer too
      // Opening Settings by ANY path retires the gear's update dot (Q6) — the breadcrumb's first
      // stage is done once the panel is up (the link's own dot inside keeps pointing onward). The
      // gearDot dep also covers a detection that somehow lands while the panel is already open.
      useEffect(()=>{if(settingsOpen&&gearDot){clearUpdateDot(GEAR_DOT_KEY);setGearDot(false);}},[settingsOpen,gearDot]);
      // Escape cancels the POPUP first — registered in the CAPTURE phase with stopPropagation so
      // the settings Escape handler above (bubble phase) never sees the same press and the panel
      // stays open. TEXT-ENTRY inputs keep their own Escape handling (the N field normalize-commits),
      // mirroring the settings handler's guard — and like it, the guard excludes type="range": the
      // popup's three sliders keep focus after an adjust and must not swallow the dismiss.
      useEffect(()=>{if(!saveDefaultsOpen)return;const h=(e: KeyboardEvent)=>{if(e.key!=="Escape")return;const ae=document.activeElement as HTMLInputElement | null;if(ae&&ae.tagName==="INPUT"&&ae.type!=="range")return;e.preventDefault();e.stopPropagation();setSaveDefaultsOpen(false);};document.addEventListener('keydown',h,true);return()=>document.removeEventListener('keydown',h,true);},[saveDefaultsOpen]);
      // The defaults manager (Q5 round-6) gets the same capture-phase Escape INCLUDING the
      // text-entry guard — it renders the shared editable card now, so a tap-to-type readout can
      // be mid-edit (the editor's own Escape reverts the edit and stops propagation).
      useEffect(()=>{if(!manageDefaultsOpen)return;const h=(e: KeyboardEvent)=>{if(e.key!=="Escape")return;const ae=document.activeElement as HTMLInputElement | null;if(ae&&ae.tagName==="INPUT"&&ae.type!=="range")return;e.preventDefault();e.stopPropagation();setManageDefaultsOpen(false);};document.addEventListener('keydown',h,true);return()=>document.removeEventListener('keydown',h,true);},[manageDefaultsOpen]);
      useEffect(()=>{if(!clearConfirmOpen)return;const h=(e: KeyboardEvent)=>{if(e.key!=="Escape")return;e.preventDefault();e.stopPropagation();setClearConfirmOpen(false);};document.addEventListener('keydown',h,true);return()=>document.removeEventListener('keydown',h,true);},[clearConfirmOpen]);   // the Clear confirm (Q5): input-free (two buttons), so no text-entry guard
      useEffect(()=>{if(!changelogOpen)return;const h=(e: KeyboardEvent)=>{if(e.key!=="Escape")return;e.preventDefault();e.stopPropagation();setChangelogOpen(false);};document.addEventListener('keydown',h,true);return()=>document.removeEventListener('keydown',h,true);},[changelogOpen]);   // the Changelog popup (Q6): input-free too, so no text-entry guard either
      // The popup's modal a11y contract, part 1 of 2 (part 2 = the Tab trap on the scrim, below): on
      // open, move focus INTO the dialog — the card is tabIndex={-1} with role="dialog" +
      // aria-modal="true", so screen readers announce a modal and keyboard context starts inside it.
      // Without this, focus stays on the Save Defaults button UNDER the scrim, and keyboard/AT input
      // keeps operating the live settings panel while commitSaveDefaults would still save the snapshot
      // captured at open — a silent divergence between what's on screen and what Save persists.
      useEffect(()=>{if(saveDefaultsOpen)saveDefaultsCardRef.current?.focus();},[saveDefaultsOpen]);
      useEffect(()=>{if(manageDefaultsOpen)manageDefaultsCardRef.current?.focus();},[manageDefaultsOpen]);   // same contract for the defaults manager (Q12/Q5)
      useEffect(()=>{if(clearConfirmOpen)clearConfirmCardRef.current?.focus();},[clearConfirmOpen]);   // and the Clear confirm (Q5)
      useEffect(()=>{if(changelogOpen)changelogCardRef.current?.focus();},[changelogOpen]);   // and the Changelog popup (Q6)
      // Restores the settings the ⚙ panel owns — the 14 menu values + the 2 year-range text mirrors —
      // AND the four capturable mode-screen prefs (Flash speed, both Blitz timers, the AoX run length)
      // to their EFFECTIVE defaults: the user's saved personal defaults when they exist (Q7,
      // store/userDefaults), the factory launch values otherwise. This is the exact MIRROR of Save
      // Defaults (which copies live → the snapshot) over the same 18-value unit the gear "modified" bar
      // judges — so one tap clears a lit gear whatever diverged (round-6 extension: it used to touch the
      // panel alone, stranding a gear lit only by a mode-screen pref). Still leaves the NON-capturable
      // mode config (Blitz Per-Round/Question, Allow Mistakes, One-by-One, the Deduction sub-type, the
      // show/hide stat toggles) and stats/history untouched — Full Reset (which additionally wipes stats
      // and remounts every mode) and Reset Stats own those. The mode-screen prefs restore straight into
      // the live store; an ACTIVE Blitz round or AoX run reconciles to the new config on the popover
      // close, exactly as a ⚙ panel change does (each mode's useSettingsCloseEffect now watches its own
      // timer/run-length too). Triggers the unified popover-settings effect, which regenerates the
      // current date as appropriate (Random Format / Date Format / Leap Chance are always-regen).
      const resetSettings=()=>{
        // The 14 store-held settings in one shot (store/settings applySettings), then the 2 transient
        // text mirrors that live locally, then the 4 capturable mode-screen prefs (store/modePrefs
        // applyPrefs — the same call Full Reset makes; the other mode-prefs keep their live values).
        applySettingsStore(defSettings);
        setMinInputVal(String(defSettings.minY));setMaxInputVal(String(defSettings.maxY));
        applyModePrefs(defPrefs);
      };
      // Save Defaults (Q7): open the confirmation popup, seeding the pending snapshot from the
      // LIVE stores (panel captured whole; the four mode-screen prefs become editable rows).
      // The seed is kept alongside the pending copy for the shared card's dirty-row highlight.
      const openSaveDefaults=()=>{
        const s=useSettings.getState();
        pendSettingsRef.current=Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(k=>[k,s[k as keyof SettingsValues]])) as SettingsValues;
        const p=useModePrefs.getState();
        const seeded={flashMs:p.flashMs,blitzSec:p.blitzSec,blitzQSec:p.blitzQSec,aoxN:normalizeAoxN(p.aoxN)};
        setPendPrefs(seeded);
        setPendSeed(seeded);
        setSaveDefaultsOpen(true);
      };
      const closeSaveDefaults=useCallback(()=>setSaveDefaultsOpen(false),[]);
      // The defaults manager (Q5 round-6): seed the pending copy from the EFFECTIVE defaults —
      // the saved snapshot when one exists, the factory values otherwise (aoxN normalized so the
      // readout starts on its committed form). defPrefs itself doubles as the seed prop.
      const openManageDefaults=()=>{setManagePrefs({...defPrefs,aoxN:normalizeAoxN(defPrefs.aoxN)});setManageDefaultsOpen(true);};
      const closeManageDefaults=useCallback(()=>setManageDefaultsOpen(false),[]);
      const closeClearConfirm=useCallback(()=>setClearConfirmOpen(false),[]);
      const closeChangelog=useCallback(()=>setChangelogOpen(false),[]);
      // Opening the changelog retires the link's dot — the breadcrumb's last stop. First tap only
      // in effect: once the flag is cleared the guard never re-fires (nothing re-marks it until
      // the next build change).
      const openChangelog=()=>{setChangelogOpen(true);if(changelogDot){clearUpdateDot(CHANGELOG_DOT_KEY);setChangelogDot(false);}};
      // Save commits the EDITED pending snapshot (never the live stores — they stay untouched);
      // from here on Reset Settings / Full Reset / the gear indicator mean THESE values by "default".
      const commitSaveDefaults=()=>{
        if(pendSettingsRef.current)saveUserDefaults({settings:pendSettingsRef.current,prefs:{...pendPrefs,aoxN:normalizeAoxN(pendPrefs.aoxN)}});
        setSaveDefaultsOpen(false);
      };
      // The manager's Save (Q5 round-6) writes ONLY the four shown values into the snapshot: the
      // 14 ⚙-panel values pass through AS-SAVED, byte-identical (never re-captured from the live
      // store — the owner's rule: this popup edits exactly what it shows). With nothing saved yet
      // it CREATES the snapshot — the factory ⚙ values plus these edits, the natural flow from
      // the factory view (the footer's Clear link appears with it).
      const commitManageDefaults=()=>{
        saveUserDefaults({settings:savedDefaults?savedDefaults.settings:SETTINGS_DEFAULTS,prefs:{...managePrefs,aoxN:normalizeAoxN(managePrefs.aoxN)}});
        setManageDefaultsOpen(false);
      };
      // The Clear confirm's destructive half (Q5 round-6): forget the snapshot — live settings
      // stay untouched, factory semantics take over everywhere (the effective* helpers).
      const confirmClearDefaults=()=>{
        clearUserDefaults();
        setClearConfirmOpen(false);
      };
      // Full Reset — back to the launch state, where "launch" honors the user's SAVED personal
      // defaults (Q7): the ⚙ panel and the four captured mode prefs restore to the
      // store/userDefaults snapshot when one exists, everything else to factory (and the snapshot
      // itself survives — clearing it is the Save Defaults popup's job, never Full Reset's).
      // The five always-mounted mode components own ALL
      // gameplay state (stats, history, run/round progress, config toggles, timers) and the sixth
      // always-mounted screen, How to Play, owns its open panel, so bumping their *ResetKey props
      // below remounts them and resets every per-screen value to its hook
      // default in the same render. App therefore only resets what IT owns: the current mode,
      // the ⚙ settings (delegated to resetSettings → the Zustand store, the 2 input mirrors, and
      // — since round-6 Q7 — the 4 capturable mode prefs), the Lookup state, and the scroll position.
      // Deliberately NOT a location.reload() — this stays the single source of truth for "back to
      // launch" as offline/profile state is added.
      const fullReset=()=>{
        prevNonGuideModeRef.current="classic";
        switchMode("classic");
        setSettingsOpen(false);
        setAppAtBottom(true);
        setAppScrolledFromTop(false);
        // Settings popover → EFFECTIVE defaults (14 store values incl. theme + the 2 transient
        // input mirrors — the user's saved personal defaults when present). Since round-6 Q7 this
        // ALSO applies the 4 capturable mode prefs; the resetModePrefs()+applyModePrefs(defPrefs) pair
        // below re-establishes them over the factory modePrefs reset, so that write is subsumed here
        // (the net four-pref result is identical) — resetSettings keeps its standalone contract.
        resetSettings();
        // Saved gameplay progress → wiped (Stage D1): clears lifetime stats + all-time bests + Lookup
        // history in the persisted store, making Full Reset permanent. Runs BEFORE the remount-key bumps
        // below, so the continuous modes re-hydrate from the now-empty store (blank stats).
        resetProgress();
        // Per-mode setup (Flash speed, Blitz/AoX config, Deduction sub-type, the stat-visibility
        // toggles) → launch defaults. Runs BEFORE the remount-key bumps so the modes re-read the
        // now-default prefs. The store holds no "last mode" and never has — WHICH mode you were on
        // is plain useState in App, which is the whole reason a cold start always opens Classic.
        resetModePrefs();
        // …then push the four SAVED personal defaults (Flash speed, both Blitz timers, the AoX run length — Q7,
        // store/userDefaults, which deliberately SURVIVES Full Reset) back over that factory reset,
        // still before the remount-key bumps. Everything else in modePrefs (Per-Round/Question,
        // Deduction sub-type, Allow Mistakes, One-by-One, show/hide toggles) stays factory. A no-op
        // when nothing is saved (defPrefs = the factory values).
        applyModePrefs(defPrefs);
        // Lookup input/output are transient local state (the history itself was cleared by resetProgress).
        setLookupInput("");setLookupOutput("");
        setLookupCalcDate(null);setLookupSelectedHistoryId(null);setLookupCalcOpen(false);
        // Remount all six always-mounted screens → their internal state resets to launch defaults.
        // How to Play is in the list for its ONE piece of state, the open panel: it used to be
        // conditionally rendered, so leaving it dropped that for free — now that it stays mounted
        // (Q6, round 9), a reset that left a panel hanging open would not be the launch state.
        setAoxResetKey(k=>k+1);
        setClassicResetKey(k=>k+1);
        setFlashResetKey(k=>k+1);
        setBlitzResetKey(k=>k+1);
        setDeductionResetKey(k=>k+1);
        setGuideResetKey(k=>k+1);
        // Scroll window + app container to top (synchronous, avoids a visual flash before the
        // scroll-ownership effect would do it; the window jump is defense-in-depth, body can't
        // scroll). The guide's saved reading position goes with them — switchMode above captured
        // it on the way out, and a Full Reset means there is nothing to come back to.
        if(typeof window!=="undefined")window.scrollTo(0,0);
        if(appScrollRef.current)appScrollRef.current.scrollTop=0;
        guideScrollYRef.current=0;
      };
      // Two-tap-to-confirm wrapper. Tap 1 arms (label flips to "Confirm?", button gets a ring).
      // Tap 2 within the arm window fires the reset and disarms. Auto-disarm via timer (3s),
      // settings-close watcher, and any-other-popover-mousedown listener.
      const armFullReset=()=>{
        // Defense in depth — the pointer-events-none className keeps taps from reaching here,
        // but if some keyboard/programmatic path bypasses CSS, this short-circuit ensures
        // we never arm/fire when the action would be a no-op.
        if(isFullyReset)return;
        if(fullResetArmed){
          if(fullResetTimerRef.current){clearTimeout(fullResetTimerRef.current);fullResetTimerRef.current=null;}
          setFullResetArmed(false);
          fullReset();
          return;
        }
        setFullResetArmed(true);
        if(fullResetTimerRef.current)clearTimeout(fullResetTimerRef.current);
        fullResetTimerRef.current=setTimeout(()=>{setFullResetArmed(false);fullResetTimerRef.current=null;},3000);
      };
      const disarmFullReset=()=>{
        if(fullResetTimerRef.current){clearTimeout(fullResetTimerRef.current);fullResetTimerRef.current=null;}
        setFullResetArmed(false);
      };
      // Disarm whenever settings closes by any path (gear tap, click-outside, Esc, full-reset firing).
      useEffect(()=>{if(!settingsOpen)disarmFullReset();},[settingsOpen]);
      // Android hardware Back closes these App-level overlays instead of quitting the app (Q1).
      // Settings popover → close it; How-to-Play (the 'guide' mode) → return to the previous game mode
      // (mirrors the H-key toggle). The mode menu + Show Codes register their own back entries from
      // CustomSelect / the mode components. See components/useBackButton.
      useBackButton(settingsOpen, ()=>setSettingsOpen(false), 'settings');
      useBackButton(saveDefaultsOpen, closeSaveDefaults, 'save-defaults');   // opens after 'settings' → Back closes the popup first (LIFO)
      useBackButton(manageDefaultsOpen, closeManageDefaults, 'manage-defaults');   // ditto for the defaults manager (Q12/Q5)
      useBackButton(clearConfirmOpen, closeClearConfirm, 'clear-defaults');   // and the Clear confirm (Q5)
      useBackButton(changelogOpen, closeChangelog, 'changelog');   // and the Changelog popup (Q6)
      useBackButton(mode==='guide', ()=>switchMode(prevNonGuideModeRef.current||'classic'), 'guide');
      // NOTE: the "disarm when state flips to fully-reset" safety-net effect was moved to just
      // after the isFullyReset declaration below — its dependency array reads isFullyReset, which
      // is declared later, so keeping it here would read isFullyReset before initialization (a TDZ
      // crash once the block-scoping shim was removed). Effects run after render regardless of source
      // order, so relocating it is behavior-identical.
      // Site-wide disarm listener (capture phase) — disarms when the user mousedowns/touches
      // any element outside the Full Reset button itself. Capture phase fires before the
      // target's own onClick, so the user's intent (e.g., toggling Random Format, switching
      // modes, tapping a date answer) still proceeds normally; we just consume the pending
      // arm. Scope is the entire document (not just the settings popover) so taps anywhere
      // outside the button reliably disarm.
      useEffect(()=>{
        if(!fullResetArmed)return;
        const h=(e: MouseEvent | TouchEvent)=>{
          if(fullResetBtnRef.current&&fullResetBtnRef.current.contains(e.target as Node | null))return;
          disarmFullReset();
        };
        document.addEventListener('mousedown',h,true);
        document.addEventListener('touchstart',h,true);
        return()=>{document.removeEventListener('mousedown',h,true);document.removeEventListener('touchstart',h,true);};
      },[fullResetArmed]);
      // Cleanup the Full Reset arm timer on unmount.
      useEffect(()=>()=>{
        if(fullResetTimerRef.current)clearTimeout(fullResetTimerRef.current);
      },[]);
      // True when every popover-controlled STORE value matches its EFFECTIVE default — the user's
      // saved personal defaults when they exist (Q7, store/userDefaults), the factory launch
      // values otherwise. STORE values only: uncommitted year-range typing must not light the
      // gear's "modified" indicator below (it commits on blur/Enter).
      // The theme trio is compared BY WHAT IS IN EFFECT, not by what is stored. Use System ON
      // means darkTheme/lightTheme are the live pair and manualTheme is dormant; OFF is the
      // reverse. Comparing a dormant value would make "modified" mean "some invisible byte
      // differs", and that fires for real: flipping Use System OFF seeds manualTheme from the
      // theme already on screen (so the switch never jumps the look), so on a light-mode phone an
      // OFF→ON round trip parks manualTheme at 'light' against a 'dusk' default — every visible
      // setting back at factory, yet the gear's violet bar lit, Reset Settings and Full Reset
      // both offered, permanently. Comparing only the live pair is both the honest definition and
      // the fix, and it retires the whole class of dormant-value false positives.
      const themeAtDefaults=useSystem?(darkTheme===defSettings.darkTheme&&lightTheme===defSettings.lightTheme):(manualTheme===defSettings.manualTheme);
      const settingsStoreAtDefaults=randomFormat===defSettings.randomFormat&&dateFormat===defSettings.dateFormat&&inputStyle===defSettings.inputStyle&&useJulian===defSettings.useJulian&&minY===defSettings.minY&&maxY===defSettings.maxY&&leapChance===defSettings.leapChance&&janFebChance===defSettings.janFebChance&&julianChance===defSettings.julianChance&&saveStats===defSettings.saveStats&&useSystem===defSettings.useSystem&&themeAtDefaults;
      // settingsAtDefaults = the ⚙ PANEL at its effective defaults: the store values PLUS the two
      // year-range *input text* mirrors, so a dirty (uncommitted) input reads as diverged. Feeds
      // isFullyReset below; the Reset Settings dim extends it with the mode-screen prefs (resetSettingsAtDefaults).
      const settingsAtDefaults=settingsStoreAtDefaults&&minInputVal===String(defSettings.minY)&&maxInputVal===String(defSettings.maxY);
      // The ⚙ gear "modified" indicator (Q8) + the Save Defaults dim: live state diverges from the
      // effective defaults in EITHER store (any menu setting, or any of the four capturable
      // mode-screen prefs). Its complement means "nothing new to save".
      const settingsModified=!(settingsStoreAtDefaults&&prefsAtDefaults);
      // Reset Settings dims only when the FULL 18-value unit sits at the effective defaults — the ⚙
      // panel (incl. the year-range text mirrors) AND the four capturable mode-screen prefs — so it is
      // offered whenever the gear reads "modified", the exact mirror of the Save Defaults dim (round-6
      // Q7). Before that it watched the panel alone, stranding a gear lit only by a divergent mode-screen pref.
      const resetSettingsAtDefaults=settingsAtDefaults&&prefsAtDefaults;
      // Every per-mode piece of state now lives in the always-mounted mode components, which
      // each report a comprehensive freshness flag (config + stats + history + UI toggles) up
      // via onFreshChange. So isFullyReset = the launch mode (classic) + settings-at-defaults +
      // the Lookup state (which lives here in App) + all five freshness flags. No dead App-side
      // game-state checks remain.
      const isFullyReset=mode==='classic'&&settingsAtDefaults&&lookupHistory.length===0&&lookupInput===""&&lookupOutput===""&&lookupCalcDate===null&&lookupSelectedHistoryId===null&&lookupCalcOpen===false&&aoxIsFresh&&classicIsFresh&&flashIsFresh&&blitzIsFresh&&deductionIsFresh;
      // Safety net (moved here from above so its dep array reads isFullyReset AFTER it's declared):
      // if state somehow flips to fully-reset while the Full Reset button is armed (shouldn't be
      // reachable in practice — fullReset disarms before firing — but defensive), disarm.
      useEffect(()=>{if(isFullyReset&&fullResetArmed)disarmFullReset();},[isFullyReset,fullResetArmed]);
      // Settings popover. Stays IN the bar (absolute, anchored to the bar's relative
      // inner div via top-full) — only its CustomSelect dropdown PANELS portal out to
      // #root, to escape this overflow scroll context for the frosted-glass blur. Do NOT
      // frost" theory) and reverted — the scroll container, not the bar, was the cause.
      // Elevation + bottom cushion (Calendar Game, refined 2026-06-09): this popover is a FLOATING
      // OVERLAY (it pops over the dimmed page), so it uses the app's even, all-around overlay shadow —
      // the SAME visual language as the dropdown menus (CustomSelect) — NOT the directional
      // `elev-shadow-down` (that one is the scroll-BOUNDARY cue for fixed bars/headers/footers, the
      // wrong language for a free-floating panel). It's OFFSET-FREE (`0 0 8px`, vs the dropdowns'
      // downward-offset shadow) so the shadow extends EQUALLY on all four sides — the panel is inset
      // against the screen edge on every side and must read as symmetric. It's SUBTLE (12% black, the
      // app's overlay-shadow color) because the opaque fill + 1px card border + dimmed backdrop already
      // separate it (the shadow only adds a gentle lift); and SMALL (8px blur) so it stays clearly
      // contained inside the 1rem gap (vs the dropdowns' 28px blur, which would overflow the cushion and
      // clip at the screen edge). Bottom cushion: the calc uses REM, not px, so it matches the rem-based
      // side insets EXACTLY — left-4/right-4 = 1rem, and the app's root font is FLUID
      // (html{font-size:clamp(...)}), so 1rem ≠ 16px; a hardcoded px cushion would NOT equal the sides
      // and would drift per-device. max-height = 100dvh - REAL measured bar height (--bar-h) - 0.5rem
      // (the mt-2 top gap, so it cancels) - 1rem cushion - bottom safe-area → the panel stops exactly
      // 1rem above the viewable-area bottom = the SAME gap as its sides, on every device (Safari nav
      // bar, installed-app home indicator, Android nav-bar/pill). env(safe-area-inset-bottom) is 0 on
      // iOS (no viewport-fit=cover in index.html) — it only matters on edge-to-edge Android. (Tailwind
      // arbitrary value: underscores become spaces, so calc() emits the whitespace CSS requires.)
      // Press-drag contract (Q5 rework, lib/pointerGestures): the CARD is the ⚙ trigger's menu —
      // id="settings-popover" pairs it via the gear's aria-controls (the id IS the pairing; the card
      // deliberately carries no [data-select-group], so a drag that STARTS inside it still scrolls
      // natively instead of drag-selecting); the whole card is
      // in drag scope, footer rows included. data-drag-dismiss opts it into close-on-drag-pick (App's
      // drag-dismiss listener → the apply-on-close pass); the data-drag-stay regions (BOTH footer rows —
      // the theme block was the third until round-8 dropped it, so a drag-pick on a theme pill now
      // dismisses like the date-format pills) opt back out: Full Reset needs
      // its Confirm? tap, Reset Settings should show controls snapping to defaults, and Save Defaults
      // opens its confirmation popup (which portals OUT of this card, so a drag-release on popup
      // content can never drag-dismiss the panel). The Year Range
      // inputs are data-drag-focus (release = focus for typing, panel stays open). The inner scroll
      // wrapper is data-drag-scroll — the controller's auto-scroll target + edge-band geometry.
      // Scroll recipe (Q5 round-7): the wrapper wears SCROLL_REGION_CLASS + scrollFadeClass
      // (components/scrollRegion) — this popover IS the reference treatment (card py-4 only, the
      // px-4 scrollbar lane inside the scroller, edge fades) every other scroll region now shares.
      const settingsJsx=settingsOpen&&(<div ref={settingsPopoverRef} id="settings-popover" data-drag-dismiss style={{boxShadow:'0 0 8px rgba(0,0,0,0.12)'}} className="absolute left-4 right-4 top-full mt-2 z-50 rounded-2xl card py-4 space-y-4 flex flex-col max-h-[calc(100dvh_-_var(--bar-h)_-_0.5rem_-_1rem_-_env(safe-area-inset-bottom))]">
        <div ref={popoverInnerScrollRef} data-drag-scroll className={`${SCROLL_REGION_CLASS} flex-1 min-h-0 space-y-4 ${scrollFadeClass(popoverScrolledFromTop,popoverAtBottom)}`}>
        {/* SETTINGS regrouped into 3 categories (Q2): Display (how it's shown + how you answer + theme),
            Dates (which dates get generated), Stats. Each category is a SectionLabel header; the former
            per-setting headings are now muted sub-labels (the Leap-Year header+sub-label pattern). Every
            control + its behaviour is unchanged — purely a regroup. */}
        <div className="space-y-2">
          <SectionLabel>Display</SectionLabel>
          <div className="text-xs text-(--tx-200-80)">Date Format</div>
          <div className="flex items-center justify-between"><span className="text-xs text-(--tx-200-80)">Random Format</span><button type="button" onClick={()=>setRandomFormat(v=>!v)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${randomFormat?"btn-solid border-transparent":"surface-toggle text-(--tx-100-80)"}`}>{randomFormat?"On":"Off"}</button></div>
          {/* ★ THE PICKER RULE (round-9) — the panel has exactly TWO kinds of control, and each
              gets exactly ONE treatment. State it here, obey it everywhere below:
                • SWITCH — a setting that is simply on/off (Random Format, Use System Settings,
                  Julian Calendar, Save Stats): label left, ONE On/Off button right.
                • PICKER — a choice among named alternatives: ONE merged PillTray tray
                  (components/PillTray, where the concentric-housing recipe lives). Where the
                  alternatives fall into named families, each family gets its own centred caption
                  and the trays STACK.
              The housing is what says "these options are mutually exclusive", so it cannot be a
              per-group decoration: a picker drawn as loose gap-separated buttons reads exactly
              like the in-game rows that are genuinely INDEPENDENT toggles (Allow Mistakes,
              One-by-One), which is the confusion the rule exists to remove. Round-8 had trays on
              Date Format and Theme only; round-9 converted the two hold-outs (Input, and the
              three chance rows) — so the panel is now trays and switches, nothing else.
              Caption hierarchy (already correct, don't disturb it): the setting NAME is a
              left-aligned sentence-case sub-label; FAMILY captions are centred uppercase
              SectionLabels. Name → optional family captions → tray(s).
              Date Format is the family case: five ids in two trays, both reading and writing the
              SAME setting, so the half that doesn't hold the active id shows no selected segment.
              The two trays share ONE ROW (round-10 revert of round-9's stack). Theme stacks out of
              NECESSITY — five theme names measured at zero headroom on any phone narrower than the
              owner's — and round-9 mistook that forced layout for a rule and applied it here too,
              costing ~61px of scrolling for consistency with a case that had no choice. These
              labels are m/d/y-sized, so both trays fit a row comfortably at every width we ship.
              THE RULE IS ABOUT HOUSINGS, NOT AXIS: each named family gets its own captioned tray;
              whether the trays sit side by side or stack is a FIT question, answered per group.
              ONE PillGroup spans BOTH trays,
              on the wrapper that already exists to hold them: a group is a CHOICE, not a row, and
              two groups would each report "nothing selected" whenever the live format lived in
              the other half — and would also split one keyboard choice into two tab stops that
              refuse to arrow into each other. That wrapper is also the dim, so the lock provably
              covers the captions. Written / Numeric stay plain captions — the halves ride in the
              pills' accessible names (WRITTEN_FORMATS/NUMERIC_FORMATS), which keeps the two
              'MDY's apart. Every picker below states its lock ONCE, as PillGroup's `disabled`:
              the dim, aria-disabled, the onChange guard and the tab stops all follow from it. */}
          <PillGroup label="Date Format" disabled={randomFormat} className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <SectionLabel className="text-center">Written</SectionLabel>
              <PillTray value={dateFormat} onChange={setDateFormat} options={WRITTEN_FORMATS}/>
            </div>
            <div className="flex-1 space-y-1.5">
              <SectionLabel className="text-center">Numeric</SectionLabel>
              <PillTray value={dateFormat} onChange={setDateFormat} options={NUMERIC_FORMATS}/>
            </div>
          </PillGroup>
          {/* Input — Buttons / Dots (the logo's 7-dot answer layout). A picker with no families,
              so: one tray, no captions. Locks/dims in Deduction (answers aren't weekdays; the
              value is preserved), like Julian/Leap-Year Chance when they don't apply — the lock
              sits on the GROUP, so the housing greys as one piece. */}
          <div className="text-xs text-(--tx-200-80) pt-1">Input</div>
          <PillGroup label="Input" disabled={mode==='deduction'}>
            <PillTray value={inputStyle} onChange={setInputStyle} options={INPUT_STYLES}/>
          </PillGroup>
          <div className="text-xs text-(--tx-200-80) pt-1">Theme</div>
          {/* Flipping Use System Settings OFF seeds the manual theme from what is ALREADY on
              screen (activeTheme), so the switch never jumps the user to a different look — the
              pill that was lit stays lit, now as the single manual pick. An OFF→ON round trip
              leaves manualTheme wherever the OFF pass parked it, but that value is DORMANT while
              the OS decides, and settingsStoreAtDefaults compares only the theme values actually
              in effect — so the round trip cannot leave the gear falsely reading "modified". */}
          <div className="flex items-center justify-between"><span className="text-xs text-(--tx-200-80)">Use System Settings</span><button type="button" onClick={()=>{if(useSystem)setManualTheme(activeTheme);setUseSystem(v=>!v);}} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${useSystem?"btn-solid border-transparent":"surface-toggle text-(--tx-100-80)"}`}>{useSystem?"On":"Off"}</button></div>
          {/* The five themes as two PillTray rows (round-8), replacing the dropdowns they used to
              hide behind. The SAME two rows render in both Use-System states — the panel no
              longer changes height when the switch is flipped — and the centered Dark / Light
              captions carry the whole state difference:
                • Use System ON  — two INDEPENDENT picks (the OS decides which row is live), so
                  each row reads and writes its own store value.
                • Use System OFF — ONE pick across BOTH rows: both rows read manualTheme, so the
                  row that doesn't hold it shows no selected segment.
              Captions stay CENTERED in both states (left-aligned SectionLabels are reserved for
              the DISPLAY / DATES / STATS headers and would out-rank the "Theme" sub-label above),
              and neither row is marked "in use" — the OS owns that, and a marker would imply the
              app does. No data-drag-stay (round-8, owner's call): a press-drag from the gear that
              releases on a theme pill DISMISSES the panel, exactly like the date-format pills —
              "if I want to change both, I'd just tap settings instead of doing the dragging
              thing."
              The RADIOGROUPS follow the selection semantics above rather than the two rows, for
              the same reason the date-format trays share one group: a group is a CHOICE. Use
              System ON = two independent picks = two groups. OFF = one pick across both rows = ONE
              group spanning them, so the row that doesn't hold manualTheme isn't announced as an
              empty choice of its own — and one pick answers to one tab stop and one arrow walk.
              The shared wrapper is not an element added to carry a role — it is also what supplies
              the 8px between the rows that the section's space-y-2 gave them as siblings. Which of
              the three wrappers is the real group is exactly which of them is NAMED: an unnamed
              PillGroup is just the div (a radiogroup must have a name to be one), so the switch
              moves the role, the keyboard and nothing else. All five theme names are distinct, so
              no pill needs an ariaLabel. */}
          <PillGroup className="space-y-2" label={useSystem?undefined:"Theme"}>
            <PillGroup className="space-y-1.5" label={useSystem?"Dark theme":undefined}>
              <SectionLabel className="text-center">Dark</SectionLabel>
              <PillTray value={useSystem?darkTheme:manualTheme} onChange={useSystem?setDarkTheme:setManualTheme} options={DARK_THEMES}/>
            </PillGroup>
            <PillGroup className="space-y-1.5" label={useSystem?"Light theme":undefined}>
              <SectionLabel className="text-center">Light</SectionLabel>
              <PillTray value={useSystem?lightTheme:manualTheme} onChange={useSystem?setLightTheme:setManualTheme} options={LIGHT_THEMES}/>
            </PillGroup>
          </PillGroup>
        </div>
        <div className="space-y-2 pt-3 border-t border-(--bd-500-20)">
          <SectionLabel>Dates</SectionLabel>
          <div className="text-xs text-(--tx-200-80)">Year Range</div>
          <div className="flex items-center gap-2">
            <input ref={minInputRef} type="text" inputMode="numeric" pattern="[0-9]*" data-drag-focus value={minInputVal} onChange={e=>{if(e.target.value===''||/^\d*$/.test(e.target.value))setMinInputVal(e.target.value);}} onBlur={commitMin} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commitMin();e.currentTarget.blur();}if(e.key==="Escape"){setMinInputVal(String(minY));e.currentTarget.blur();}blockMinus(e);}} onBeforeInput={blockMinusBI} className={`${NUM_INPUT_CLASS} py-1.5 w-16`}/>
            <span className="text-(--tx-300-60) text-sm shrink-0">→</span>
            <input ref={maxInputRef} type="text" inputMode="numeric" pattern="[0-9]*" data-drag-focus value={maxInputVal} onChange={e=>{if(e.target.value===''||/^\d*$/.test(e.target.value))setMaxInputVal(e.target.value);}} onBlur={commitMax} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commitMax();e.currentTarget.blur();}if(e.key==="Escape"){setMaxInputVal(String(maxY));e.currentTarget.blur();}blockMinus(e);}} onBeforeInput={blockMinusBI} className={`${NUM_INPUT_CLASS} py-1.5 w-16`}/>
          </div>
          {/* ★ THE ORDER OF THIS SECTION (round-12) — Year Range, then the two LEAP rows, then the
              JULIAN pair last. Julian Chance is locked unless the switch is ON *and* the range
              straddles 1582, so under any ordinary modern range it is a greyed-out dead control;
              it used to sit third, ABOVE two live ones. Two pairings constrain any future reshuffle:
              Jan/Feb Chance is a sub-case of Leap Year Chance and must sit directly under it, and
              the Julian switch is the thing that explains why Julian Chance greys out, so it must
              stay directly above it. Move the Julian pair, never one half of it.
              The three chance rows (this one, Jan/Feb under it, and Julian Chance at the foot of
              the section) are pickers, so they are trays (THE PICKER RULE, Display above)
              — round-9 converted them from the flat gap-separated buttons they shipped as. The
              conversion costs no height: these rows already captioned ABOVE their control, and
              the tray's ~2px seams are tighter than the ~6px gaps they replace, so every label
              gained room. Each row's LOCK now sits on the GROUP instead of on every button, so
              the housing greys as one piece; the caption stays lit, as it always did. Each lock is
              written straight into `disabled` because one boolean is now all a lock takes — the
              IIFEs the two locked rows (Leap Year Chance, Julian Chance) used to need existed only
              to hand the same derived boolean to a dim class as well.
              Leap Year Chance: locked when the active range/calendar has no leap years; the selected
              value is preserved + restored when a leap year becomes reachable again. */}
          <div className="text-xs text-(--tx-200-80) pt-1">Leap Year Chance</div>
          <PillGroup label="Leap Year Chance" disabled={!rangeHasLeapYear(minY,maxY,useJulian)}>
            <PillTray value={leapChance} onChange={setLeapChance} options={LEAP_CHANCE_OPTIONS}/>
          </PillGroup>
          {/* Jan/Feb Chance: the listed % is the exact probability a leap-year date lands on Jan/Feb
              (Random = natural ~17%). Stays unlocked even when leap years aren't currently reachable,
              so it is the one chance row with no lock branch at all. */}
          <div className="text-xs text-(--tx-200-80) pt-1">Jan/Feb Chance on Leap Years</div>
          <PillGroup label="Jan/Feb Chance on Leap Years">
            <PillTray value={janFebChance} onChange={setJanFebChance} options={CHANCE_OPTIONS}/>
          </PillGroup>
          <div className="flex items-center justify-between pt-1"><span className="text-xs text-(--tx-200-80)">Julian Calendar (pre-Oct 15, 1582)</span><button type="button" onClick={()=>setUseJulian(v=>!v)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${useJulian?"btn-solid border-transparent":"surface-toggle text-(--tx-100-80)"}`}>{useJulian?"On":"Off"}</button></div>
          {/* Julian Chance: locked unless the switch directly above is ON *and* the active year range
              straddles 1582 (= mixed Julian+Gregorian: minY<=1582<=maxY). Year 1582 itself spans both
              calendars. When locked the selected value stays visually selected, so it's restored when
              the range becomes mixed again. */}
          <div className="text-xs text-(--tx-200-80) pt-1">Julian Chance</div>
          <PillGroup label="Julian Chance" disabled={!(useJulian&&minY<=1582&&maxY>=1582)}>
            <PillTray value={julianChance} onChange={setJulianChance} options={CHANCE_OPTIONS}/>
          </PillGroup>
        </div>
        <div className="space-y-2 pt-3 border-t border-(--bd-500-20)">
          <SectionLabel>Stats</SectionLabel>
          <div className="flex items-center justify-between"><span className="text-xs text-(--tx-200-80)">Save Stats</span><button type="button" onClick={toggleSaveStats} className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${saveStats?"btn-solid border-transparent":"surface-toggle text-(--tx-100-80)"}`}>{saveStats?"On":"Off"}</button></div>
        </div>
        </div>
        {/* The panel's bottom boundary. elev-shadow-up is UNCONDITIONAL: its strength is the
            --shade the edge hook writes onto this element (0 when the list is scrolled to the
            end, ramping to full over the last --fade-h of travel), so there is no class to
            toggle and nothing left to animate. */}
        <div ref={popoverFooterRef} data-drag-stay className="popover-sticky-footer elev-shadow-up pt-4 px-4 border-t border-(--bd-500-20)">
          <div ref={footerFitRef} className="flex gap-2">
            {/* The invisible STATIC caption twins the auto-fit measures (fitFooterBtns above) — the
                full resting set, so the live Full Reset → "Confirm?" swap never changes the fit.
                absolute keeps them out of the flex row; same text classes as the buttons. */}
            <span data-fittwin aria-hidden="true" className="absolute invisible whitespace-nowrap text-xs font-medium">Save Defaults</span>
            <span data-fittwin aria-hidden="true" className="absolute invisible whitespace-nowrap text-xs font-medium">Reset Settings</span>
            <span data-fittwin aria-hidden="true" className="absolute invisible whitespace-nowrap text-xs font-medium">Full Reset</span>
            {/* Save Defaults (Q7): constructive → btn-solid purple (the Begin-button language), keeping
                rose exclusively for the two destructive neighbors. Dims when live state already equals
                the saved defaults (factory when none saved) — nothing new to save. Each caption sits in
                a data-fitlabel span (whitespace-nowrap so it MEASURES at full width instead of
                wrapping; overflow-hidden on the button contains the pre-fit paint). */}
            <button type="button" onClick={openSaveDefaults} className={`flex-1 px-3 py-1.5 rounded-xl btn-solid border border-transparent text-xs font-medium overflow-hidden ${!settingsModified?" opacity-60 pointer-events-none":""}`}><span data-fitlabel className="whitespace-nowrap">Save Defaults</span></button>
            <button type="button" onClick={resetSettings} className={`flex-1 ${FOOTER_RESET_BTN_CLASS} overflow-hidden ${resetSettingsAtDefaults?"opacity-60 pointer-events-none":""}`}><span data-fitlabel className="whitespace-nowrap">Reset Settings</span></button>
            <button ref={fullResetBtnRef} type="button" onClick={armFullReset} className={`flex-1 ${FOOTER_RESET_BTN_CLASS} overflow-hidden ${fullResetArmed?" ring-2 ring-rose-200":""}${isFullyReset?" opacity-60 pointer-events-none":""}`}><span data-fitlabel className="whitespace-nowrap">{fullResetArmed?"Confirm?":"Full Reset"}</span></button>
          </div>
        </div>
        <div data-drag-stay className="pt-3 px-4 border-t border-(--bd-500-20) text-[11px] text-(--tx-300-60) space-y-0.5">
          {/* All four footer text links carry rounded-md px-1 -mx-1: the padding gives the press-drag
              ring breathing room around the text and the radius rounds its corners (vs a square outline
              hugging the glyphs); the negative margin cancels the padding so the text keeps its exact
              flow position. */}
          {/* Saved-defaults link row (Q7 + Q12 + Q5 round-6). View saved defaults is ALWAYS
              visible — with nothing saved it opens the defaults manager on its clearly-labelled
              FACTORY view (there is always something to see, and to edit, now that the popup is
              the editable manager below). Clear saved defaults still appears only while a
              snapshot exists — with nothing saved there is nothing to clear. View sits LEFT of
              Clear, matching the button trio's left→right escalation; the row wears the shared
              FOOTER_LINK_ROW_CLASS (defined up top, and worn by the Last Updated row below —
              round-7 Q2): its gap-3 keeps ~4px between the two press-drag rings (each ring
              extends px-1 past its text), its flex-wrap is the narrow-viewport fallback. Clear
              is the ONLY way back to factory semantics (the Save Defaults popup's duplicate
              link was removed in Round-4 — one action, one home), and it now opens a small
              CONFIRM modal (Cancel + a red-tier Clear, below) instead of firing immediately.
              This footer row (the same muted tier as Check for updates below) is always
              reachable: the Save Defaults button dims + locks exactly when live == saved, but
              the footer never hides behind it. FIRST link row, directly under the button trio
              (Round-2): these are the only actionable settings in this block, and they belong
              to the trio's story — below it the footer decays into contact info and metadata.
              The row inherits the footer's data-drag-stay, so a drag-release on either link
              acts with the panel staying open (each opens its modal over the panel). */}
          <div className={FOOTER_LINK_ROW_CLASS}><button type="button" onClick={openManageDefaults} className="underline select-none rounded-md px-1 -mx-1">View saved defaults</button>{savedDefaults!==null&&<button type="button" onClick={()=>setClearConfirmOpen(true)} className="underline select-none rounded-md px-1 -mx-1">Clear saved defaults</button>}</div>
          <div>Contact: <a href="mailto:dayoftheweekcalculation@gmail.com" className="underline break-all select-text rounded-md px-1 -mx-1">dayoftheweekcalculation@gmail.com</a></div>
          <div className={FOOTER_LINK_ROW_CLASS}>
            <span>Last Updated: {(()=>{const d=DEPLOY_TS;const yy=d.getFullYear();const mo=d.getMonth()+1;const da=d.getDate();const numFmt=numericFormatOf(dateFormat);const datePart=fmt(yy,mo,da,numFmt);const timePart=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});return`${datePart} ${timePart}`;})()}</span>
            {/* Check for a newer deployed version and apply it if there is one (Q7, round 11 — it used
                to reload unconditionally). Styled like the Contact email link above (inherits the
                footer's text-(--tx-300-60)) so it matches the surrounding footer text on every theme,
                with three deliberate departures:
                  • THE HIDDEN STRUT. The button is a one-cell grid holding the resting label twice —
                    an aria-hidden copy that only reserves width, and the live label stacked on it. So
                    the button is always exactly as wide as "Check for updates" (the longest of the
                    four by construction — lib/updateCheck pins it) and the Changelog link beside it
                    can never shift when the label changes. justify-items-CENTER splits the slack
                    evenly, so each shorter label sits centred in the gap between the Last Updated
                    stamp and Changelog rather than hugging one edge (owner's call 2026-08-02,
                    overriding an earlier justify-items-start that anchored them left). The resting
                    label is the widest, so it fills the cell exactly and centring cannot move it —
                    only the three status labels shift, which is the whole point. Note the CENTRE is
                    the button's own fixed cell, NOT the row: it stays put however wide the date in
                    the timestamp renders, so nothing here is position-dependent on that.
                  • UNDERLINE ONLY AT REST. The other three labels are STATUS, not actions; wearing the
                    interaction signal while not being the interaction is the round-3 block-hover
                    mistake. The button still IS pressable during a result — a tap starts another
                    check — but it is not offering the same thing, so it does not claim to.
                  • DISABLED while checking, so the state the label reports is the state the control
                    is in. No aria-live: a tap leaves focus on the button, where the accessible name
                    changing is announced anyway, and a live region inside a control double-announces
                    on some screen readers — an unverifiable trade for no gain. */}
            <button type="button" onClick={onCheckUpdates} disabled={updateCheck==='checking'} className="select-none rounded-md px-1 -mx-1 grid justify-items-center"><span aria-hidden="true" className="col-start-1 row-start-1 invisible whitespace-nowrap">{UPDATE_CHECK_LABEL.idle}</span><span className={`col-start-1 row-start-1 whitespace-nowrap ${updateCheck==='idle'?" underline":""}`}>{UPDATE_CHECK_LABEL[updateCheck]}</span></button>
            {/* Changelog (Q6), RIGHT of Check for updates — the two update-flavored links live
                together, force-the-latest then read-what-changed. Same footer-link recipe, in a
                row wearing the same shared FOOTER_LINK_ROW_CLASS as the View/Clear row above
                (round-7 Q2 — this row's legacy gap-2 left its rings touching at 0px clearance
                vs the ~4px above); wears the INLINE UpdateDot until its first tap after a build
                change — the second stage of the breadcrumb the gear's dot starts.
                Round-8 Q7 rebuilt that marker: a text link reserves no room for the gear's corner
                badge, so the round-6 shared recipe put the dot on top of the word. The link is an
                inline-flex row now — the text in its own span, the marker its sibling — and the
                underline moved ONTO that span so the rule can never paint across the gap. The
                marker's slot is reserved lit or not (index.css), so lighting up shifts nothing;
                being aria-hidden, it needs the sr-only word beside it to reach a screen reader,
                which is also the only update signal left once the gear's dot has been retired.
                ⚠ That word carries its own COMMA rather than the gear's "(update)" parenthetical:
                the name-from-content algorithm trims each child's text before joining them, so a
                leading space is dropped and the two would run together ("Changelog(update)"). A
                printing separator is the only one that survives the join. */}
            <button type="button" onClick={openChangelog} className="inline-flex items-center select-none rounded-md px-1 -mx-1"><span className="underline">Changelog</span>{changelogDot&&<span className="sr-only">, update</span>}<UpdateDot placement="inline" lit={changelogDot}/></button>
          </div>
        </div>
      </div>);
      // Save Defaults confirmation popup (Q7). PORTALED to #root — deliberately OUTSIDE the
      // popover card (the ⚙ trigger's aria-controls menu), so its DOM is invisible to the press-drag controller
      // (a drag-release on popup content can never drag-dismiss the panel) and it escapes the
      // card's overflow/max-height context (a true centered modal — scrim + the popover's own
      // card/shadow language). data-settings-modal marks the whole tree (scrim included) "inside"
      // for the settings click-outside handler above (the same marker as the manager, Clear
      // confirm, and Changelog popups below — one guard covers all four modals); the scrim itself
      // cancels the POPUP only (target===currentTarget, so card clicks never do), and Escape +
      // Android Back + any settings close also cancel (the effects above). The card itself is the
      // shared DefaultsCard (Q5 round-6 — the one place the four rows, their recipes, and the
      // dirty-row accent live; see its header comment): row labels are Title Case (the ⚙ panel's
      // label tier, Q6) with every paired aria-label mirroring its visible text exactly — no case
      // drift to maintain, WCAG label-in-name safe. Edits touch ONLY the pending snapshot: the
      // three sliders mirror the mode screens' (same ranges/steps/--rng-fill, and the same
      // tap-to-type SliderValueEditor readouts — the popup seeds from the LIVE prefs, so its
      // ranges must stay a superset of every committable value) and the N field shares the AoX
      // input's validation trio (Q18 — one idiom, one clamp): digits only while typing (the
      // pending snapshot never holds junk), and blur, Enter and Escape all normalize-commit with
      // the shared normalizeAoxN clamp (2–1000, fallback 10) — the AoX field's Escape likewise
      // commits; the popup's real discard is Cancel.
      // Modal a11y contract, part 2 of 2 (part 1 = the focus-on-open effects above): the card is a real
      // role="dialog" aria-modal, and the scrim's Tab handler is the focus trap — plain Tab / Shift+Tab
      // cycle the popup's own controls and WRAP at the ends (native traversal in between), never
      // escaping to the settings panel under the scrim. Shared by ALL FOUR settings modals (the Save
      // Defaults card, the defaults manager Q12+Q5, the Clear confirm Q5, and the Changelog popup Q6
      // — the Changelog's single Close button is first===last, so Tab wraps in place). stopPropagation
      // keeps the press from the app-wide Tab shortcut (which would open the mode selector behind
      // the modal); the shortcut's own handler also bails while a modal is mounted for presses
      // that start outside the scrim's tree.
      const trapModalTab=(e: React.KeyboardEvent<HTMLDivElement>)=>{
        if(e.key!=='Tab')return;
        e.stopPropagation();
        const f=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,input'));
        if(f.length===0)return;
        const first=f[0],last=f[f.length-1],ae=document.activeElement;
        if(e.shiftKey){if(ae===first||!e.currentTarget.contains(ae)){e.preventDefault();last.focus();}}
        else if(ae===last||!e.currentTarget.contains(ae)){e.preventDefault();first.focus();}
      };
      const saveDefaultsJsx=saveDefaultsOpen&&ReactDOM.createPortal(
        (<div data-settings-modal role="presentation" className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4" onClick={e=>{if(e.target===e.currentTarget)setSaveDefaultsOpen(false);}} onKeyDown={trapModalTab}>
          <DefaultsCard cardRef={saveDefaultsCardRef} titleId="save-defaults-title" title="Save current settings as your defaults?" subline="Also saved from the mode screens:" prefs={pendPrefs} seed={pendSeed} setPrefs={setPendPrefs} onClose={closeSaveDefaults} onSave={commitSaveDefaults}/>
        </div>),
        document.getElementById('root')!
      );
      // The defaults manager popup (Q12, made editable in Q5 round-6): the footer link's window
      // onto the defaults — the same portal / scrim recipes and the same modal contract as the
      // Save popup (focus-on-open, capture Escape with the text-entry guard, close with settings,
      // Android Back, the shared trapModalTab + data-settings-modal marker), rendering the SAME
      // shared DefaultsCard in manage mode. It seeds from the EFFECTIVE defaults (defPrefs —
      // forward-merged, so a legacy snapshot missing a field shows factory, never undefined) and
      // rests read-only (one full-width Close); edit any row and it goes dirty — Cancel + Save,
      // the restricted-write note, the accent-tier value highlights (see DefaultsCard). Title,
      // subline, and footnote adapt to whether a snapshot exists: with none saved the card is the
      // clearly-labelled FACTORY view, and Save from there CREATES the snapshot.
      const manageDefaultsJsx=manageDefaultsOpen&&ReactDOM.createPortal(
        (<div data-settings-modal role="presentation" className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4" onClick={e=>{if(e.target===e.currentTarget)setManageDefaultsOpen(false);}} onKeyDown={trapModalTab}>
          <DefaultsCard cardRef={manageDefaultsCardRef} titleId="manage-defaults-title" manage
            title={savedDefaults?"Your saved defaults":"Default settings"}
            subline={savedDefaults?undefined:"These are the factory defaults — you haven't saved your own."}
            note={savedDefaults?"Every ⚙ menu setting is also part of the snapshot, captured as it was when you saved.":undefined}
            prefs={managePrefs} seed={defPrefs} setPrefs={setManagePrefs} onClose={closeManageDefaults} onSave={commitManageDefaults}/>
        </div>),
        document.getElementById('root')!
      );
      // Clear-saved-defaults confirm popup (Q5 round-6): the same portal / scrim / card recipes
      // and the same modal contract (focus-on-open, capture Escape, close with settings, Android
      // Back, the shared trapModalTab + data-settings-modal marker). Two buttons — Cancel in the
      // shared dismiss recipe, Clear in the danger tier (RESET_BTN_CLASS, the rose fill every
      // destructive control wears) — a real confirm modal because a link that flips its own text
      // to confirm reads strangely (the owner's call over a two-tap arm).
      const clearConfirmJsx=clearConfirmOpen&&ReactDOM.createPortal(
        (<div data-settings-modal role="presentation" className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4" onClick={e=>{if(e.target===e.currentTarget)setClearConfirmOpen(false);}} onKeyDown={trapModalTab}>
          <div ref={clearConfirmCardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="clear-defaults-title" style={{boxShadow:'0 0 8px rgba(0,0,0,0.12)'}} className="card rounded-2xl p-4 w-full max-w-[20rem] space-y-3 focus:outline-hidden">
            <div id="clear-defaults-title" className="text-sm font-semibold text-(--tx-50)">Clear your saved defaults?</div>
            <div className="text-xs text-(--tx-200-80)">This only forgets the snapshot — your current settings stay as they are, and the launch defaults take over.</div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={closeClearConfirm} className="flex-1 px-3 py-2 rounded-xl text-sm font-medium border surface-toggle text-(--tx-100-80)">Cancel</button>
              <button type="button" onClick={confirmClearDefaults} className={`flex-1 ${RESET_BTN_CLASS}`}>Clear</button>
            </div>
          </div>
        </div>),
        document.getElementById('root')!
      );
      // Changelog popup (Q6): the plain-words what-changed list (src/changelog, newest day
      // first), opened from the footer's Changelog link — the same portal / scrim / card recipes
      // and the same modal contract as the popups above (focus-on-open, capture Escape, close
      // with settings, Android Back, the shared trapModalTab + data-settings-modal marker; the one
      // control is a full-width Close, input-free like the Clear confirm). CHANGELOG renders AS-IS:
      // round-8 Q8 dropped the render-time slice and moved the ten-day cap to the data itself (see
      // the charter in src/changelog), so what the module holds is exactly what a visitor downloads
      // and exactly what draws here — no entry ships only to be refused. The list sits
      // inside its own scroll region on the shared settings recipe (Q5 round-7,
      // components/scrollRegion): the card owns py-4 only while the title, scroll region, and
      // Close row each carry px-4, so the scroller's 1rem right padding is the text-free lane
      // the iOS scrollbar paints in; SCROLL_REGION_CLASS + scrollFadeClass (fed by the
      // changelogScrollRef edge listener up with the popover's) add the edge fades, and max-h
      // keeps a long history scrolling within the card without growing it off-screen. Entry
      // dates render through the footer's Last-Updated recipe (fmt + numericFormatOf) so they
      // follow the user's Date Format setting; the bullet list is the guide's UL idiom
      // (list-disc + the --mut-color marker). The card is title → list → Close and NOTHING else:
      // round-8 Q8 added a one-line "Shows the last ten days with updates." notice between the
      // scroller and Close, and the owner removed it (round-9) on the rule that this popup answers
      // WHAT CHANGED, while how the app keeps its history is documentation — so the ten-day cap is
      // explained in How to Play (the Updates section) and nowhere else. Don't re-add it here.
      // The one-control card is also what keeps the single-button Tab trap above valid, with Close
      // as first===last.
      const changelogJsx=changelogOpen&&ReactDOM.createPortal(
        (<div data-settings-modal role="presentation" className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4" onClick={e=>{if(e.target===e.currentTarget)setChangelogOpen(false);}} onKeyDown={trapModalTab}>
          <div ref={changelogCardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="changelog-title" style={{boxShadow:'0 0 8px rgba(0,0,0,0.12)'}} className="card rounded-2xl py-4 w-full max-w-[20rem] space-y-3 focus:outline-hidden">
            <div id="changelog-title" className="px-4 text-sm font-semibold text-(--tx-50)">What's new</div>
            <div ref={changelogScrollRef} className={`${SCROLL_REGION_CLASS} max-h-[55vh] space-y-3 ${scrollFadeClass(changelogScrolledFromTop,changelogAtBottom)}`}>
              {CHANGELOG.map(en=>{const [yy,mo,da]=en.date.split('-').map(Number);return(
                <div key={en.date} className="space-y-1">
                  <div className="text-xs font-semibold text-(--tx-100-80)">{fmt(yy,mo,da,numericFormatOf(dateFormat))}</div>
                  <ul className="list-disc pl-4 space-y-1 marker:text-(--mut-color) text-xs text-(--tx-200-80)">{en.items.map((it,i)=><li key={i}>{it}</li>)}</ul>
                </div>);})}
            </div>
            <div className="px-4 pt-1"><button type="button" onClick={closeChangelog} className="w-full px-3 py-2 rounded-xl text-sm font-medium border surface-toggle text-(--tx-100-80)">Close</button></div>
          </div>
        </div>),
        document.getElementById('root')!
      );
      return(
        <>
          {/* Both overlays are fixed z-100 covers; the Updating screen renders LATER in the DOM
              so it wins if a landscape launch coincides with an update (the reload happens
              regardless — rotating can't pause it, so Updating is the truthful screen). */}
          {landscapeBlocked?<RotateOverlay/>:null}
          {updating?<BootOverlay updating/>:null}
        {/* Bar (position:fixed): the bar is a CHROME-STYLE fixed element above
            everything — explicitly positioned at the viewport top so iOS PWA recognizes
            it as chrome UI and live-samples its bg-(--bg1) (theme-aware) for the
            status bar color. Sibling appScrollRef container sits below with
            padding-top:var(--bar-h) so its content starts below the bar
            (position:absolute in the clamped modes; a plain flow block in guide mode,
            where the document scrolls — see docScroll).
            syncBarHeight elsewhere in App writes the bar's fractional rect height to --bar-h.
            Full width (no max-w) so theme bg + elevation shadow span edge-to-edge on
            screens wider than 480px; inner max-w-[30rem] wrapper holds the title row.
            elev-shadow-down is UNCONDITIONAL — the bar is always this screen's top boundary, and
            how strongly it says so is the 0…1 --shade the edge effect writes onto this element
            (0 at rest, ramping to full over the first --fade-h of scroll). The class used to be
            toggled and cross-faded by a CSS transition, which is what left a shadow visibly
            fading out after a status-bar tap had already stopped the page dead.
            HtP-only bar pb-2.5: absorbs half (10px) of the 20px gap that sits between the title
            row and the first GuidePage panel. That gap used to be one mt-5 on the guide's
            wrapper; GuidePage's own root now carries the matching mt-2.5 instead, so the total
            stays 20px — but the visual "lock line" is centered between title row and first panel
            rather than sitting right at the title row's bottom edge. It is a GUIDE number, not an
            app-wide one: the game modes open on StatPanel's own mt-4 and Lookup on an mt-5
            wrapper, neither of which this pb-2.5 applies to.
            ⚠ The SPACE in `pt-5 ${` is REQUIRED — Tailwind v4's source scanner silently drops a
            utility glued directly to `${` when it appears nowhere else; without it the bar lost
            its pt-5 (20px) top padding and the whole site sat ~20px too high. Don't remove the
            space — tests/classGlueGuard.test.js now fails the suite on any glued class site.
            (Calendar Game layout bug-fix, 2026-06-01.) */}
        <div ref={htpStickyBarRef} style={{position:'fixed',top:0,left:0,right:0,zIndex:30}} className={`htp-sticky-bar elev-shadow-down bg-(--bg1) w-full pt-5 ${mode==="guide"?" pb-2.5":""}`}>
          <div className="mx-auto px-4 w-full max-w-[30rem] relative">
            <div className="flex items-center justify-between gap-2">
              {/* header left: title */}
              <div className="flex items-center gap-2 shrink-0">
                <W5Logo className="shrink-0" />
                <h1 className="text-xl font-semibold leading-none shrink-0">Calendar Game</h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* gear settings button */}
                <div className="relative" ref={settingsRef}>
                  {/* C2: the ⚙ is a press-drag trigger — pointerdown OPENS the panel so you can drag straight
                      into it + release on a control. aria-controls names its menu (the popover card,
                      id="settings-popover") so the pointer controller pairs the gesture with THIS panel,
                      resolved live by id (a press that CLOSES the panel pairs with nothing → inert). The
                      isPrimary/button guard mirrors the controller's pointer latch: a second finger or a
                      right-click must not toggle. onClick is kept for keyboard/tests; the controller
                      suppresses the trigger's click on a real press so it doesn't double-toggle.
                      gear-modified (Q8, the flush inside-bottom violet bar — index.css) marks live state ≠
                      the saved defaults while the panel is CLOSED (the open gear is solid purple, no
                      bar); the CORNER UpdateDot marks an update landed since the panel was last opened
                      (opening clears the flag — the effect above — so it too only ever shows CLOSED).
                      The gear is the one host in the app that clears the corner badge's per-axis
                      padding precondition (components/UpdateDot + index.css spell it out); its own
                      literal `relative` is what makes it the marker's containing block, since neither
                      indicator's class may be counted on to be present. The marker is aria-hidden, so
                      the aria-label carries BOTH booleans in every combination — the only accessible
                      name this button has, its visible content being a bare glyph. */}
                  <button type="button" data-select-trigger aria-controls={settingsOpen?"settings-popover":undefined} onPointerDown={e=>{if(!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;setSettingsOpen(v=>!v);}} onClick={()=>setSettingsOpen(v=>!v)} className={`relative px-2.5 py-2 rounded-xl text-sm border ${settingsOpen?"btn-solid border-transparent":`panel text-(--tx-100-80) ${settingsModified?" gear-modified":""}`}`} aria-label={(()=>{const parts=[settingsModified?"modified":"",gearDot?"update":""].filter(Boolean);return parts.length?`Settings (${parts.join(", ")})`:"Settings";})()}>⚙<UpdateDot placement="corner" lit={gearDot}/></button>
                </div>
                {/* mode selector */}
                {/* Mode CustomSelect. Replaced the original native <select> as part of the
                    site-wide CustomSelect rollout that fixed iOS Safari's native picker
                    auto-close bug — see the CustomSelect component for full context.
                    wrapperRef={modeSelectRef} so the existing settings click-outside handler
                    keeps treating taps inside the mode dropdown the same way it treated taps
                    on the original <select>. showChevron renders the same ▲▼ indicator.
                    The menu always opens DOWNWARD, with no prop and no longer any flip logic to
                    say so (Q8, round 11 deleted round-8's auto-flip): the trigger sits IN the bar
                    the flip measured the space above against, so that space was structurally
                    negative and the branch was unreachable. This trigger is also WHY the panel can
                    be viewport-fixed and measured once per open — fixed chrome is the one place no
                    scroller can move it out from under the panel (see the caller contract at the
                    top of components/CustomSelect). */}
                <CustomSelect wrapperRef={modeSelectRef} value={mode} onChange={(v)=>{switchMode(v);setSettingsOpen(false);}} options={MODE_LABELS} ariaLabel="Mode" showChevron pressDrag className="panel rounded-xl px-2.5 py-2 pr-9 text-sm focus:outline-hidden focus-ring text-left"/>
              </div>
            </div>
            {settingsJsx}
            {saveDefaultsJsx}
            {manageDefaultsJsx}
            {clearConfirmJsx}
            {changelogJsx}
          </div>
        </div>
        {/* Scroll container. Clamped modes (everything but HtP): position:absolute inset:0
            with padding-top:var(--bar-h) so content starts immediately below the bar;
            overscroll-contain keeps rubber-band bounce LOCAL to this container (bar is
            unaffected); the fade-scroll-* masks mark overflowing edges. This is the one
            scroller on SCROLLER_CORE_CLASS rather than SCROLL_REGION_CLASS
            (components/scrollRegion): it fills the viewport, so its scrollbar already paints
            at the screen edge past the content wrapper's px-4 — no inner lane needed. Guide
            mode (docScroll): the DOCUMENT scrolls instead — same div, same ref, same
            padding-top, but a plain classless flow block (no clamp/overflow/mask classes; the
            doc-fade strips below replace the masks), and the inner wrapper trades pb-3 for the
            same 0.75rem plus the safe-area inset — in document flow the 100dvh #root clamp no
            longer keeps the last panel above the iPhone home indicator. */}
        <div ref={appScrollRef} style={{paddingTop:'var(--bar-h)'}} className={docScroll?undefined:`absolute inset-0 ${SCROLLER_CORE_CLASS} ${scrollFadeClass(appScrolledFromTop,appAtBottom)}`}>
        {/* Mode-content wrapper. min-h-full + flex column: the clamped scroller above has a
            definite height, so "at least a screenful" gives a mode that wants to FIT the screen
            (Lookup) a definite box to fill, while a mode taller than the screen still grows
            normally and keeps its pb-3 under the content. Every child is a plain non-growing flex
            item pinned to the top, so the six always-mounted screens look exactly as before (the
            hidden ones are display:none and drop out of flex layout entirely). In guide mode the
            scroller is a classless auto-height block, so min-height:100% resolves against an
            indefinite height and is INERT there — the document scrolls as it always did. */}
        <div className={`mx-auto px-4 w-full max-w-[30rem] min-h-full flex flex-col ${docScroll?" pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]":" pb-3"}`}>
          {/* key={aoxResetKey} forces remount on Full Reset since AoxMode is always-mounted
              (display:none toggle on visible prop, not conditional rendering) and its internal
              state would otherwise persist across resets. See aoxResetKey declaration upstream
              for full rationale. */}
          {/* Per-mode error boundaries (ModeErrorBoundary): a crash in one mode is isolated —
              the bar + switcher + other modes keep working. The mode's reset key lives on the
              BOUNDARY now (not the inner component) so Full Reset remounts boundary+component
              together (clearing any caught error AND resetting the component's state). The
              always-mounted modes pass `active` so a hidden mode's crash paints nothing. */}
          <ModeErrorBoundary key={"aox-"+aoxResetKey} mode="AoX" active={mode==="aox"}>
            <AoxMode minY={minY} maxY={maxY} visible={mode==="aox"} fmtDate={fmtDate} useJulian={useJulian} genDate={genDate} leapChance={leapChance} janFebChance={janFebChance} julianChance={julianChance} randomFormat={randomFormat} inputStyle={inputStyle} dateFormat={dateFormat} saveStats={saveStats} settingsOpen={settingsOpen} onFreshChange={setAoxIsFresh}/>
          </ModeErrorBoundary>
          <ModeErrorBoundary key={"classic-"+classicResetKey} mode="Classic" active={mode==="classic"}>
            <ClassicMode visible={mode==="classic"} genDate={genDate} minY={minY} maxY={maxY} useJulian={useJulian} saveStats={saveStats} dateFormat={dateFormat} randomFormat={randomFormat} inputStyle={inputStyle} leapChance={leapChance} janFebChance={janFebChance} julianChance={julianChance} fmtDate={fmtDate} settingsOpen={settingsOpen} onFreshChange={setClassicIsFresh}/>
          </ModeErrorBoundary>
          <ModeErrorBoundary key={"flash-"+flashResetKey} mode="Flash" active={mode==="flash"}>
            <FlashMode visible={mode==="flash"} genDate={genDate} minY={minY} maxY={maxY} useJulian={useJulian} saveStats={saveStats} dateFormat={dateFormat} randomFormat={randomFormat} inputStyle={inputStyle} leapChance={leapChance} janFebChance={janFebChance} julianChance={julianChance} fmtDate={fmtDate} settingsOpen={settingsOpen} clockPaused={landscapeBlocked} onFreshChange={setFlashIsFresh}/>
          </ModeErrorBoundary>
          <ModeErrorBoundary key={"blitz-"+blitzResetKey} mode="Blitz" active={mode==="blitz"}>
            <BlitzMode visible={mode==="blitz"} genDate={genDate} minY={minY} maxY={maxY} useJulian={useJulian} saveStats={saveStats} dateFormat={dateFormat} randomFormat={randomFormat} inputStyle={inputStyle} leapChance={leapChance} janFebChance={janFebChance} julianChance={julianChance} fmtDate={fmtDate} settingsOpen={settingsOpen} clockPaused={landscapeBlocked} onFreshChange={setBlitzIsFresh}/>
          </ModeErrorBoundary>
          <ModeErrorBoundary key={"deduction-"+deductionResetKey} mode="Deduction" active={mode==="deduction"}>
            <DeductionMode visible={mode==="deduction"} minY={minY} maxY={maxY} useJulian={useJulian} saveStats={saveStats} dateFormat={dateFormat} randomFormat={randomFormat} leapChance={leapChance} janFebChance={janFebChance} julianChance={julianChance} settingsOpen={settingsOpen} onFreshChange={setDeductionIsFresh}/>
          </ModeErrorBoundary>
          {/* Lookup is the one FIT-TO-SCREEN mode: its wrapper takes the screenful the flex column
              above guarantees, and LookupCard divides it up (top card natural, history list gets
              the rest and scrolls). h-0 is what makes that exact rather than approximate — a flex
              item's height also feeds the PARENT's intrinsic height, so with height:auto a long
              history would push the wrapper past a screenful and the page would scroll again (the
              very bug the list's old fixed 440-pixel cap existed to prevent). height:0 adds nothing,
              the parent stays at its min-height (one screenful), and flex-auto grows this back to
              fill it. Rests on the same definite-height #root the clamped scroller already needs. */}
          {mode==="lookup"&&(<ModeErrorBoundary mode="Lookup" active={true}><div className="mt-5 flex flex-col flex-auto h-0 min-h-0"><LookupCard history={lookupHistory} onAddHistory={pushLookupHistory} onMoveHistory={moveHistoryEntryToTop} onClearHistory={clearLookupHistory} inputValue={lookupInput} onInputChange={setLookupInput} outputValue={lookupOutput} onOutputChange={setLookupOutput} calcDate={lookupCalcDate} onCalcDateChange={setLookupCalcDate} selectedHistoryId={lookupSelectedHistoryId} onSelectedHistoryIdChange={setLookupSelectedHistoryId} calcOpen={lookupCalcOpen} onCalcOpenChange={setLookupCalcOpen} fmtDate={fmtDate} dateFormat={dateFormat} useJulian={useJulian}/></div></ModeErrorBoundary>)}
          {/* How to Play is always-mounted like the five game modes (Q6, round 9), and for the same
              reason they are: leaving a screen must not destroy what you had set up on it. It used
              to be conditionally rendered, which is why a detour into a game mode closed whichever
              panel you had open — the component was unmounted and its state went with it. The
              display toggle lives on GuidePage's OWN root, where its mt-2.5 also lives: a wrapper
              here would keep that 10px margin in the flex column on every OTHER screen, silently
              lengthening them past the viewport (a phantom bottom fade and a scrollbar on modes
              that used to fit exactly). display:none generates no box at all, so the other five
              modes are untouched. `visible` also tells GuidePage to drop any in-flight scroll
              glide — with no unmount to do it, that is now the component's own job. */}
          <ModeErrorBoundary key={"guide-"+guideResetKey} mode="How to Play" active={mode==="guide"}><GuidePage visible={mode==="guide"}/></ModeErrorBoundary>
        </div>
        </div>
        {/* Doc-scroll edge fades (guide mode only): the fade-scroll-* masks live ON the scroll
            container and fade its CONTENT box — meaningless once the document scrolls (the
            mask's bottom edge would sit at the end of the whole document, off-screen). These
            fixed, untouchable strips paint the same --fade-h feather over the VIEWPORT edges
            instead (see index.css). position:fixed is correct here — this is the real app
            viewport, not a transformed portal; the top strip tucks under the fixed bar at
            --bar-h, the bottom strip hugs the viewport floor.
            Mounted for the WHOLE of guide mode, not per edge state: each strip's opacity is the
            --shade the edge effect writes onto it, so a strip whose edge is unreached is already
            invisible and mounting it conditionally would only re-add the on/off this round took
            out (round 10 item B). Guide mode is also the one place these are progressive; every
            other panel's mask fade is still a state class — see the index.css note. */}
        {docScroll?<div ref={docFadeTopRef} aria-hidden="true" className="doc-fade-top"/>:null}
        {docScroll?<div ref={docFadeBottomRef} aria-hidden="true" className="doc-fade-bottom"/>:null}
        </>
      );
    }

    // GuidePage / GuideSection (How-to-Play) → src/components/GuidePage.jsx, imported at top.

    // Show Codes panel ordering follows the date's display format (left-to-right reading
    // order), with Leap appearing once both year and month are visible. mdy/dmy formats:
    // month/day/ab/cd/leap. ymd format: ab/cd/month/leap/day. Uses the date's _fmt
    // snapshot when randomFormat is on (passed as displayedFormat), else the user's
    // selected format.
    //
    // When `cellDates` is provided (Deduction Month sub-mode 1582 only — answer cell
    // groups months from both calendars), each code value is collected across all
    // interpretations and joined with slashes, deduped via Set (insertion-order
    // preserved). Calendar text follows the same dedup rule: "Julian/Gregorian Calendar"
    // not "Julian/Julian/Gregorian". Cell ordering naturally produces Julian-first since
    // Julian months come first in the cell labels (e.g., Aug/Dec, Jan/Nov).
    // MethodBreakdownSection (the whole Show Codes panel: button, Expander, freeze contract) →
    // src/components/MethodBreakdown.jsx, imported at top. All five of this file's codes panels
    // go through it, AoX included since Q5 (round 8).

    // LookupCard → src/components/LookupCard.jsx, imported at top.

    // Browser entry: mount into #root (provided by index.html). The mount is guarded on
    // #root's presence so that importing this module from a characterization test does NOT
    // auto-mount a second copy — tests `import { App }`, create a #root (for CustomSelect's
    // portal), and mount via Testing Library into their own container. At test-import time
    // #root doesn't exist yet (tests create it in beforeEach), so this is skipped; in the
    // real build #root is in the HTML before this module runs. (The eventual thin entry /
    // app-module split falls out naturally during the Step-6 cleanup; this is the minimal
    // touch needed to make App testable for the safety net.)
    const rootEl = typeof document !== "undefined" ? document.getElementById("root") : null;
    if (rootEl) ReactDOM.createRoot(rootEl).render(<ErrorBoundary><App/></ErrorBoundary>);

    // Real-user error reporting (C1). DEPLOYED builds only. This flag is the BUILD-time half —
    // import.meta.env.PROD is false in `vite dev`, so dev never reports — but it is true for a
    // locally-SERVED production build too, so initObservability() adds the runtime half and refuses
    // on a loopback host (Q9). Lazy-loads the Sentry SDK as its own chunk (see
    // src/observability/sentry.ts); the error boundaries above call captureError() on a crash.
    if (rootEl && import.meta.env.PROD) initObservability();

    // Dev-only Core Web Vitals logging (Stage E0). The static import.meta.env.DEV guard
    // makes this dead code in a production build, so the call, reportWebVitals, and the
    // web-vitals library are all tree-shaken out of the shipped bundle.
    if (rootEl && import.meta.env.DEV) reportWebVitals();

    // Exported for the Step-6 characterization tests (the mode-untangle safety net). randomDate +
    // makeDedPuzzle are the real date/puzzle generators — exported for the C2 date-generation fuzz
    // (tests/dateGen.dom), which drives them across every settings combination to prove no setting can
    // produce a malformed or unanswerable question. bootHoldRemaining is the pure boot-splash hold
    // calculation (tests/bootSplash.dom). makeUpdateReloadGate + consumeSkipBootHold are the
    // auto-update path's testable core — the two-signal reload gate and the one-time post-update
    // splash-skip flag (tests/updateReloadGate.dom, tests/bootSplash.dom); the PROD-gated update
    // effect itself never runs under Vitest, it only wires these to the real SW.
    export { App, randomDate, makeDedPuzzle, bootHoldRemaining, BootOverlay, makeUpdateReloadGate, consumeSkipBootHold };
