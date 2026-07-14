import './index.css' // Tailwind (v3, compiled in-build) + the app's custom CSS — replaces the old Play-CDN <script> + inline <style>.
import * as React from 'react'
import ErrorBoundary, { ModeErrorBoundary } from './ErrorBoundary'
import { initObservability } from './observability/sentry'
// The original loaded the full ReactDOM UMD global, which exposes BOTH createRoot and
// createPortal. The modern modular build splits them: createRoot is in 'react-dom/client',
// createPortal is in 'react-dom'. Reconstruct a ReactDOM with both so the app's
// ReactDOM.createRoot (mount) and ReactDOM.createPortal (dropdowns/popovers) both work.
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import {
  isLeap, isLeapJulian, wday,
  wdayJulian, isJulianDate, isGapDate, rangeHasLeapYear,
} from './lib/calendar.js'
import { DAY, fmtYear, fmt, fmtPartial, numericFormatOf } from './lib/format.js'
import Expander from './components/Expander.jsx'
import StatPanel from './components/StatPanel.jsx'
import SliderValueEditor from './components/SliderValueEditor.jsx'
import { NewBestStar, SectionLabel } from './components/primitives.jsx'
import CustomSelect from './components/CustomSelect.jsx'
import GuidePage from './components/GuidePage.jsx'
import LookupCard from './components/LookupCard.jsx'
import { MethodExplanation, MethodBreakdownSection } from './components/MethodBreakdown.jsx'
import W5Logo from './components/W5Logo.jsx'
import { useBackButton } from './components/useBackButton.js'
import { CODES_CLOSE_MS } from './lib/constants.js'
import { DOT_CELL } from './lib/dotLayout.js'
import { sharedFitScale } from './lib/statFit.js'
import { bootFlowOffset, BOOT_FLOW_FALLBACK_LEN } from './lib/bootFlow.js'
import { installPointerGestures } from './lib/pointerGestures.js'
import { useSettings, SETTINGS_DEFAULTS } from './store/settings.js'
import type { InputStyle, SettingsValues } from './store/settings.js'
import { useModePrefs } from './store/modePrefs.js'
import { useUserDefaults, effectiveSettingsDefaults, effectivePrefDefaults, normalizeAoxN, prefsMatchDefaults } from './store/userDefaults.js'
import type { PrefDefaults } from './store/userDefaults.js'
import { useProgress } from './store/progress.js'
import type { AoxBest, BlitzBest, SuddenBest } from './store/progress.js'
import { calcAvg, calcLast, calcMed } from './engine/stats.js'
import { reconcileBlitzBest, reconcileSuddenBest } from './engine/blitzBest.js'
import { reconcileAoxStanding, aoxBestEqual, emptyAoxBest } from './engine/aoxBest.js'
import { useGameEngine } from './engine/useGameEngine.js'
import { reportWebVitals } from './dev/webVitals.js'
import type { Question, WeekdayQuestion, DedPuzzle, GameState } from './engine/gameReducer.js'
import type { ButtonState } from './engine/answerButtons.js'
import type { FormatId, DatePart } from './lib/format.js'
import type { LookupEntry } from './components/LookupCard.jsx'
import type { CodeDate } from './components/MethodBreakdown.jsx'
const ReactDOM = { createRoot, createPortal }

// --- Shared types for the typed App + mode components (Stage C, TypeScript, final file). ---
type GenDate = (minY: number, maxY: number) => Question
type FmtDate = (y: number, m: number, d: number, fmt?: FormatId) => string
type FlashState = { type: 'good' | 'bad'; idx: number }
type GameEngine = ReturnType<typeof useGameEngine>
interface ModeProps {
  visible: boolean
  minY: number
  maxY: number
  useJulian: boolean
  saveStats: boolean
  dateFormat: FormatId
  randomFormat: boolean
  inputStyle?: InputStyle // day-of-week answer layout (buttons | dots); weekday modes only — Deduction ignores it
  leapChance: string
  janFebChance: string
  julianChance: string
  settingsOpen?: boolean //  the ⚙ popover open state — modes defer their settings side-effects to its CLOSE
  onFreshChange?: (fresh: boolean) => void
}
interface DedOpts {
  useJulian: boolean
  leapChance: string
  janFebChance: string
  randomFormat: boolean
  dateFormat: FormatId
  abCrossOnly: boolean
  julCrossOnly: boolean
  monthOnly1582: boolean
}
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
    // Reset-style button shared className. Used by Reset Stats (Classic/Deduction/Flash),
    // Round Reset (Blitz active), AoX Reset, Settings Reset.
    const RESET_BTN_CLASS="px-3 py-2 rounded-xl bg-rose-600/90 text-white text-sm font-medium";
    // Compact Reset Stats button variant (smaller py + col-span fit for stats panel).
    const RESET_STATS_BTN_CLASS="w-full px-3 py-1.5 rounded-xl btn-solid border border-transparent text-sm font-medium";
    // Reset Stats when ARMED (first tap of the two-tap confirm, Q2): rose/danger fill — the same danger
    // colour as RESET_BTN_CLASS — so "tap again to confirm" reads as a warning, not a normal button.
    const RESET_STATS_ARMED_CLASS="w-full px-3 py-1.5 rounded-xl bg-rose-600/90 text-white border border-transparent text-sm font-medium";
    // Presentational primitives (NewBestStar, SectionLabel, Kbd) + their class consts → src/components/primitives.jsx, imported at top.
    // buttonStateClass — picks the className for an answer-grid button based on its
    // persistent state (correct/wrong-latest/wrong-prev/override-wrong) and any active
    // flash animation. Returns just the state-class portion; the caller composes the
    // full className (base + state + lock/dim).
    //   ps        — persistBtns[idx] value or undefined
    //   isFlashing — whether a flash is active for this button index
    //   flashGood — when flashing, whether it's a good or bad flash
    //   idleClass — fallback for idle state (varies between AoX 'surface-button' and App's idleBtn)
    const buttonStateClass=(ps: ButtonState | undefined,isFlashing: boolean,flashGood: boolean,idleClass: string)=>{
      if(ps==='correct')return'btn-correct-persist border-transparent';
      if(ps==='wrong-latest')return'btn-wrong-persist border-transparent';
      if(ps==='wrong-prev')return'btn-wrong-dim border-transparent';
      if(ps==='override-wrong')return'btn-override-wrong border-transparent';
      if(isFlashing)return(flashGood?"flash-good":"flash-bad")+' border-transparent';
      return idleClass;
    };
    // BASE_BTN — the shared answer-button className (identical across all weekday + Deduction grids).
    const BASE_BTN="w-full rounded-2xl border px-4 py-3 text-base shadow-xs select-none";
    // DOT_CELL — the logo's 7-position layout for the Dots input → src/lib/dotLayout.ts (shared with
    // HtP's DotDiagram, which derives its diagram from the same array), imported at top.
    // WeekdayAnswer — the Sun..Sat answer grid shared by the four weekday modes (Classic/Flash/Blitz/
    // AoX), in EITHER the classic labelled-button layout or the logo's 7-dot layout (Settings → Input;
    // Deduction has its own puzzle grid, not a weekday answer). Both layouts share the per-option state
    // derivation (persist colour / flash / lock / dim) and the same release-aware onClick (the global
    // pointer controller makes every button press-drag-release + makes a data-answer-grid drag-to-select).
    // DOM order is always Sun..Sat so the keyboard 0–9 path (children[idx]) works in both; the dot layout
    // only repositions visually via DOT_CELL. idleClass is 'surface-button' for both (matches every
    // weekday grid). The buttons branch matches the prior inline grids — Classic/Flash/Blitz verbatim,
    // and AoX now also blurs the answer on touch like the others (harmless: just drops focus after a
    // tap) — so behaviour, and the DOM tests that drive it, are unchanged. The dots are unlabelled
    // circles (aria-label carries the accessible day name) sized + positioned by the .dot-box/
    // .dot-cluster/.dot-btn CSS (index.css).
    function WeekdayAnswer({inputStyle,persistBtns,flash,optionsDisabled,onPick}:{
      inputStyle: InputStyle;
      persistBtns: Record<string, ButtonState | undefined>;
      flash: FlashState | null;
      optionsDisabled: boolean;
      onPick: (i: number)=>void;
    }){
      const opt=(i: number)=>{
        const ps=persistBtns[i];
        const isFlashing=!!(flash&&flash.idx===i);
        const bCls=buttonStateClass(ps,isFlashing,flash?.type==="good",'surface-button');
        const perLocked=!!ps;
        const shouldDim=optionsDisabled&&!ps&&!isFlashing;
        // pointer-events-none ONLY when the whole grid is inert (codes open / browsing back / inactive). A
        // perLocked (already-answered) button stays hit-testable so it still highlights as you drag over it
        // (Q4) — the onClick guard below blocks any re-answer, so it can't be re-selected.
        const inert=optionsDisabled;
        const onClick=()=>{if(perLocked)return;onPick(i);if(isTouch)(document.activeElement as HTMLElement | null)?.blur();};
        return {bCls,inert,shouldDim,onClick};
      };
      if(inputStyle==='dots'){
        return(
          <div className="mt-4 dot-box">
            <div className="dot-cluster" data-answer-grid="true">
              {DAY.map((nm,i)=>{const o=opt(i);return(<button key={nm} type="button" aria-label={nm} onClick={o.onClick} style={{gridRow:DOT_CELL[i].r,gridColumn:DOT_CELL[i].c}} className={`dot-btn ${o.bCls} ${o.inert?"pointer-events-none":""} ${o.shouldDim?"opacity-60":""}`}/>);})}
            </div>
          </div>
        );
      }
      return(
        <div className="mt-4 grid grid-cols-2 gap-3" data-answer-grid="true">
          {DAY.map((nm,i)=>{const o=opt(i);const last=i===DAY.length-1?"col-span-2":"";return(<button key={nm} type="button" onClick={o.onClick} className={`${BASE_BTN} ${o.bCls} ${o.inert?"pointer-events-none":""} ${o.shouldDim?"opacity-60":""} ${last}`}>{nm}</button>);})}
        </div>
      );
    }
    // MONTH / DAY name tables → src/lib/format.js, imported at top.
    // MODE_LABELS drives the header mode CustomSelect (the customSelect dropdown
    // that replaced the native <select>). Order here = order shown in the dropdown.
    const MODE_LABELS=[{value:'classic',label:'Classic'},{value:'aox',label:'AoX'},{value:'deduction',label:'Deduction'},{value:'flash',label:'Flash'},{value:'blitz',label:'Blitz'},{value:'lookup',label:'Lookup'},{value:'guide',label:'How to Play'}];
    // Method-code maps + the per-date code summary (METHOD_*, JULIAN_AB_MAP, normalizeMod7,
    // canonicalizeMod, calcDayCode, calcCdCode, yearParts, computeMethodSummary) → src/lib/method.js,
    // imported at top. (computeMethodSummary is the only one used here; the rest are its internals.)
    // Deduction option-count constants. YEAR_OPTION_DEFAULT (5) is the universal max for
    // distinct-codes Year windows in normal Gregorian/Julian play (N=6+ collides). A Year
    // window straddling Oct 15, 1582 collapses to 2 options (the +5 weekday shift across that
    // boundary makes any longer window duplicate) — handled by windowYears length, not a const.
    // DAY_OPTION_COUNT (7) is the standard Day window; the Oct 1582 left-side {1-4} case uses
    // the literal-4 window [1,2,3,4] inline since that's the only valid layout there (codes
    // 1-4 repeat at days 15-18).
    const YEAR_OPTION_DEFAULT=5,DAY_OPTION_COUNT=7;
    // Month deduction boxes — 7 fixed boxes grouping months by shared doomsday code
    // Each box: {label:displayed text, months:[month numbers in that box]}
    const MONTH_BOXES_COMMON=[
      {label:"Jan/Oct",months:[1,10]},      // code 6
      {label:"Feb/Mar/Nov",months:[2,3,11]},// code 2
      {label:"Apr/Jul",months:[4,7]},       // code 5
      {label:"May",months:[5]},             // code 0
      {label:"Jun",months:[6]},             // code 3
      {label:"Aug",months:[8]},             // code 1
      {label:"Sep/Dec",months:[9,12]},      // code 4
    ];
    const MONTH_BOXES_LEAP=[
      {label:"Oct",months:[10]},            // code 6
      {label:"Mar/Nov",months:[3,11]},      // code 2
      {label:"Jan/Apr/Jul",months:[1,4,7]}, // code 5
      {label:"May",months:[5]},             // code 0
      {label:"Jun",months:[6]},             // code 3
      {label:"Feb/Aug",months:[2,8]},       // code 1
      {label:"Sep/Dec",months:[9,12]},      // code 4
    ];
    // 1582-specific Month sub-mode box layouts (only used when useJulian=ON and yc=1582).
    // 1582 has the Julian/Gregorian split: Jan-Sep + Oct1-4 use Julian (year code +1),
    // Oct15+ + Nov + Dec use Gregorian (year code -2). The effective month code = month code + year code.
    // Three day-ranges produce three layouts; only October's box position differs across them.
    const MONTH_BOXES_1582_PRE=[ // Days 1-4 of any month: Oct uses Julian
      {label:"Jan/Oct/Nov",months:[1,10,11]},// sum 0
      {label:"Feb/Mar",months:[2,3]},        // sum 3
      {label:"Apr/Jul",months:[4,7]},        // sum 6
      {label:"May",months:[5]},              // sum 1
      {label:"Jun",months:[6]},              // sum 4
      {label:"Aug/Dec",months:[8,12]},       // sum 2
      {label:"Sep",months:[9]},              // sum 5
    ];
    const MONTH_BOXES_1582_POST=[ // Days 15-31: Oct uses Gregorian (joins Jun)
      {label:"Jan/Nov",months:[1,11]},       // sum 0
      {label:"Feb/Mar",months:[2,3]},        // sum 3
      {label:"Apr/Jul",months:[4,7]},        // sum 6
      {label:"May",months:[5]},              // sum 1
      {label:"Jun/Oct",months:[6,10]},       // sum 4
      {label:"Aug/Dec",months:[8,12]},       // sum 2
      {label:"Sep",months:[9]},              // sum 5
    ];
    const MONTH_BOXES_1582_GAP=[ // Days 5-14: Oct excluded entirely (gap days don't exist in Oct 1582)
      {label:"Jan/Nov",months:[1,11]},       // sum 0
      {label:"Feb/Mar",months:[2,3]},        // sum 3
      {label:"Apr/Jul",months:[4,7]},        // sum 6
      {label:"May",months:[5]},              // sum 1
      {label:"Jun",months:[6]},              // sum 4
      {label:"Aug/Dec",months:[8,12]},       // sum 2
      {label:"Sep",months:[9]},              // sum 5
    ];
    // Day-of-week & calendar math (toAstro, isLeap, dim, jdn*, wday*, isJulian*, isGap*, rangeHasLeapYear) → src/lib/calendar.js, imported at top.
    // Date formatting (fmtYear, fmt, fmtPartial, numericFormatOf) → src/lib/format.js, imported at top.
    const rint=(a: number,b: number)=>Math.floor(Math.random()*(b-a+1))+a;
    function randomDate(lo: number,hi: number,julian=false,leapChance='random',janFebChance='random',julianChance='random'): WeekdayQuestion {
      // Decide leap-year preference based on leapChance setting
      const r=Math.random();
      let wantLeap=null;
      if(leapChance==='100')wantLeap=true;
      else if(leapChance==='75')wantLeap=r<0.75;
      else if(leapChance==='50')wantLeap=r<0.5;
      // janFebChance / julianChance — Option A semantics: the listed % is the exact
      // final probability that the output matches the bias. 'random' means no biasing
      // (natural distribution under the year range + leap settings). On non-'random' values,
      // we roll a separate Math.random() up front so the bias decision is independent of
      // leap. On hit, force toward the bias; on miss, force away. This guarantees the final
      // percentage equals the chosen value rather than (chance × 1 + (1-chance) × natural).
      const rjf=Math.random();
      let wantJanFeb=null;
      if(janFebChance==='100')wantJanFeb=true;
      else if(janFebChance==='75')wantJanFeb=rjf<0.75;
      else if(janFebChance==='50')wantJanFeb=rjf<0.5;
      else if(janFebChance==='25')wantJanFeb=rjf<0.25;
      // julianChance only applies when the Use Julian Calendar toggle is on; if julian=false,
      // every date is treated as Gregorian regardless of year, so biasing is meaningless.
      const rjul=Math.random();
      let wantJulian=null;
      if(julian){
        if(julianChance==='100')wantJulian=true;
        else if(julianChance==='75')wantJulian=rjul<0.75;
        else if(julianChance==='50')wantJulian=rjul<0.5;
        else if(julianChance==='25')wantJulian=rjul<0.25;
      }
      // Try preference-respecting attempts first; fall back to no preference if year range has no leap years
      for(let attempts=0;attempts<2000;attempts++){
        const y=rint(lo,hi);if(y===0)continue;
        // Per-date leap check: only apply Julian leap rule if the year actually falls in the Julian period.
        // Without this, useJulian=on caused isLeapJulian to be applied to post-1582 years, which disagrees with
        // dimFn / isJulianDate / the codes panel — manifesting as e.g. 1900 being treated as a leap year for
        // wantLeap/forceJanFeb purposes while the codes panel correctly reports Gregorian non-leap.
        const inJulianRange=julian&&y<1582;
        const isLeapY=inJulianRange?isLeapJulian(y):isLeap(y);
        if(wantLeap!==null&&wantLeap!==isLeapY)continue;
        let m;
        if(wantJanFeb!==null&&isLeapY){
          // On leap years, force toward (or away from) Jan/Feb based on the rolled bias.
          // Non-leap years are unaffected — Jan/Feb chance only applies on leap years.
          m=wantJanFeb?rint(1,2):rint(3,12);
        }else{
          m=rint(1,12);
        }
        const isJul=julian&&isJulianDate(y,m,1);
        const maxD=m===2?((isJul?isLeapJulian(y):isLeap(y))?29:28):([4,6,9,11].includes(m)?30:31);
        const d=rint(1,maxD);
        if(isGapDate(y,m,d))continue;
        // Julian-chance bias is checked against the final (y,m,d) since year 1582 contains
        // both Julian (Jan-Sep + Oct 1-4) and Gregorian (Oct 15+ + Nov + Dec) dates.
        if(wantJulian!==null){
          const isJ=isJulianDate(y,m,d);
          if(wantJulian!==isJ)continue;
        }
        return{y,m,d};
      }
      // Silent fallback: no leap-preference / janFeb / julian filter
      for(;;){
        const y=rint(lo,hi);if(y===0)continue;
        const m=rint(1,12);
        const isJul=julian&&isJulianDate(y,m,1);
        const maxD=m===2?((isJul?isLeapJulian(y):isLeap(y))?29:28):([4,6,9,11].includes(m)?30:31);
        const d=rint(1,maxD);
        if(isGapDate(y,m,d))continue;
        return{y,m,d};
      }
    }
    // FORMAT_IDS / rollFormat live at module scope so App's genDate and every mode
    // component can stamp a date's ._fmt at generation time.
    const FORMAT_IDS: FormatId[]=['written-mdy','written-dmy','numeric-mdy','numeric-dmy','numeric-ymd'];
    const rollFormat=()=>FORMAT_IDS[Math.floor(Math.random()*FORMAT_IDS.length)];
    const isTouch=typeof window!=="undefined"&&("ontouchstart" in window||navigator.maxTouchPoints>0||matchMedia("(pointer:coarse)").matches);
    const fmtBlitzT=(s: number)=>{const sec=Math.ceil(s);if(sec<60)return sec+"s";const m=Math.floor(sec/60),r=sec%60;return m+"m "+r+"s";};
    const fmtFlashT=(ms: number)=>(ms/1000).toFixed(1)+"s";
    // Time display follows WCA convention (regulation 9f1): individual single times
    // (Last) are truncated to hundredths — the third decimal is dropped, never rounded.
    // Averages, medians, and bests are rounded to nearest hundredth (toFixed(2)).
    // truncTime drops the third decimal; fmtTime rounds via toFixed(2).
    const truncTime=(t: number | null)=>(t==null||t>=60)?"—":`${(Math.floor(t*100)/100).toFixed(2)}s`;
    const fmtTime=(t: number | null)=>(t==null||t>=60)?"—":`${t.toFixed(2)}s`;
    // WCA-consistent accuracy formatter: when there's at least one wrong answer, floor (truncate) the
    // percentage so we never display "100.0%" for 9999/10000 (which rounds up under toFixed). Pure 100%
    // displays normally. Same philosophy as truncTime (regulation 9f1) — never inflate the user's result.
    const fmtAccuracyPct=(good: number,played: number)=>{
      if(!played)return"—";
      const pct=good/played*100;
      if(good<played&&pct>=99.95)return"99.9%";
      return`${pct.toFixed(1)}%`;
    };
    // calcAvg / calcLast / calcMed → src/engine/stats.js, imported at top (shared by the mode strips).
    const blockMinus=(e: React.KeyboardEvent)=>{if(e.key==="-"||e.key==="Subtract"||e.key==="Minus")e.preventDefault();};
    const blockMinusBI=(e: React.FormEvent<HTMLInputElement> & { data?: string | null })=>{if(e.data&&e.data.includes("-"))e.preventDefault();};

    // entryWithGreen → src/engine/answerButtons.js, imported at top (shared with the reducer + AoxMode).

    // Timing constants (keep in sync with CSS .expander transition)
    // CODES_CLOSE_MS → src/lib/constants.js, imported at top (shared with the codes panel).
    const FLASH_MS=550;       // green/red button flash duration (ms)
    // Button-pulse flash (the green/red pulse on an answered option) — transient UI, not engine
    // state. Every mode component owns one; this hook is the single copy. Latest-timeout pattern
    // so rapid answers each get the full FLASH_MS before clearing. `setFlash` is exposed for the
    // few sites that clear it directly (e.g. Deduction's sub-type switch).
    function useButtonFlash(){
      const [flash,setFlash]=useState<FlashState | null>(null);
      const flashClearRef=useRef<ReturnType<typeof setTimeout> | null>(null);
      const setFlashWithTimeout=(val: FlashState)=>{setFlash(val);if(flashClearRef.current)clearTimeout(flashClearRef.current);flashClearRef.current=setTimeout(()=>{setFlash(null);flashClearRef.current=null;},FLASH_MS);};
      return {flash,setFlash,setFlashWithTimeout};
    }
    // The engine-state half of a mode's freshness check (stats all zero, no history, no live-question
    // flags set) — identical across modes. Each mode ANDs its own fields (toggles/timers/bests) on top.
    function engineFresh(s: GameState){
      return s.stats.played===0&&s.stats.good===0&&s.stats.streak===0&&s.stats.best===0&&s.stats.times.length===0&&s.stack.length===0&&s.forwardStack.length===0&&s.backDepth===0&&s.locked===false&&s.revealed===false&&s.countedWrong===false&&s.canOverrideCorrect===false&&s.pendingWrongOverride===null&&s.overrideUsedThisQ===false&&s.calcOpen===false&&s.calcPenaltyActive===false;
    }
    // Shared "hideable stats" chrome for the three non-timed modes (Classic, Flash, Deduction): the
    // show/hide toggles, the two-tap "Enable and Reset Stats?" arm (+ its click-outside / Save-Stats-off
    // / mode-leave disarms), and the 6-box stats array + armedSpan for <StatPanel>. Re-enabling timing
    // follows App's original rule: OFF→just hide; ON with no desync→regen the live date; ON with a
    // desync (stats moved while hidden)→two-tap confirm→full reset. Both toggles (`timingOff` +
    // `scoringOff`) are owned by the component and persisted in the mode-prefs store, so they're
    // passed in with their setters (timingOff also feeds useGameEngine). Flash is the only
    // mode with a live timer to tear down, so it passes afterTimingEnabled() (on re-enable) and onHide()
    // (on mode-leave); Classic/Deduction omit them.
    function useStatsHideToggles({eng, saveStats, visible, timingOff, setTimingOff, scoringOff, setScoringOff, afterTimingEnabled, onHide}: { eng: GameEngine; saveStats: boolean; visible: boolean; timingOff: boolean; setTimingOff: (v: boolean) => void; scoringOff: boolean; setScoringOff: (v: boolean) => void; afterTimingEnabled?: () => void; onHide?: () => void }){
      // timingOff + scoringOff are owned by the mode component (persisted in the mode-prefs store) and
      // passed in, so the hook holds no toggle state of its own — it just orchestrates the desync arm
      // and builds the stats strip from them.
      const S=eng.state.stats;
      const [timingArmed,setTimingArmed]=useState(false);
      const timingArmedRef=useRef(false);
      const timingArmTimerRef=useRef<ReturnType<typeof setTimeout> | null>(null);
      const timingArmBtnRef=useRef<HTMLButtonElement | null>(null);
      const disarmTimingArm=()=>{if(timingArmTimerRef.current){clearTimeout(timingArmTimerRef.current);timingArmTimerRef.current=null;}timingArmedRef.current=false;setTimingArmed(false);};
      const toggleScoringOff=()=>{if(!saveStats)return;setScoringOff(!scoringOff);};   // scoringOff is the current (prop) value
      const toggleTimingOff=()=>{
        if(!saveStats)return;
        if(!timingOff){setTimingOff(true);return;}
        const desync=S.good!==S.times.length;
        if(!desync){eng.regenDate();if(afterTimingEnabled)afterTimingEnabled();setTimingOff(false);return;}
        if(timingArmedRef.current){if(timingArmTimerRef.current){clearTimeout(timingArmTimerRef.current);timingArmTimerRef.current=null;}timingArmedRef.current=false;setTimingArmed(false);eng.fullReset();if(afterTimingEnabled)afterTimingEnabled();setTimingOff(false);return;}
        timingArmedRef.current=true;setTimingArmed(true);
        if(timingArmTimerRef.current)clearTimeout(timingArmTimerRef.current);
        timingArmTimerRef.current=setTimeout(()=>{timingArmedRef.current=false;setTimingArmed(false);timingArmTimerRef.current=null;},3000);
      };
      useEffect(()=>{if(!timingArmed)return;const h=(e: MouseEvent)=>{if(timingArmBtnRef.current&&timingArmBtnRef.current.contains(e.target as Node | null))return;disarmTimingArm();};const t=setTimeout(()=>document.addEventListener('click',h),0);return()=>{clearTimeout(t);document.removeEventListener('click',h);};},[timingArmed]);
      // Fire on visibility transitions only: when hidden, disarm + run the mode's teardown (onHide,
      // the Flash flash-stopper). onHide/disarmTimingArm are re-created each render; listing them
      // would re-fire the teardown every render. Intentional [visible]-only effect.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(()=>{if(!visible){if(timingArmedRef.current)disarmTimingArm();if(onHide)onHide();}},[visible]);
      useEffect(()=>{if(!saveStats&&timingArmedRef.current)disarmTimingArm();},[saveStats]);
      const sLast=calcLast(S.times),sAvg=calcAvg(S.times),sMed=calcMed(S.times);
      const sOff=scoringOff||!saveStats;
      const tOff=timingOff||!saveStats;
      const sFn=saveStats?toggleScoringOff:null;
      const tFn=saveStats?toggleTimingOff:null;
      const statsArr=[
        {label:"Score",value:`${S.good}/${S.played}`,off:sOff,fn:sFn},
        {label:"Accuracy",value:fmtAccuracyPct(S.good,S.played),off:sOff,fn:sFn},
        {label:"Streak",value:`${S.streak}/${S.best}`,off:sOff,fn:sFn},
        {label:"Last",value:truncTime(sLast),off:tOff,fn:tFn},
        {label:"Average",value:fmtTime(sAvg),off:tOff,fn:tFn},
        {label:"Median",value:fmtTime(sMed),off:tOff,fn:tFn},
      ];
      const armedSpan=(timingArmed&&saveStats)?{startIdx:3,endIdx:5,label:"Enable and Reset Stats?",onClick:toggleTimingOff}:null;
      // armedBtnRef is returned separately (not nested in armedSpan) so StatPanel's plain
      // armedSpan data stays ref-free — see the note in StatPanel.tsx.
      return {timingArmed,statsArr,armedSpan,armedBtnRef:timingArmBtnRef};
    }

    // Two-tap "Reset Stats?" confirm for the casual modes (Classic / Flash / Deduction) — mirrors the
    // timing-arm above so the two destructive actions feel identical. A first tap ARMS (the button shows
    // "Reset Stats?" in the danger colour, 3s); a second tap within 3s runs `resetFn` (Classic/Deduction
    // = eng.resetStats; Flash passes its own reset that also tears the live flash down). Disarms on the
    // 3s timeout, a click outside the button, or leaving the mode. Gated on `hasData`: a fully-fresh mode
    // (engineFresh) has nothing to clear, so a tap is a harmless no-op (never arms). The `S` keyboard
    // shortcut routes through the same onClick via .click() (see the keyboard effect), so it arms +
    // confirms identically. (Q2.)
    function useResetStatsArm(resetFn: () => void, hasData: boolean, visible: boolean){
      const [resetArmed,setResetArmed]=useState(false);
      const armedRef=useRef(false);
      const timerRef=useRef<ReturnType<typeof setTimeout> | null>(null);
      const resetBtnRef=useRef<HTMLButtonElement | null>(null);
      const disarm=()=>{if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null;}armedRef.current=false;setResetArmed(false);};
      const onResetTap=()=>{
        if(!hasData){disarm();return;}                     // nothing to clear → no-op (don't arm)
        if(armedRef.current){disarm();resetFn();return;}   // second tap within 3s → confirm + reset
        armedRef.current=true;setResetArmed(true);          // first tap → arm
        if(timerRef.current)clearTimeout(timerRef.current);
        timerRef.current=setTimeout(()=>{timerRef.current=null;armedRef.current=false;setResetArmed(false);},3000);
      };
      // Click anywhere but the button disarms (delayed one tick so the arming click itself doesn't disarm).
      useEffect(()=>{if(!resetArmed)return;const h=(e: MouseEvent)=>{if(resetBtnRef.current&&resetBtnRef.current.contains(e.target as Node | null))return;disarm();};const t=setTimeout(()=>document.addEventListener('click',h),0);return()=>{clearTimeout(t);document.removeEventListener('click',h);};},[resetArmed]);
      // Leaving the mode disarms (visible-only by design; disarm closes over only refs + stable setters).
      useEffect(()=>{if(!visible&&armedRef.current)disarm();},[visible]);
      return {resetArmed,onResetTap,resetBtnRef};
    }
    // Run fn() whenever any value in `deps` changes — skipping the initial mount. The generic
    // "react to a settings/toggle change" effect the modes use to regen an unanswered live date
    // (the engine's regenDate no-ops on a burned/browsed date). fn is read through a ref so the
    // latest closure runs without having to list it (or the engine) in the dependency array.
    function useChangeEffect(deps: React.DependencyList, fn: () => void){
      const fnRef=useRef(fn);
      useEffect(()=>{fnRef.current=fn;});   // keep the latest fn (post-commit), not during render (refs rule)
      const firstRef=useRef(true);
      useEffect(()=>{if(firstRef.current){firstRef.current=false;return;}fnRef.current();},deps);   // eslint-disable-line react-hooks/exhaustive-deps
    }

    // Like useChangeEffect, but DEFERRED to the settings-popover CLOSE: snapshots `deps` when the popover
    // OPENS and runs fn ONCE on close IFF they changed (a change-then-revert is a no-op). The ⚙ settings
    // only change while the popover is open, so this batches their side-effects — a date regen, a run/
    // round reset — to a single apply on close instead of one per keystroke, and never resets the solve
    // timer mid-adjustment. fn runs through a ref so the latest closure (current run/round state) fires.
    // (Mode-LOCAL toggles that change outside the popover must keep useChangeEffect — they'd never see an
    // open→close transition coincide with their change.)
    function useSettingsCloseEffect(settingsOpen: boolean, deps: React.DependencyList, fn: () => void){
      const fnRef=useRef(fn);
      useEffect(()=>{fnRef.current=fn;});
      const snapRef=useRef(deps);
      const wasOpenRef=useRef(settingsOpen);
      useEffect(()=>{
        const wasOpen=wasOpenRef.current;
        wasOpenRef.current=settingsOpen;
        if(settingsOpen&&!wasOpen){snapRef.current=deps;return;}   // opened → snapshot the current values
        if(!settingsOpen&&wasOpen){                                 // closed → fire once iff anything changed
          const changed=deps.some((d,i)=>d!==snapRef.current[i]);
          snapRef.current=deps;
          if(changed)fnRef.current();
        }
      },[settingsOpen,...deps]);   // eslint-disable-line react-hooks/exhaustive-deps
    }

    // computeHasCredit, markBtns, mkBtnsWithCorrect → src/engine/answerButtons.js, imported at top.

    // Expander → src/components/Expander.jsx, imported at top.



    const DEPLOY_TS=new Date('2026-07-14T02:25:00Z');

    // Force the very latest deployed version, bypassing the service-worker cache — the MANUAL big
    // hammer behind Settings → "Check for updates". (The NORMAL update path is two-step prompt-mode:
    // a newly-deployed SW installs + WAITS in the background, and App's auto-update boot effect
    // applies it on the next cold open behind the Updating screen.) This button covers what that
    // path can't — a stuck/ancient SW or cached icon you can't shake on a phone with no hard-refresh:
    // it unregisters the service worker(s) and deletes the Cache-API caches (the precached app shell
    // + assets), then reloads — so the next load fetches everything fresh from the server. NEVER use
    // it on the automatic path: with the caches wiped, an offline launch has nothing to serve (the
    // auto path's safety fallback is a plain reload instead). It does NOT touch localStorage, so
    // saved stats, settings, bests, and Lookup history are all preserved (only the app code/asset
    // cache is cleared).
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

    // Pure (exported for tests): how much longer #boot must stay up. The splash needs ≥500ms of
    // VISIBLE time or a fast cached load flashes it for a frame, which reads as a glitch — and
    // visible time starts at the __bootShownAt stamp, NOT at navigation start (the old bug:
    // `500 - performance.now()` clamps to 0 whenever React mounts >500ms after navigation — i.e. on
    // every real network / SW cold boot — so the splash flashed exactly where it mattered). A
    // missing stamp (inline script failed/stripped) holds the full 500ms from now: the safe direction.
    const bootHoldRemaining=(shownAt:number|undefined,now:number)=>shownAt===undefined?500:Math.max(500-(now-shownAt),0);

    // BootOverlay (Q3) — the full-screen UPDATING screen: the trace flows (erase-from-2 / redraw-from-2,
    // soft both-ends trail via a blurred mask, sped through the complete moment — driven per-frame by
    // the rAF effect below; see lib/bootFlow for the iOS render fix) + "Updating" with a
    // sequential three-dot pulse. Shown by the Settings "Check for updates" button AND by the
    // auto-update-on-open SW effect in App (when a freshly-deployed version is waiting at launch).
    // The LOADING splash is no longer rendered here — it's index.html's body-level #boot, which App
    // removes via dismissBootSplash; only the `updating` variant is ever mounted (the prop's loading
    // form is kept so the component matches the approved mockup pair, pending the deferred animation
    // pass). Theme-aware (bg = --bg1; logo lavender on dark, brand-purple on light). The glyph is the
    // W5 logo, kept in sync with index.html's pre-React boot splash + src/components/W5Logo.tsx. Logo
    // scaled up (174×188) for both screens (owner 2026-06-28).
    function BootOverlay({updating=false}:{updating?:boolean}){
      // iOS trace driver (2026-07-13): the erase/redraw sweep is driven per-frame from JS instead of
      // CSS keyframes — shipping iOS mis-paints NEGATIVE dashoffsets over an odd-count dasharray
      // (WebKit bug 249307), which turned the loop into fill→instant-vanish jumps on-device while
      // every Chromium preview looked perfect. Same approved visual + 2.6s eased phases (the math
      // lives in lib/bootFlow); the driver measures the TRUE path length (the CSS assumed 174,
      // really ~170.9 — that mismatch alone cost ~0.35s of blank per cycle on every engine) and
      // emits only non-negative offsets over a two-value dasharray, which iOS paints correctly.
      // Deliberately ignores Reduce Motion: the trace is the sole FUNCTIONAL progress indicator
      // during a blocking update (the app scales only decorative motion via --motion-scale).
      const flowRef=useRef<SVGPathElement | null>(null);
      useEffect(()=>{
        if(!updating)return;
        const p=flowRef.current;if(!p)return;
        let L=BOOT_FLOW_FALLBACK_LEN;
        try{const m=p.getTotalLength();if(m>0)L=m;}catch{/* jsdom has no getTotalLength — fall back */}
        p.style.strokeDasharray=`${L} ${L}`;
        const start=performance.now();
        let raf=0;
        const tick=(now:number)=>{p.style.strokeDashoffset=`${bootFlowOffset(now-start,L)}px`;raf=requestAnimationFrame(tick);};
        raf=requestAnimationFrame(tick);
        return()=>cancelAnimationFrame(raf);
      },[updating]);
      return(
        <div className="boot-overlay">
          <div className="boot-mark">
            <div className="boot-glow"/>
            <svg width="174" height="188" viewBox="178 173 146 158" fill="none" aria-hidden="true" style={{position:'relative'}}>
              {updating&&(<defs>
                <filter id="bootSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
                <mask id="bootMask"><path ref={flowRef} className="boot-flow" d="M310,256 C313,226 313,206 310,196 C300,184 240,184 202,196" stroke="#fff" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="174 174" filter="url(#bootSoft)"/></mask>
              </defs>)}
              <g fill="currentColor" opacity="0.3"><circle cx="256" cy="256" r="10"/><circle cx="310" cy="316" r="10"/><circle cx="202" cy="316" r="10"/><circle cx="202" cy="256" r="10"/></g>
              <path d="M310,256 C313,226 313,206 310,196 C300,184 240,184 202,196" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" mask={updating?"url(#bootMask)":undefined}/>
              <g fill="currentColor"><circle cx="310" cy="256" r="10"/><circle cx="310" cy="196" r="10"/></g>
              <circle cx="202" cy="196" r="9" fill="currentColor"/><circle cx="202" cy="196" r="19" fill="none" stroke="currentColor" strokeWidth="5"/>
            </svg>
          </div>
          {updating&&<div className="boot-updating">Updating<span className="boot-d boot-d1">.</span><span className="boot-d boot-d2">.</span><span className="boot-d boot-d3">.</span></div>}
        </div>
      );
    }

    // ============================================================
    // makeDedPuzzle — the PURE Deduction puzzle generator (mode-untangle Step 4).
    //
    // Returns a fresh puzzle {type,y,m,d,w,options,boxes?,_fmt,_jul,…} for the given sub-mode +
    // year range, or null when a Year puzzle can't be built for the range (caller keeps the
    // previous puzzle — App's "retain rather than show a degenerate puzzle"). This is App's old
    // spawnDedWithRange body, lifted out so DeductionMode's shared-engine genDate can produce
    // puzzles; App's spawnDedWithRange now delegates here (one source of truth). The side effects
    // the old version had inline (setCalcPenalty, tStartRef) are the caller's concern now — the
    // engine owns the per-question reset + solve timer. aw/dimFn are the local calendar helpers
    // (mirrors App's activeWday/dimFn, keyed off the passed useJulian). The dead `pc` local of
    // the original is dropped (it was never read). Generation logic is otherwise verbatim.
    // ============================================================
    function makeDedPuzzle(type: DatePart, lo: number, hi: number, {useJulian,leapChance,janFebChance,randomFormat,dateFormat,abCrossOnly,julCrossOnly,monthOnly1582}: DedOpts): DedPuzzle | null {
      const aw=(y: number,m: number,d: number)=>(useJulian&&isJulianDate(y,m,d))?wdayJulian(y,m,d):wday(y,m,d);
      const dimFn=(y: number,m: number)=>{const leap=(useJulian&&isJulianDate(y,m,1))?isLeapJulian(y):isLeap(y);return m===2?(leap?29:28):([4,6,9,11].includes(m)?30:31);};
      // Decide leap preference once per question (not per attempt) so probabilities don't skew.
      const r=Math.random();
      let wantLeap=null;
      if(leapChance==='100')wantLeap=true;
      else if(leapChance==='75')wantLeap=r<0.75;
      else if(leapChance==='50')wantLeap=r<0.5;
      // Roll a separate random for Jan/Feb biasing (Option A semantics). Decide once per question.
      const rjf=Math.random();
      let wantJanFeb=null;
      if(janFebChance==='100')wantJanFeb=true;
      else if(janFebChance==='75')wantJanFeb=rjf<0.75;
      else if(janFebChance==='50')wantJanFeb=rjf<0.5;
      else if(janFebChance==='25')wantJanFeb=rjf<0.25;
      const isLeapForY=(yc: number)=>{const jul=useJulian&&isJulianDate(yc,1,1);return jul?isLeapJulian(yc):isLeap(yc);};
      const pickMonth=(isLeapY: boolean)=>{
        if(wantJanFeb===null||!isLeapY)return rint(1,12);
        return wantJanFeb?rint(1,2):rint(3,12);
      };
      const attachFmt=(o: DedPuzzle)=>{o._fmt=randomFormat?rollFormat():dateFormat;o._jul=useJulian;return o;};
      if(type==="year"){
        const windowCrossesJulianBoundary=(a: number,b: number,m: number,d: number)=>{
          if(!useJulian)return false;
          if(a>b)return false;
          const aIsJul=isJulianDate(a,m,d),bIsJul=isJulianDate(b,m,d);
          return aIsJul!==bIsJul;
        };
        const julianBoundaryPair=(m: number,d: number)=>{
          if(m===10&&d>=5&&d<=14)return null; // gap day
          if(m<10||(m===10&&d<=4))return[1582,1583];
          return[1581,1582];
        };
        const windowCrossesAb=(a: number,b: number)=>Math.floor(a/100)!==Math.floor(b/100);
        const validateDistinct=(years: number[],m: number,d: number)=>{
          const wdays=[];
          for(const y of years){
            if(m===2&&d===29&&!isLeapForY(y))continue; // dead option, skip
            if(d>dimFn(y,m))return false;
            if(isGapDate(y,m,d))return false;
            wdays.push(aw(y,m,d));
          }
          return new Set(wdays).size===wdays.length;
        };
        const inRange=(y: number)=>y!==0&&y>=Math.max(1,lo)&&y<=hi;
        const julCrossPossible=julCrossOnly&&useJulian&&inRange(1582)&&(inRange(1581)||inRange(1583));
        const abCrossPossible=abCrossOnly&&Math.floor(Math.max(1,lo)/100)!==Math.floor(hi/100);
        let enforce=null;
        if(abCrossPossible&&julCrossPossible)enforce=Math.random()<0.5?'ab':'jul';
        else if(abCrossPossible)enforce='ab';
        else if(julCrossPossible)enforce='jul';
        const trySpawn=()=>{
          for(let attempt=0;attempt<3000;attempt++){
            let yc=rint(Math.max(1,lo),hi);
            if(yc===0)continue;
            const isLeapY=isLeapForY(yc);
            if(wantLeap!==null&&wantLeap!==isLeapY)continue;
            const m=pickMonth(isLeapY);
            const D=dimFn(yc,m);
            if(D<=0)continue;
            const d=rint(1,D);
            if(isGapDate(yc,m,d))continue;
            let windowYears;
            if(enforce==='jul'){
              const pair=julianBoundaryPair(m,d);
              if(!pair||!inRange(pair[0])||!inRange(pair[1]))continue;
              if(m===2&&d===29){
                const leaps=pair.filter(y=>isLeapForY(y));
                if(leaps.length===0)continue;
                yc=leaps[rint(0,leaps.length-1)];
              }else{
                if(d>dimFn(pair[0],m)||d>dimFn(pair[1],m))continue;
                yc=pair[rint(0,1)];
              }
              windowYears=pair.slice();
            }else if(enforce==='ab'){
              const P=rint(0,YEAR_OPTION_DEFAULT-1);
              const start=yc-P,end=start+YEAR_OPTION_DEFAULT-1;
              if(!inRange(start)||!inRange(end))continue;
              if(start<=0&&end>=0)continue;
              if(!windowCrossesAb(start,end))continue;
              if(windowCrossesJulianBoundary(start,end,m,d))continue;
              windowYears=[];for(let yy=start;yy<=end;yy++)windowYears.push(yy);
              if(m===2&&d===29){
                const leaps=windowYears.filter(y=>isLeapForY(y));
                if(leaps.length===0)continue;
                yc=leaps[rint(0,leaps.length-1)];
              }
            }else{
              const P=rint(0,YEAR_OPTION_DEFAULT-1);
              const start=yc-P,end=start+YEAR_OPTION_DEFAULT-1;
              if(!inRange(start)||!inRange(end))continue;
              if(start<=0&&end>=0)continue;
              if(windowCrossesJulianBoundary(start,end,m,d)){
                const pair=julianBoundaryPair(m,d);
                if(!pair||!inRange(pair[0])||!inRange(pair[1]))continue;
                if(m===2&&d===29){
                  const leaps=pair.filter(y=>isLeapForY(y));
                  if(leaps.length===0)continue;
                  yc=leaps[rint(0,leaps.length-1)];
                }else{
                  if(d>dimFn(pair[0],m)||d>dimFn(pair[1],m))continue;
                  yc=pair[rint(0,1)];
                }
                windowYears=pair.slice();
              }else{
                windowYears=[];for(let yy=start;yy<=end;yy++)windowYears.push(yy);
                if(m===2&&d===29){
                  const leaps=windowYears.filter(y=>isLeapForY(y));
                  if(leaps.length===0)continue;
                  yc=leaps[rint(0,leaps.length-1)];
                }
              }
            }
            if(!validateDistinct(windowYears,m,d))continue;
            const w=aw(yc,m,d);
            return attachFmt({type:"year",y:yc,m,d,w,options:windowYears,_abx:abCrossOnly,_julx:julCrossOnly});
          }
          return null;
        };
        // No fallback: the Year sub-mode playability contract (yearSubPossible) keeps this from
        // being called for an unbuildable range in normal play. null → caller retains the prior
        // puzzle (App) or supplies an init fallback (DeductionMode's hidden, unreachable Year engine).
        return trySpawn();
      }
      if(type==="month"){
        const force1582=monthOnly1582&&useJulian&&1582>=lo&&1582<=hi;
        let yc=null;
        if(force1582){
          yc=1582;
        }else{
          for(let t=0;t<2000;t++){const c=rint(lo,hi);if(c===0)continue;const il=isLeapForY(c);if(wantLeap!==null&&wantLeap!==il)continue;yc=c;break;}
          if(yc==null){for(let t=0;t<600;t++){const c=rint(lo,hi);if(c!==0){yc=c;break;}}if(yc==null)yc=lo>0?lo:1;}
        }
        const isLeapY=isLeapForY(yc);
        const is1582Special=yc===1582&&useJulian;
        if(is1582Special){
          const dCat=(()=>{const rr=Math.random();
            if(rr<4/31)return'pre';      // ~13% → days 1-4
            if(rr<14/31)return'gap';     // ~32% → days 5-14 (October excluded from box layout)
            return'post';                // ~55% → days 15-31
          })();
          const boxes=dCat==='pre'?MONTH_BOXES_1582_PRE:dCat==='gap'?MONTH_BOXES_1582_GAP:MONTH_BOXES_1582_POST;
          let pickFromBoxes=boxes;
          if(wantJanFeb===true&&isLeapY){const filtered=boxes.filter(b=>b.months.includes(1)||b.months.includes(2));if(filtered.length>0)pickFromBoxes=filtered;}
          else if(wantJanFeb===false&&isLeapY){const filtered=boxes.filter(b=>!b.months.includes(1)&&!b.months.includes(2));if(filtered.length>0)pickFromBoxes=filtered;}
          const box=pickFromBoxes[rint(0,pickFromBoxes.length-1)];
          let m;
          if(wantJanFeb===true&&isLeapY){const allowed=box.months.filter(mm=>mm===1||mm===2);m=allowed.length>0?allowed[rint(0,allowed.length-1)]:box.months[rint(0,box.months.length-1)];}
          else if(wantJanFeb===false&&isLeapY){const allowed=box.months.filter(mm=>mm!==1&&mm!==2);m=allowed.length>0?allowed[rint(0,allowed.length-1)]:box.months[rint(0,box.months.length-1)];}
          else m=box.months[rint(0,box.months.length-1)];
          let d;
          if(m===10){
            if(dCat==='pre')d=rint(1,4);
            else d=rint(15,31); // dCat='post' (gap is impossible here per box layout)
          }else{
            const D=dimFn(yc,m);
            if(dCat==='pre')d=rint(1,Math.min(4,D));
            else if(dCat==='gap')d=rint(5,Math.min(14,D));
            else d=rint(15,D);
          }
          const w=aw(yc,m,d);
          return attachFmt({type:"month",y:yc,d,w,m,options:boxes.map(b=>b.label),boxes:boxes.map(b=>({...b,months:[...b.months]})),_m1582:monthOnly1582});
        }
        const boxes=isLeapY?MONTH_BOXES_LEAP:MONTH_BOXES_COMMON;
        let pickFromBoxes=boxes;
        if(wantJanFeb===true&&isLeapY){const filtered=boxes.filter(b=>b.months.includes(1)||b.months.includes(2));if(filtered.length>0)pickFromBoxes=filtered;}
        else if(wantJanFeb===false&&isLeapY){const filtered=boxes.filter(b=>!b.months.includes(1)&&!b.months.includes(2));if(filtered.length>0)pickFromBoxes=filtered;}
        const box=pickFromBoxes[rint(0,pickFromBoxes.length-1)];
        let m;
        if(wantJanFeb===true&&isLeapY){const allowed=box.months.filter(mm=>mm===1||mm===2);m=allowed.length>0?allowed[rint(0,allowed.length-1)]:box.months[rint(0,box.months.length-1)];}
        else if(wantJanFeb===false&&isLeapY){const allowed=box.months.filter(mm=>mm!==1&&mm!==2);m=allowed.length>0?allowed[rint(0,allowed.length-1)]:box.months[rint(0,box.months.length-1)];}
        else m=box.months[rint(0,box.months.length-1)];
        // Oct 1582 via this generic path (only reachable with useJulian OFF — is1582Special above
        // handles ON): the gap days 5-14 never existed, so draw uniformly from the 21 real days
        // (v 1-4 → d=v; v 5-21 → d=v+10 = 15-31). The standard boxes stay correct here — with
        // Julian off, all of 1582 is proleptic Gregorian (the 1582 special boxes encode the
        // Julian/Gregorian split, wrong for this state).
        const D=dimFn(yc,m);
        let d;if(yc===1582&&m===10){const v=rint(1,21);d=v<=4?v:v+10;}else d=rint(1,D);
        const w=aw(yc,m,d);
        return attachFmt({type:"month",y:yc,d,w,m,options:boxes.map(b=>b.label),boxes:boxes.map(b=>({...b,months:[...b.months]})),_m1582:monthOnly1582});
      }
      if(type==="day"){
        let yc=null;
        for(let t=0;t<2000;t++){const c=rint(lo,hi);if(c===0)continue;const il=isLeapForY(c);if(wantLeap!==null&&wantLeap!==il)continue;yc=c;break;}
        if(yc==null){for(let t=0;t<600;t++){const c=rint(lo,hi);if(c!==0){yc=c;break;}}if(yc==null)yc=lo>0?lo:1;}
        const isLeapY=isLeapForY(yc);
        const m=pickMonth(isLeapY),D=dimFn(yc,m);
        // Oct 1582 special windows — UNCONDITIONAL (both calendar states): the gap days 5-14 never
        // existed (the app-wide contract — Lookup's "Does Not Exist", the guide's "always excluded"),
        // so the only valid Day layouts are {1-4} or a 7-window inside 15-31. Both are contiguous
        // real-day runs ≤7 wide, so weekday-distinctness holds under Gregorian math too (aw above
        // already keys the weekday off useJulian); a window straddling the gap would collide under
        // BOTH systems (Gregorian's +4 shift across the gap lands day 15 on day 1's weekday).
        const isOct1582Special=yc===1582&&m===10;
        if(isOct1582Special){
          const useLeft=Math.random()<4/21;
          if(useLeft){
            const d=rint(1,4);
            const w=aw(yc,m,d);
            return attachFmt({type:"day",y:yc,m,w,d,options:[1,2,3,4]});
          }else{
            const span=DAY_OPTION_COUNT;
            const P=rint(0,span-1);
            const dLo=15+P,dHi=25+P;
            const d=rint(dLo,dHi);
            const start=d-P;
            const w=aw(yc,m,d);
            const opts=[];for(let v=start;v<start+span;v++)opts.push(v);
            return attachFmt({type:"day",y:yc,m,w,d,options:opts});
          }
        }
        const span=Math.min(DAY_OPTION_COUNT,D);
        const P=rint(0,span-1);
        const dLo=P+1,dHi=D-(span-1)+P;
        const d=rint(dLo,dHi),w=aw(yc,m,d);
        const start=d-P,end=start+span-1;
        const opts=[];for(let v=start;v<=end;v++)opts.push(v);
        return attachFmt({type:"day",y:yc,m,w,d,options:opts});
      }
      return null;
    }

    // StatPanel → src/components/StatPanel.jsx, imported at top.

    // CustomSelect → src/components/CustomSelect.jsx, imported at top.

    // ============================================================
    // AoxMode — the "average of N" run mode, FOLDED onto the shared useGameEngine (mode-untangle
    // Step 5, redone). Like Blitz, the engine runs the per-question loop (answer / credit / stats /
    // history / Override / Show Codes) and the COMPONENT owns the run layer: the run lifecycle
    // (idle/running/done/failed), the Ao-N count, Best Average/Median (per config, with rollback),
    // One-By-One, and the fail-on-mistake rule. The run's stats ARE the engine stats — good =
    // credited solves, played = attempts, times = solve times, streak/best. The fold needs only
    // two general engine flags: `complete` (the Nth solve credits without advancing) and
    // `noAdvance` (a failing override of that solve stays put). See gameReducer.
    function AoxMode({minY,maxY,visible,fmtDate,useJulian=false,genDate=randomDate,leapChance='random',janFebChance='random',julianChance='random',randomFormat=false,dateFormat='written-mdy',inputStyle='buttons',saveStats=true,settingsOpen,onFreshChange}: ModeProps & { fmtDate: FmtDate; genDate?: GenDate }){
      const aoxN=useModePrefs(s=>s.aoxN),setAoxN=useModePrefs(s=>s.setAoxN);   // persisted (mode-prefs store)
      const allowMistakes=useModePrefs(s=>s.aoxAllowMistakes),setAllowMistakes=useModePrefs(s=>s.setAoxAllowMistakes);   // persisted (mode-prefs store)
      const oneByOne=useModePrefs(s=>s.aoxOneByOne),setOneByOne=useModePrefs(s=>s.setAoxOneByOne);   // persisted (mode-prefs store)
      const [runPhase,setRunPhase]=useState("idle");   // idle | running | done | failed (the RUN; the engine just runs the per-question loop)
      const [shown,setShown]=useState(false);           // One-By-One: is the current date revealed? (always true for non-One-By-One while running)
      const n=Math.max(2,Math.min(1000,parseInt(aoxN)||10));
      // Best keying: bests are siloed per difficulty configuration. Dimensions: n, allowMistakes,
      // format (random→'random' bucket), leapChance, janFebChance, julianChance, year range,
      // useJulian — the SAME dimensions as Blitz/Sudden (and as How-to-Play documents). The original
      // app omitted julianChance here only (an inconsistency: it changes the Julian-date mix, a real
      // difficulty dimension when the range spans pre-1582); fixed C2 — store/progress.ts migrates
      // saved v1 keys so no recorded Best is orphaned.
      const bestKey=`${n}|${allowMistakes}|${randomFormat?'random':dateFormat}|${leapChance}|${janFebChance}|${julianChance}|${minY}-${maxY}|${useJulian}`;
      // saveStats:true ALWAYS → the run tracks + completes regardless of the global Save Stats
      // setting (which only dims the display + gates recording a Best). timingOff:false → solve
      // times are recorded for the average.
      const eng=useGameEngine({label:'aox',genDate,minY,maxY,useJulian,saveStats:true,timingOff:false});
      const {state,correct}=eng;
      // Android Back closes AoX's Show-Codes panel (Q1) — see the same hook in the other modes.
      useBackButton(visible&&state.calcOpen,()=>eng.showCodes(false),'codes');
      const S=state.stats;
      const doneCount=S.good;                 // credited solves this run
      const isRunning=runPhase==="running";
      const isLocked=runPhase==="done"||runPhase==="failed";
      const inBack=state.backDepth>0;
      // A live question RESOLVED AS A MISS (Allow Mistakes on): Reveal or Show Codes showed the answer
      // + counted a played miss (a plain wrong answer sets countedWrong but NOT revealed, so it stays
      // retryable — excluded). The grid is dimmed for it (the engine ignores answers on it).
      const resolvedMiss=isRunning&&!inBack&&state.revealed&&state.countedWrong;
      // Of those, which WAIT on a "Next" button vs auto-advance: SHOW CODES (calcPenaltyActive — set by
      // SHOW_CODES, never by REVEAL) always pauses so you can read the codes; a One-By-One Reveal also
      // pauses (One-By-One pauses between dates by design). A plain non-One-By-One Reveal does NOT wait
      // — onReveal flashes the answer then auto-advances (owner's call, C2: a reveal doesn't need to
      // pause when the run flows date-to-date on its own). (C2 Q4 + the reveal-flash refinement.)
      const awaitingNext=resolvedMiss&&(state.calcPenaltyActive||oneByOne);

      // Per-config Best Average / Median (component-owned, like Blitz's Best Score). A run records
      // its Best on completion and keeps it RECONCILED while its stats move post-completion (a
      // back-browse / retro / live-reversal Override can retract or add a credit on the ended run):
      // standing (good ≥ n) → the pre-run floor improved by the current avg/median; not standing →
      // the floor restored. See the reconcile effect below (engine/aoxBest.ts owns the pure fold).
      // AoX all-time bests (avg/median, config-keyed) persist across reloads (Stage D1): from the
      // progress store. (bestNew markers + the rollback refs below stay local — per-session/ephemeral.)
      const bests=useProgress(s=>s.aoxBest),setBests=useProgress(s=>s.setAoxBest);
      const [bestNew,setBestNew]=useState<Record<string, { avg: boolean; med: boolean }>>({});
      const nextRunIdRef=useRef(1);
      const currentRunIdRef=useRef<number | null>(null);
      // Pending auto-advance after a non-One-By-One Reveal (flash the answer for FLASH_MS, then advance).
      // Held in a ref so reset / leaving the mode / unmount can cancel it before it fires.
      const revealAdvanceRef=useRef<ReturnType<typeof setTimeout> | null>(null);
      const cancelRevealAdvance=()=>{if(revealAdvanceRef.current){clearTimeout(revealAdvanceRef.current);revealAdvanceRef.current=null;}};
      // The PRE-run Best record {key,best,runId}, latched once when this run records (completion with
      // Save Stats on) — the floor every post-completion reconcile starts from (see the effect below).
      const prevBestSnapRef=useRef<{ key: string; best: AoxBest; runId: number } | null>(null);
      const bestData=bests[bestKey]||emptyAoxBest();

      const {flash,setFlashWithTimeout}=useButtonFlash();   // green/red answer pulse

      // Frozen date for the codes panel during the close animation (same as the other modes).
      const latestAoxDateRef=useRef<Question | null>(null);
      const wasCodesOpenRef=useRef(false);
      const [aoxFrozenDate,setAoxFrozenDate]=useState<Question | null>(()=>({...state.date}));
      // Keep the latest date in a ref (post-commit) for the close-timeout below — written in an
      // effect, not during render (compiler refs rule); the timeout fires long after any commit.
      useEffect(()=>{latestAoxDateRef.current=state.date;});
      // Freeze the codes-panel date across the close animation. Depends on the date VALUE (y/m/d),
      // not the object identity — intentional, mirroring MethodBreakdown's freeze effect.
      useEffect(()=>{
        if(state.calcOpen){wasCodesOpenRef.current=true;setAoxFrozenDate(state.date);return;}
        if(wasCodesOpenRef.current){wasCodesOpenRef.current=false;const t=setTimeout(()=>setAoxFrozenDate(latestAoxDateRef.current),CODES_CLOSE_MS);return()=>clearTimeout(t);}
        else{setAoxFrozenDate(state.date);}
      },[state.calcOpen,state.date.y,state.date.m,state.date.d]);   // eslint-disable-line react-hooks/exhaustive-deps

      // Run completion + Best reconcile — ONE effect owns every Best write (mirrors Blitz's
      // timerDone effect). (a) The credited count reaching N completes the run: flip the phase and,
      // if the global Save Stats is on, LATCH the pre-run Best {key,best,runId} as this run's floor.
      // Latched once per run: a reversal can resume + re-complete the run, and re-latching then would
      // capture the run's own record as its floor (the stale-snapshot trap). The completing answer
      // used eng.answer(...,{complete}) so the engine stayed on the solve; re-entry is phase-guarded.
      // (b) From the latch on, every stats change re-reconciles the record under the key the run
      // RECORDED under (the panel's bestKey can move — settings stay editable while a run sits done):
      // still standing (good ≥ n) → the floor improved by the run's CURRENT avg/median; not standing
      // (an Override retracted a credit — back-browse Path 1, retro Path 5, or the live reversal) →
      // the floor restored, as if the run never completed. Before the C2 fix only the live-edge
      // reversal rolled back (rollbackBest, gated on !inBack), so a back-browse un-credit left a
      // FABRICATED Best standing on a run with fewer than n credits — and a mid-done settings change
      // (key moved) dodged even that. ★ markers: an improving write OR-folds into the key's marker
      // (a prior run's star survives); a write that only restores the floor clears it.
      useEffect(()=>{
        if(runPhase==="running"&&doneCount>=n){
          setRunPhase("done");
          if(saveStats&&currentRunIdRef.current!=null&&prevBestSnapRef.current?.runId!==currentRunIdRef.current)
            prevBestSnapRef.current={key:bestKey,best:{...(bests[bestKey]||emptyAoxBest())},runId:currentRunIdRef.current};
        }
        const snap=prevBestSnapRef.current;
        if(!snap||snap.runId!==currentRunIdRef.current)return;   // this run hasn't recorded
        const {next,avgImp,medImp}=reconcileAoxStanding(snap.best,S.good,n,S.times,snap.runId);
        setBests(p=>{
          const cur=p[snap.key]||emptyAoxBest();
          if(aoxBestEqual(cur,next))return p;
          if(avgImp||medImp)setBestNew(b=>{const e=b[snap.key]||{avg:false,med:false};return{...b,[snap.key]:{avg:e.avg||avgImp,med:e.med||medImp}};});
          else setBestNew(b=>{if(!(snap.key in b))return b;const nx={...b};delete nx[snap.key];return nx;});
          return{...p,[snap.key]:next};
        });
      },[runPhase,doneCount,n,saveStats,S.good,S.times,setBests]);/* eslint-disable-line react-hooks/exhaustive-deps */

      // Reset the run if the panel is hidden mid-run (also cancel any pending reveal auto-advance).
      useEffect(()=>{if(!visible&&runPhase==="running"){cancelRevealAdvance();eng.resetStats();setRunPhase("idle");setShown(false);}/* eslint-disable-line react-hooks/exhaustive-deps */},[visible]);

      // Settings reconcile now fires on the ⚙ popover CLOSE (Q2) — the useSettingsCloseEffect is below,
      // after reset() is defined (a RUNNING or ENDED run resets, an idle run regenerates its hidden date).

      // Freshness for App's isFullyReset (the random date is excluded). aoxN compares NORMALIZED
      // against its EFFECTIVE default — the saved personal default when one exists (Q7,
      // store/userDefaults) — so a Full Reset restoring a personal N still reads fresh; the other
      // config fields stay factory-fixed (they aren't capturable).
      const defAoxN=useUserDefaults(s=>effectivePrefDefaults(s.saved).aoxN);
      const aoxIsFreshLocal=normalizeAoxN(aoxN)===normalizeAoxN(defAoxN)&&allowMistakes===false&&oneByOne===false&&runPhase==="idle"&&shown===false&&S.played===0&&S.good===0&&S.streak===0&&S.best===0&&S.times.length===0&&state.stack.length===0&&state.forwardStack.length===0&&state.backDepth===0&&flash===null&&Object.keys(state.persistBtns).length===0&&state.calcOpen===false&&state.canOverrideCorrect===false&&Object.keys(bests).length===0&&Object.keys(bestNew).length===0&&state.pendingWrongOverride===null&&state.overrideUsedThisQ===false&&state.countedWrong===false;
      useEffect(()=>{onFreshChange?.(aoxIsFreshLocal);},[aoxIsFreshLocal,onFreshChange]);

      // Derived UI state.
      const dateVisible=isLocked||(isRunning&&(!oneByOne||shown))||inBack;
      const revealLocked=!isRunning||state.calcOpen||(oneByOne&&!shown)||inBack;
      const backDisabled=state.stack.length===0||runPhase==="idle"||runPhase==="running";
      const fwdDisabled=state.forwardStack.length===0||runPhase==="idle"||runPhase==="running";
      const last=state.stack[state.stack.length-1];
      // Override availability is NOT gated on the live `saveStats` — it's the SAME whether Save Stats
      // is on or off (owner's call, C2: gating it on saveStats made Override more forgiving when ON
      // than OFF, which is backwards). AoX feeds the engine saveStats:true (above), so every run
      // question IS scored (played always increments) → crediting via Override can't hit the
      // unscored-question 1/0 bug; the credit is simply invisible in practice mode (stats hidden, no
      // Best recorded). So Override is available whenever there's something to override — a wrong, a
      // Reveal, a Show Codes, a reversible correct, or a retro/pending target — regardless of Save
      // Stats. (Do NOT switch this to effectiveSaveStats — saveStatsThisQ is always true here.)
      const overrideAvail=!state.overrideUsedThisQ&&(state.countedWrong||state.canOverrideCorrect||(state.pendingWrongOverride!=null&&!last?.overrideUsed)||eng.retroOverrideEligible);
      const codesDisabled=runPhase==="idle"||(oneByOne&&!shown&&!inBack&&!isLocked);
      // resolvedMiss dims the grid — a revealed/show-coded question the engine ignores answers on
      // (covers the brief non-One-By-One reveal flash before it auto-advances, the Show-Codes pause,
      // and the One-By-One reveal pause).
      const optionsDisabled=isLocked||state.calcOpen||resolvedMiss||(oneByOne&&!shown&&!inBack)||runPhase==="idle"||inBack;
      const scoreDisplay=runPhase==="idle"?"0/0":`${doneCount}/${S.played}`;
      const accuracyDisplay=fmtAccuracyPct(doneCount,S.played);
      const date=state.date;

      // Handlers.
      const begin=()=>{eng.resetStats();currentRunIdRef.current=nextRunIdRef.current++;prevBestSnapRef.current=null;setRunPhase("running");setShown(true);};
      const continueRun=()=>{setShown(true);eng.restartTimer();};   // One-By-One: reveal the already-loaded next date + start its solve timer
      const startOrContinue=()=>{if(runPhase==="idle")begin();else continueRun();};
      const submitDoW=(i: number)=>{
        setFlashWithTimeout({type:i===correct?"good":"bad",idx:i});
        const willComplete=i===correct&&!state.countedWrong&&doneCount===n-1;   // the Nth credited solve completes the run
        const willAdvance=i===correct&&!willComplete;                            // a non-completing correct (first-try or late) advances
        eng.answer(i,{complete:willComplete});
        if(i!==correct&&!allowMistakes){eng.lockReveal();setRunPhase("failed");} // wrong + no mistakes → reveal the answer + fail the run
        else if(willAdvance&&oneByOne)setShown(false);                           // One-By-One: hide the freshly-loaded next date until Continue
      };
      // Reveal. Allow Mistakes OFF → fail the run. Allow Mistakes ON → count a played miss + show the
      // answer; then continue the run. One-By-One pauses on a "Next" button (awaitingNext) so you see
      // the answer before the next hidden date. Non-One-By-One FLOWS: flash the answer for FLASH_MS so
      // it's visible (a same-render advance would batch the reveal away, painting nothing), then
      // auto-advance — the next date streams in on its own, like a correct answer. (C2 Q4 + the
      // reveal-flash refinement, owner 2026-06-13.)
      const onReveal=()=>{
        eng.reveal();
        if(!allowMistakes){setRunPhase("failed");return;}
        if(oneByOne)return; // One-By-One: pause on "Next" (awaitingNext) — see the answer, then Continue
        setFlashWithTimeout({type:"good",idx:correct}); // flash the revealed answer
        if(revealAdvanceRef.current)clearTimeout(revealAdvanceRef.current);
        revealAdvanceRef.current=setTimeout(()=>{revealAdvanceRef.current=null;eng.doNew();},FLASH_MS);
      };
      // Show Codes (Allow Mistakes on) counts a miss + opens the panel; it always pauses on "Next"
      // (you need time to read the codes — calcPenaltyActive keeps awaitingNext true). Allow Mistakes
      // off fails the run. (C2 Q4 — Show Codes intentionally keeps the Next pause, unlike Reveal.)
      const onShowCodes=()=>{const open=!state.calcOpen;eng.showCodes(open);if(open&&!allowMistakes&&isRunning)setRunPhase("failed");};
      // Advance past a show-coded / One-By-One-revealed miss (Allow Mistakes on) — the run continues.
      // Closes the codes panel if open, loads the next date (the miss was already counted), One-By-One
      // hides it until Continue. (Non-One-By-One Reveal auto-advances instead — see onReveal.) (C2 Q4.)
      const onNext=()=>{if(state.calcOpen)eng.showCodes(false);eng.doNew();if(oneByOne)setShown(false);};
      const onOverride=()=>{
        // A credit / completion via Override DURING the reveal-flash window must kill the pending
        // auto-advance — otherwise the stale doNew() fires ~FLASH_MS later and either SKIPS the
        // freshly-advanced question or, at the final question, re-opens the phantom-Q(N+1) overshoot the
        // completion hold closed. The other run-mutating handlers (reset, hidden, unmount) already cancel.
        cancelRevealAdvance();
        const reverseCompleting=state.canOverrideCorrect&&!state.countedWrong&&!inBack;                 // Path 2: reverse the live completing solve
        const reverseToWrong=reverseCompleting&&state.prevStatsSnapshot&&!state.prevStatsSnapshot.wasWrong;
        const retroToWrong=eng.retroOverrideEligible&&last?.capsule?.snapshot&&!last.capsule.snapshot.wasWrong; // Path 5: retro-flip a correct entry to wrong
        const crediting=state.countedWrong||state.pendingWrongOverride!=null;                           // Path 3/4: credit a wrong
        // Crediting the CURRENT wrong (Path 3) when good is at N-1 is the run's COMPLETING solve →
        // credit but DON'T advance (stay on this question, locked), or the run would complete while
        // sitting on a phantom extra question (an Ao10 via Reveal+Override showed Q11). Mirrors a
        // normal final correct answer's `complete`. (C2 fix.)
        const completeViaOverride=state.countedWrong&&doneCount===n-1;
        const toWrong=reverseToWrong||retroToWrong;
        const failNow=toWrong&&!allowMistakes;
        if(state.countedWrong)setFlashWithTimeout({type:"good",idx:correct});   // crediting the current wrong → green flash
        eng.override({noAdvance:!!((reverseCompleting&&failNow)||completeViaOverride)}); // any Best impact reconciles in the effect above
        if(failNow)setRunPhase("failed");                                        // a to-wrong override with no mistakes fails the run (bug #2 / unified rule)
        else if(crediting&&runPhase==="failed")setRunPhase("running");           // crediting the wrong that failed the run resumes it (the completion effect then flips a completing one to done)
        else if(reverseCompleting&&allowMistakes)setRunPhase("running");         // Allow Mistakes on: reversing the completing solve resumes the run
      };
      const reset=()=>{cancelRevealAdvance();eng.resetStats();setRunPhase("idle");setShown(false);setBestNew({});prevBestSnapRef.current=null;currentRunIdRef.current=null;};
      // Cancel a pending reveal auto-advance if the component unmounts mid-flash (Full Reset remount).
      useEffect(()=>()=>{if(revealAdvanceRef.current)clearTimeout(revealAdvanceRef.current);},[]);

      // On the ⚙ popover CLOSE (Q2), reconcile AoX against the new settings: a RUNNING or ENDED
      // (done/failed) run RESETS as if Reset was pressed — its recorded Best config is now stale, so the
      // run on screen always matches the current settings — while an idle run regenerates its (hidden)
      // next date. Deferred to close so adjusting several settings doesn't churn the run/date (and the
      // solve timer) per keystroke. (Replaces the old immediate prevAoxPopRef effect.)
      useSettingsCloseEffect(settingsOpen??false,[randomFormat,dateFormat,useJulian,minY,maxY,leapChance,janFebChance,julianChance],()=>{
        if(runPhase!=="idle")reset(); else eng.regenDate();
      });

      const primaryBtn=runPhase==="idle"
        ?(<button type="button" data-key="N" className="col-span-1 px-3 py-2 rounded-xl btn-solid text-sm font-medium" onClick={startOrContinue}>Begin</button>)
        :isLocked?(<button type="button" data-key="N" className={`col-span-1 ${RESET_BTN_CLASS}`} onClick={reset}>Reset</button>)
        :awaitingNext?(<button type="button" data-key="N" className="col-span-1 px-3 py-2 rounded-xl btn-solid text-sm font-medium" onClick={onNext}>Next</button>)
        :(!shown&&oneByOne)?(<button type="button" data-key="N" className="col-span-1 px-3 py-2 rounded-xl btn-solid text-sm font-medium" onClick={startOrContinue}>Continue</button>)
        :(<button type="button" data-key="N" className={`col-span-1 ${RESET_BTN_CLASS}`} onClick={reset}>Reset</button>);

      return(
        <div style={{display:visible?"block":"none"}}>
          {/* Save Stats off: all stat boxes show "—" with strikethrough labels (matches App). */}
          <div className={saveStats?"":"opacity-50"}><StatPanel stats={[
            {label:"Score",value:scoreDisplay,off:!saveStats,fn:null},
            {label:"Accuracy",value:accuracyDisplay,off:!saveStats,fn:null},
            {label:"Streak",value:`${S.streak}/${S.best}`,off:!saveStats,fn:null},
            {label:"Last",value:truncTime(calcLast(S.times)),off:!saveStats,fn:null},
            {label:"Average",value:fmtTime(calcAvg(S.times)),off:!saveStats,fn:null},
            {label:"Median",value:fmtTime(calcMed(S.times)),off:!saveStats,fn:null},
          ]}/></div>
          <div className="mt-3 text-xs text-purple-300/60">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-[125px]">
                <div>Best Average: {fmtTime(bestData.avg)}{bestNew[bestKey]?.avg&&<NewBestStar/>}</div>
                <div className="text-[11px] opacity-70">Median: {fmtTime(bestData.avgMed)}</div>
              </div>
              <div className="min-w-[125px]">
                <div>Best Median: {fmtTime(bestData.med)}{bestNew[bestKey]?.med&&<NewBestStar/>}</div>
                <div className="text-[11px] opacity-70">Average: {fmtTime(bestData.medAvg)}</div>
              </div>
              {bestData.avgRoundId!=null&&bestData.medRoundId!=null&&<span className="shrink-0 ml-auto">{bestData.avgRoundId===bestData.medRoundId?"Same Round":"Different Rounds"}</span>}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-nowrap">
            <div className="flex items-center shrink-0"><span className={`text-sm leading-none text-purple-200/80${runPhase!=="idle"?" opacity-60":""}`}>Ao</span><input type="text" inputMode="numeric" readOnly={runPhase!=="idle"} value={aoxN} onChange={e=>{if(runPhase==="idle")setAoxN(e.target.value);}} onBlur={()=>setAoxN(String(Math.max(2,Math.min(1000,parseInt(aoxN)||10))))} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();setAoxN(String(Math.max(2,Math.min(1000,parseInt(aoxN)||10))));e.currentTarget.blur();}else if(e.key==="Escape"){setAoxN(String(n));e.currentTarget.blur();}}} className={`panel rounded-xl px-2 py-1 w-14 text-center tabular-nums text-sm focus:outline-hidden shrink-0${runPhase!=="idle"?" opacity-60 pointer-events-none":""}`}/></div>
            <button type="button" onClick={()=>{if(runPhase==="idle")setAllowMistakes(v=>!v);}} className={`flex-1 px-2 py-1 rounded-xl text-xs font-medium border ${allowMistakes?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}${runPhase!=="idle"?" opacity-60 pointer-events-none":""}`}>Allow Mistakes</button>
            <button type="button" onClick={()=>{if(runPhase==="idle")setOneByOne(v=>!v);}} className={`flex-1 px-2 py-1 rounded-xl text-xs font-medium border ${oneByOne?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}${runPhase!=="idle"?" opacity-60 pointer-events-none":""}`}>One-By-One</button>
          </div>
          <div className="mt-4 rounded-2xl panel p-4">
            <div className="text-center relative">
              {(inBack||isLocked)&&<span className="absolute right-0 top-0 text-[11px] tabular-nums text-purple-300/60">Q{state.stack.length+1}</span>}
              <div className="text-3xl font-bold">{dateVisible?fmtDate(date.y,date.m,date.d,date._fmt):"—"}</div>
            </div>
            <WeekdayAnswer inputStyle={inputStyle} persistBtns={state.persistBtns} flash={flash} optionsDisabled={optionsDisabled} onPick={submitDoW}/>
          </div>
          <div className="mt-4 rounded-2xl panel p-3 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {primaryBtn}
              <div className="col-span-1 flex gap-1">
                <button type="button" data-key="ArrowLeft" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${backDisabled?"opacity-60 pointer-events-none":""}`} onClick={eng.back}><span style={{position:'relative',top:'-1.5px'}}>&lt;</span></button>
                <button type="button" data-key="ArrowRight" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${fwdDisabled?"opacity-60 pointer-events-none":""}`} onClick={eng.forward}><span style={{position:'relative',top:'-1.5px'}}>&gt;</span></button>
              </div>
              <button type="button" data-key="R" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${revealLocked?"opacity-60 pointer-events-none":""}`} onClick={onReveal}>Reveal</button>
              <button type="button" data-key="O" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${!overrideAvail?"opacity-60 pointer-events-none":""}`} onClick={onOverride}>Override</button>
            </div>
            <button type="button" data-key="C" className={`w-full px-4 py-2 rounded-xl btn-solid text-sm font-medium ${codesDisabled&&!inBack?"opacity-60 pointer-events-none":""}`} onClick={onShowCodes}>{state.calcOpen?"Hide Codes":"Show Codes"}</button>
            <Expander open={state.calcOpen}><div className="mt-2 rounded-2xl thin px-4 pt-[3px] pb-1.5"><MethodExplanation date={aoxFrozenDate} useJulian={inBack?(aoxFrozenDate?._jul??useJulian):useJulian} displayedFormat={aoxFrozenDate?._fmt||dateFormat}/></div></Expander>
          </div>
        </div>
      );
    }

    // ============================================================
    // ClassicMode — the Classic game mode, on the shared engine (mode-untangle Step 1c).
    //
    // Self-contained + always-mounted (display:none when inactive), exactly like AoxMode:
    // it owns ALL of Classic's state via useGameEngine (the pure reducer) plus its own
    // display toggles (timing/scoring hide, the timing-desync two-tap) and the transient
    // button flash. App no longer renders Classic inline — it just mounts <ClassicMode/>
    // and passes the settings down (like it does for AoxMode). This is the first mode
    // carved out of App's fused rendering; Flash/Blitz/Deduction follow onto the same engine.
    // ============================================================
    function ClassicMode({visible,genDate,minY,maxY,useJulian,saveStats,dateFormat,randomFormat,inputStyle='buttons',leapChance,janFebChance,julianChance,fmtDate,settingsOpen,onFreshChange}: ModeProps & { genDate: GenDate; fmtDate: FmtDate }){
      const timingOff=useModePrefs(s=>s.classicTimingOff),setTimingOff=useModePrefs(s=>s.setClassicTimingOff);   // persisted; timing hidden by default (feeds the engine)
      const scoringOff=useModePrefs(s=>s.classicScoringOff),setScoringOff=useModePrefs(s=>s.setClassicScoringOff);   // persisted; scoring shown by default
      // Lifetime stats persist across reloads (Stage D1): hydrate from saved progress on mount,
      // then mirror every stats change back to the store (which caps the solve-times window).
      const eng=useGameEngine({label:'classic',genDate,minY,maxY,useJulian,saveStats,timingOff,getInitialStats:()=>useProgress.getState().stats.classic});
      const {state,correct,overrideAvail}=eng;
      // Android Back closes the Show-Codes panel of the ACTIVE mode (Q1). Gated on `visible` so only
      // the on-screen mode registers (the others are mounted-but-hidden); `eng` is the active engine
      // (for Deduction it's the current silo), so this is one line per mode. See components/useBackButton.
      useBackButton(visible&&state.calcOpen,()=>eng.showCodes(false),'codes');
      const setModeStats=useProgress(s=>s.setModeStats);
      useEffect(()=>{setModeStats('classic',state.stats);},[state.stats,setModeStats]);
      const {flash,setFlashWithTimeout}=useButtonFlash();   // green/red answer pulse
      // Hideable stats chrome (show/hide toggles + two-tap "Enable and Reset Stats?" arm + the 6-box
      // stats strip), shared with Flash/Deduction via useStatsHideToggles.
      const {timingArmed,statsArr,armedSpan,armedBtnRef}=useStatsHideToggles({eng,saveStats,visible,timingOff,setTimingOff,scoringOff,setScoringOff});
      const optionsDisabled=state.locked||state.calcOpen||state.calcPenaltyActive;
      const revealDisabled=(state.locked&&state.revealed)||state.calcOpen||state.calcPenaltyActive;

      const onAnswer=(i: number)=>{setFlashWithTimeout({type:i===correct?"good":"bad",idx:i});eng.answer(i);};
      // Override Path 3 (override-after-wrong) flashes green on the correct button, matching App.
      const onOverride=()=>{if(state.countedWrong)setFlashWithTimeout({type:"good",idx:correct});eng.override();};

      // regenDecisionFor (App's popover effect, Classic slice): a format / leap / Jan-Feb /
      // Julian-chance / year-range change regens an UNANSWERED live date; a useJulian toggle
      // keeps it (live useJulian flows through to the answer + codes). REGEN_DATE no-ops on a
      // burned or browsed date, so we just fire it on the relevant changes.
      // Defer the live-date regen to the ⚙ popover CLOSE (Q2) — batched, no per-keystroke timer churn.
      useSettingsCloseEffect(settingsOpen??false,[randomFormat,dateFormat,leapChance,janFebChance,julianChance,minY,maxY],()=>eng.regenDate());
      // Freshness — engine state at launch default + Classic's own toggle/flash fields. Reported up
      // via onFreshChange so App's isFullyReset (Full Reset dim/lock) accounts for Classic.
      const classicIsFresh=engineFresh(state)&&timingOff===true&&scoringOff===false&&timingArmed===false&&flash===null;
      const {resetArmed,onResetTap,resetBtnRef}=useResetStatsArm(eng.resetStats,!engineFresh(state),visible);   // Q2 two-tap confirm
      useEffect(()=>{onFreshChange?.(classicIsFresh);},[classicIsFresh,onFreshChange]);
      const date=state.date;
      return(
        <div style={{display:visible?"block":"none"}}>
          <div className={saveStats?"":"opacity-50"}><StatPanel stats={statsArr} armedSpan={armedSpan} armedBtnRef={armedBtnRef}/></div>
          <div className="mt-3"><button type="button" data-key="S" ref={resetBtnRef} className={resetArmed?RESET_STATS_ARMED_CLASS:RESET_STATS_BTN_CLASS} onClick={onResetTap}>{resetArmed?"Reset Stats?":"Reset Stats"}</button></div>
          <div className="mt-5">
            <div className="mt-4 rounded-2xl panel p-4">
              <div className="text-center relative">
                {state.backDepth>0&&<span className="absolute right-0 top-0 text-[11px] tabular-nums text-purple-300/60">Q{state.stack.length+1}</span>}
                <div className="text-3xl font-bold">{fmtDate(date.y,date.m,date.d,date._fmt)}</div>
              </div>
              <WeekdayAnswer inputStyle={inputStyle} persistBtns={state.persistBtns} flash={flash} optionsDisabled={optionsDisabled} onPick={onAnswer}/>
            </div>
            <div className="mt-4 rounded-2xl panel p-3 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <button type="button" data-key="N" className="col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium" onClick={()=>eng.doNew()}>New</button>
                <div className="col-span-1 flex gap-1">
                  <button type="button" data-key="ArrowLeft" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${state.stack.length===0?"opacity-60 pointer-events-none":""}`} onClick={eng.back}><span style={{position:'relative',top:'-1.5px'}}>&lt;</span></button>
                  <button type="button" data-key="ArrowRight" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${state.forwardStack.length===0?"opacity-60 pointer-events-none":""}`} onClick={eng.forward}><span style={{position:'relative',top:'-1.5px'}}>&gt;</span></button>
                </div>
                <button type="button" data-key="R" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${revealDisabled?"opacity-60 pointer-events-none":""}`} onClick={eng.reveal}>Reveal</button>
                <button type="button" data-key="O" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${!overrideAvail?"opacity-60 pointer-events-none":""}`} onClick={onOverride}>Override</button>
              </div>
              <MethodBreakdownSection date={date} open={state.calcOpen} onOpenChange={open=>eng.showCodes(open)} className="" contentClassName="mt-2 rounded-2xl thin px-4 pt-[3px] pb-1.5" useJulian={state.backDepth>0?(date?._jul??useJulian):useJulian} displayedFormat={date?._fmt||dateFormat}/>
            </div>
          </div>
        </div>
      );
    }

    // ============================================================
    // FlashMode — the Flash game mode on the shared engine (mode-untangle Step 2).
    //
    // Self-contained + always-mounted like ClassicMode/AoxMode. Reuses useGameEngine for ALL
    // engine behavior (answer/override/stats/history); adds only Flash's brief-reveal TIMER:
    // Begin advances to a fresh date + reveals it for flashMs, then it hides ("…") and you
    // answer from memory; answering, Reveal, or Override ends the flash. The timer (setTimeout
    // + rAF + the bar) is component-owned side-effect — the pure reducer never sees it.
    // (Chrome — stats strip, toggles, freshness, settings-regen — currently mirrors
    // ClassicMode; that duplication gets factored into a shared shell in Step 6, once all
    // modes' variations are known.)
    // ============================================================
    function FlashMode({visible,genDate,minY,maxY,useJulian,saveStats,dateFormat,randomFormat,inputStyle='buttons',leapChance,janFebChance,julianChance,fmtDate,settingsOpen,onFreshChange}: ModeProps & { genDate: GenDate; fmtDate: FmtDate }){
      const [active,setActive]=useState(false);
      const [flashPhase,setFlashPhase]=useState("dash");      // dash (idle) | show (revealing) | hide ("…")
      const [showTimerDate,setShowTimerDate]=useState(false); // keep the date visible after Reveal
      const flashMs=useModePrefs(s=>s.flashMs),setFlashMs=useModePrefs(s=>s.setFlashMs);   // persisted (mode-prefs store)
      // Idle countdown label starts at the persisted speed, not a hardcoded 500 (which showed a
      // stale "0.5s" after a reload with a saved speed, and would break flashIsFresh below when a
      // Full Reset remount lands on a personal default speed).
      const [flashRemainMs,setFlashRemainMs]=useState(flashMs);
      const flashTimerRef=useRef<ReturnType<typeof setTimeout> | null>(null);
      const flashDeadlineRef=useRef<number | null>(null);
      const flashBarRef=useRef<HTMLSpanElement | null>(null);
      const timingOff=useModePrefs(s=>s.flashTimingOff),setTimingOff=useModePrefs(s=>s.setFlashTimingOff);   // persisted; timing shown by default (feeds the engine)
      const scoringOff=useModePrefs(s=>s.flashScoringOff),setScoringOff=useModePrefs(s=>s.setFlashScoringOff);   // persisted; scoring shown by default
      // Lifetime stats persist across reloads (Stage D1): hydrate on mount, mirror changes to the store.
      const eng=useGameEngine({label:'flash',genDate,minY,maxY,useJulian,saveStats,timingOff,getInitialStats:()=>useProgress.getState().stats.flash});
      const {state,correct,overrideAvail}=eng;
      // Android Back closes the Show-Codes panel of the ACTIVE mode (Q1). Gated on `visible` so only
      // the on-screen mode registers (the others are mounted-but-hidden); `eng` is the active engine
      // (for Deduction it's the current silo), so this is one line per mode. See components/useBackButton.
      useBackButton(visible&&state.calcOpen,()=>eng.showCodes(false),'codes');
      const setModeStats=useProgress(s=>s.setModeStats);
      useEffect(()=>{setModeStats('flash',state.stats);},[state.stats,setModeStats]);
      const {flash,setFlashWithTimeout}=useButtonFlash();   // green/red answer pulse

      const resetFlashBar=()=>{if(flashBarRef.current){flashBarRef.current.style.transition="none";flashBarRef.current.style.transform="scaleX(1)";}};
      const startFlashBar=(ms: number)=>{requestAnimationFrame(()=>{if(!flashBarRef.current)return;const s=flashBarRef.current;s.style.transition="none";s.style.transform="scaleX(1)";s.getBoundingClientRect();s.style.transition=`transform ${ms}ms linear`;s.style.transform="scaleX(0)";});};
      const endFlashPhase=useCallback(()=>{setFlashPhase("hide");flashDeadlineRef.current=null;setFlashRemainMs(0);flashTimerRef.current=null;},[]);
      const stopFlash=()=>{clearTimeout(flashTimerRef.current ?? undefined);flashTimerRef.current=null;setFlashPhase("dash");flashDeadlineRef.current=null;setFlashRemainMs(flashMs);resetFlashBar();};
      // freezeFlash — Show-Codes-during-the-flash teardown. Unlike stopFlash (which RESETS the
      // bar to 100% + number to full for the idle state), this FREEZES the countdown in place:
      // it cancels the auto-hide timer, stops the rAF number countdown (setActive(false)), and
      // pins the bar at its current rendered scale so the bar and number freeze TOGETHER. The
      // date stays shown. (The original applyCalcPenalty froze the number but missed the bar's
      // CSS transition — bug #4. This completes the freeze.)
      const freezeFlash=()=>{
        clearTimeout(flashTimerRef.current ?? undefined);flashTimerRef.current=null;flashDeadlineRef.current=null;
        if(flashBarRef.current){const t=getComputedStyle(flashBarRef.current).transform;flashBarRef.current.style.transition="none";flashBarRef.current.style.transform=t;}
        setActive(false);setShowTimerDate(true);setFlashPhase("dash");
      };

      // rAF countdown of the reveal-time label while showing (cosmetic; matches App's loop).
      useEffect(()=>{
        if(!(active&&flashPhase==="show"))return;
        let raf = 0;
        const loop=()=>{const now=performance.now();if(flashDeadlineRef.current)setFlashRemainMs(Math.max(0,flashDeadlineRef.current-now));raf=requestAnimationFrame(loop);};
        raf=requestAnimationFrame(loop);
        return ()=>cancelAnimationFrame(raf);
      },[active,flashPhase]);

      const begin=()=>{
        eng.doNew();                       // advance to a fresh date to reveal
        setActive(true);setShowTimerDate(false);setFlashPhase("show");
        clearTimeout(flashTimerRef.current ?? undefined);
        const now=performance.now();
        flashDeadlineRef.current=now+flashMs;setFlashRemainMs(flashMs);
        flashTimerRef.current=setTimeout(endFlashPhase,Math.max(50,flashMs));
        startFlashBar(flashMs);
      };
      const onAnswer=(i: number)=>{
        if(!active)return;
        setFlashWithTimeout({type:i===correct?"good":"bad",idx:i});
        eng.answer(i);
        if(i===correct){setActive(false);stopFlash();}   // a correct answer ends the flash
      };
      // Reveal during a live flash FREEZES the countdown (bar + number) in place, exactly like
      // Show Codes — the date stays shown and the answer is revealed. Outside a live flash
      // (browsing history / idle) it keeps the plain reset-to-idle teardown.
      const onReveal=()=>{eng.reveal();if(active)freezeFlash();else{setActive(false);setShowTimerDate(true);stopFlash();}};
      // Opening Show Codes mid-flash freezes the countdown (bar + number) and keeps the date
      // shown, then applies the codes penalty — bug #4. Closing it (or opening on a non-live
      // entry) is the normal toggle.
      const onShowCodes=(open: boolean)=>{if(open&&active)freezeFlash();eng.showCodes(open);};
      const onOverride=()=>{const wasActive=active;if(state.countedWrong)setFlashWithTimeout({type:"good",idx:correct});eng.override();if(wasActive){setActive(false);stopFlash();}};
      const resetRound=()=>{eng.resetRound();setActive(false);setShowTimerDate(false);stopFlash();};   // primary "Reset" while live (= App arm)

      // Hideable stats chrome shared with Classic/Deduction. Flash supplies its flash-timer teardown:
      // afterTimingEnabled (re-enabling timing while a flash is live stops it + hides its date) and
      // onHide (leaving the mode stops a live flash). Classic/Deduction pass neither (no timer).
      const {timingArmed,statsArr,armedSpan,armedBtnRef}=useStatsHideToggles({
        eng,saveStats,visible,timingOff,setTimingOff,scoringOff,setScoringOff,
        afterTimingEnabled:()=>{if(active){setActive(false);stopFlash();}setShowTimerDate(false);},
        onHide:()=>{if(active){setActive(false);stopFlash();}},
      });

      // Defer the live-date regen to the ⚙ popover CLOSE (Q2) — batched, no per-keystroke timer churn.
      useSettingsCloseEffect(settingsOpen??false,[randomFormat,dateFormat,leapChance,janFebChance,julianChance,minY,maxY],()=>eng.regenDate());

      // Freshness for App's isFullyReset (Flash owns its state now): engine fresh + Flash's own
      // fields. flashMs (and the idle countdown mirror) compare against the EFFECTIVE default —
      // the saved personal default when one exists (Q7, store/userDefaults).
      const defFlashMs=useUserDefaults(s=>effectivePrefDefaults(s.saved).flashMs);
      const flashIsFresh=engineFresh(state)&&timingOff===false&&scoringOff===false&&timingArmed===false&&flash===null&&active===false&&flashPhase==="dash"&&showTimerDate===false&&flashMs===defFlashMs&&flashRemainMs===defFlashMs;
      useEffect(()=>{onFreshChange?.(flashIsFresh);},[flashIsFresh,onFreshChange]);

      const shouldShowTimerDate=active||showTimerDate;
      const flashHiding=active&&flashPhase==="hide";
      // Browsing back reviews RESOLVED history — never a peek at the live (memory-game) question —
      // so the hidden-date gate below must not swallow it: the browsed date shows, and Reveal +
      // Show Codes work read-only on it, matching Classic. (The gate used to hide all three while
      // browsing — the grid's green/red marks rendered but the date itself read "—" with the
      // review tools dead while Override stayed ENABLED on the invisible question. An original-app
      // wart, contradicting How-to-Play's "Back — the answer is shown". C2 fix; Back is disabled
      // while a flash is active, so inBack never overlaps a live flash.)
      const inBack=state.backDepth>0;
      const optionsDisabled=!active||state.locked||state.calcOpen||state.calcPenaltyActive;
      // Reveal is available whenever a date is on screen — including DURING the flash (matching
      // Show Codes, which keys off shouldShowTimerDate). Was wrongly locked in the "show" phase
      // via `!showTimerDate&&!flashHiding`; `!shouldShowTimerDate` enables it — bug #5.
      const revealDisabled=(state.locked&&state.revealed)||state.calcOpen||state.calcPenaltyActive||(!shouldShowTimerDate&&!inBack);
      const onResetStats=()=>{eng.resetStats();if(active){setActive(false);stopFlash();}setShowTimerDate(false);};
      const {resetArmed,onResetTap,resetBtnRef}=useResetStatsArm(onResetStats,!engineFresh(state),visible);   // Q2 two-tap confirm (Flash reset also tears the live flash down)
      const date=state.date;
      const dateText=(shouldShowTimerDate||inBack)?(flashHiding?"…":fmtDate(date.y,date.m,date.d,date._fmt)):"—";
      return(
        <div style={{display:visible?"block":"none"}}>
          <div className={saveStats?"":"opacity-50"}><StatPanel stats={statsArr} armedSpan={armedSpan} armedBtnRef={armedBtnRef}/></div>
          <div className="mt-3"><button type="button" data-key="S" ref={resetBtnRef} className={resetArmed?RESET_STATS_ARMED_CLASS:RESET_STATS_BTN_CLASS} onClick={onResetTap}>{resetArmed?"Reset Stats?":"Reset Stats"}</button></div>
          <div className="mt-3"><div className="flex items-center gap-2"><input type="range" min="100" max="5000" step="100" value={flashMs} onChange={e=>{const v=+e.target.value;setFlashMs(v);if(!active){setFlashRemainMs(v);resetFlashBar();}}} disabled={active} style={{"--rng-fill":Math.round((flashMs-100)/4900*100)+"%"} as React.CSSProperties} className="flex-1 disabled:opacity-40"/><SliderValueEditor value={flashMs} min={100} max={5000} snap={100} disabled={active} inputMode="decimal" label="Flash speed" format={fmtFlashT} toText={v=>String(v/1000)} fromText={n=>n*1000} widthClass="w-10" onCommit={v=>{setFlashMs(v);if(!active){setFlashRemainMs(v);resetFlashBar();}}}/></div></div>
          <div className="mt-5">
            <div className="mb-3"><div className="text-center text-xs tabular-nums text-purple-200/80 mb-1">{fmtFlashT(flashRemainMs)}</div><div className="bar"><span ref={flashBarRef} style={{width:"100%"}}></span></div></div>
            <div className="mt-4 rounded-2xl panel p-4">
              <div className="text-center relative">
                {state.backDepth>0&&<span className="absolute right-0 top-0 text-[11px] tabular-nums text-purple-300/60">Q{state.stack.length+1}</span>}
                <div className="text-3xl font-bold">{dateText}</div>
              </div>
              <WeekdayAnswer inputStyle={inputStyle} persistBtns={state.persistBtns} flash={flash} optionsDisabled={optionsDisabled} onPick={onAnswer}/>
            </div>
            <div className="mt-4 rounded-2xl panel p-3 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {active?(<button type="button" data-key="N" className={`col-span-1 ${RESET_BTN_CLASS}`} onClick={resetRound}>Reset</button>):(<button type="button" data-key="N" className="col-span-1 px-3 py-2 rounded-xl btn-solid text-sm font-medium" onClick={begin}>Begin</button>)}
                <div className="col-span-1 flex gap-1">
                  <button type="button" data-key="ArrowLeft" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${(active||state.stack.length===0)?"opacity-60 pointer-events-none":""}`} onClick={eng.back}><span style={{position:'relative',top:'-1.5px'}}>&lt;</span></button>
                  <button type="button" data-key="ArrowRight" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${(active||state.forwardStack.length===0)?"opacity-60 pointer-events-none":""}`} onClick={eng.forward}><span style={{position:'relative',top:'-1.5px'}}>&gt;</span></button>
                </div>
                <button type="button" data-key="R" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${revealDisabled?"opacity-60 pointer-events-none":""}`} onClick={onReveal}>Reveal</button>
                <button type="button" data-key="O" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${!overrideAvail?"opacity-60 pointer-events-none":""}`} onClick={onOverride}>Override</button>
              </div>
              <MethodBreakdownSection date={(shouldShowTimerDate||inBack)?date:null} open={state.calcOpen} onOpenChange={onShowCodes} className="" contentClassName="mt-2 rounded-2xl thin px-4 pt-[3px] pb-1.5" useJulian={state.backDepth>0?(date?._jul??useJulian):useJulian} displayedFormat={date?._fmt||dateFormat}/>
            </div>
          </div>
        </div>
      );
    }

    // ============================================================
    // BlitzMode — the Blitz game mode on the shared engine (mode-untangle Step 3).
    //
    // Self-contained + always-mounted. KEY INSIGHT: App resets stats on every blitz Begin,
    // so the engine `S` already IS the round score — Blitz needs NO reducer changes. BlitzMode
    // = the engine + a countdown (Per Round `blitzSec` / Per Question `qSec`) + Best Score/
    // Streak tracking. Begin = engine.resetStats() (fresh round) + start timer; answering uses
    // the engine; a round ends on the clock, a per-round wrong with Allow-Mistakes-off, or a
    // per-Q wrong. Best is reconciled in an effect when a round ends (set to max, tagged with
    // the round id) and ROLLED BACK there too when an Override drops the round that set it.
    // ============================================================
    function BlitzMode({visible,genDate,minY,maxY,useJulian,saveStats,dateFormat,randomFormat,inputStyle='buttons',leapChance,janFebChance,julianChance,fmtDate,settingsOpen,onFreshChange}: ModeProps & { genDate: GenDate; fmtDate: FmtDate }){
      const perQ=useModePrefs(s=>s.blitzPerQ),setPerQ=useModePrefs(s=>s.setBlitzPerQ);   // persisted (mode-prefs store)
      const allowMistakes=useModePrefs(s=>s.blitzAllowMistakes),setAllowMistakes=useModePrefs(s=>s.setBlitzAllowMistakes);   // persisted (mode-prefs store)
      const [active,setActive]=useState(false);
      const [timerDone,setTimerDone]=useState(false);
      const [showTimerDate,setShowTimerDate]=useState(false);
      const blitzSec=useModePrefs(s=>s.blitzSec),setBlitzSec=useModePrefs(s=>s.setBlitzSec);   // persisted (mode-prefs store)
      const qSec=useModePrefs(s=>s.blitzQSec),setQSec=useModePrefs(s=>s.setBlitzQSec);   // persisted (mode-prefs store)
      const [,setBlitzRemain]=useState(60);
      const [,setQRemain]=useState(5);
      const blitzStartRef=useRef<number | null>(null),blitzPausedAtRef=useRef<number | null>(null),blitzPausedAccRef=useRef(0),blitzRemainRef=useRef(60);
      const blitzBarRef=useRef<HTMLSpanElement | null>(null),blitzTimeRef=useRef<HTMLSpanElement | null>(null);
      const qDeadlineRef=useRef<number | null>(null),qPausedAtRef=useRef<number | null>(null),qPausedAccRef=useRef(0);
      const suddenBarRef=useRef<HTMLSpanElement | null>(null),suddenTimeRef=useRef<HTMLSpanElement | null>(null);
      // Blitz/Sudden all-time bests persist across reloads (Stage D1): from the progress store.
      // (The "new best ★" markers below stay local — they're per-session UI, not persisted.)
      const blitzBest=useProgress(s=>s.blitzBest),setBlitzBest=useProgress(s=>s.setBlitzBest);
      const suddenBest=useProgress(s=>s.suddenBest),setSuddenBest=useProgress(s=>s.setSuddenBest);
      const [blitzBestNew,setBlitzBestNew]=useState<Record<string, { score: boolean; streak: boolean }>>({}),[suddenBestNew,setSuddenBestNew]=useState<Record<string, boolean>>({});
      const currentRoundIdRef=useRef<number | null>(null),nextRoundIdRef=useRef(1);
      // The FULL Best records that stood BEFORE the current round (snapshotted at Begin), serving two
      // jobs from one snapshot: (a) the reconcile's cross-round rollback FLOOR — a later Override that
      // drops THIS round's score must not pull Best below the earlier round it overwrote (mirrors
      // AoX's prevBestSnapRef; C2 — cross-round Best rollback); (b) the resume-REVERT — when an
      // Override credits a misclick and RESUMES the round, the Best the interrupted round provisionally
      // saved is rolled back wholesale to these records (it re-saves only when the round genuinely
      // ends). (C2 Q2-A.)
      const prevRoundBestRef=useRef<{ blitzBk: string; suddenBk: string; blitz?: BlitzBest; sudden?: SuddenBest }>({blitzBk:'',suddenBk:''});
      // saveStats:true ALWAYS (like AoX): the round tracks internally regardless of the global Save
      // Stats toggle, which now gates only the DISPLAY (dimmed "—" stats), whether a Best is recorded,
      // and whether Override shows while off. Always-tracking keeps the misclick-rescue credit
      // integrity-safe in practice mode (good ≤ played — played is always incremented on the wrong),
      // so an unscored question can't hit the good>played landmine. (C2 Q2-B; was `saveStats`.)
      const eng=useGameEngine({label:'blitz',genDate,minY,maxY,useJulian,saveStats:true,timingOff:false}); // Blitz: timing always tracked
      const {state,correct,overrideAvail:engOverrideAvail}=eng;
      // Android Back closes the Show-Codes panel of the ACTIVE mode (Q1). Gated on `visible` so only
      // the on-screen mode registers (the others are mounted-but-hidden); `eng` is the active engine
      // (for Deduction it's the current silo), so this is one line per mode. See components/useBackButton.
      useBackButton(visible&&state.calcOpen,()=>eng.showCodes(false),'codes');
      const S=state.stats;
      const {flash,setFlashWithTimeout}=useButtonFlash();   // green/red answer pulse

      // A round ended by a player ACTION (not the clock) is RESUMABLE via Override — credit the
      // resolved question + continue. countedWrong is set by a wrong answer, a Reveal, OR a Show Codes
      // (all three end the round); a TIMER end (LOCK_REVEAL / TIMEOUT_MISS) does NOT set countedWrong,
      // so the clock running out is correctly NOT resumable. So "reveal or show codes then override"
      // continues the round, same as a misclick (owner's call, C2 — override is uniform). The resume
      // reverts the interrupted round's provisionally-saved Best (see resumeRound). One source of truth
      // for both the resume (onOverride) and any round-end-resumable check.
      const resumableEnd=timerDone&&state.countedWrong;
      // Override availability is uniform — NOT gated on the live `saveStats` (owner's call, C2: gating
      // it made Override more forgiving when Save Stats is ON than OFF, which is backwards). Blitz
      // always-tracks internally (saveStats:true above), so engOverrideAvail (which uses the frozen
      // effective save-stats, always true here) is correct in both states; the credit is just
      // invisible in practice mode (stats dimmed, no Best recorded).
      const overrideAvail=engOverrideAvail;

      // Per-config Best silos (mirrors App's getBlitzBk / getSuddenBk keys exactly).
      const blitzBk=`${allowMistakes?'m':'n'}${blitzSec}|${randomFormat?'random':dateFormat}|${leapChance}|${janFebChance}|${julianChance}|${minY}-${maxY}|${useJulian}`;
      const suddenBk=`${qSec}|${randomFormat?'random':dateFormat}|${leapChance}|${janFebChance}|${julianChance}|${minY}-${maxY}|${useJulian}`;

      const resetTimerBars=()=>{if(blitzBarRef.current)blitzBarRef.current.style.transform="scaleX(1)";if(suddenBarRef.current)suddenBarRef.current.style.transform="scaleX(1)";};
      const stopRound=()=>{blitzStartRef.current=null;blitzPausedAtRef.current=null;blitzPausedAccRef.current=0;qDeadlineRef.current=null;qPausedAtRef.current=null;qPausedAccRef.current=0;};
      const endRound=()=>{
        // Stamp the EXACT remaining time at this instant into blitzRemainRef BEFORE stopRound() nulls
        // blitzStartRef, so a later Override-resume continues from the true remaining rather than the
        // last rAF frame's value (up to a frame stale, always in the player's favor). Per-Round only —
        // the per-Question resume starts a fresh qSec, so it carries nothing. On a clock-expiry end the
        // remaining is already ~0, so this is a no-op there. (F: Blitz resume sub-frame timer drift.)
        if(!perQ&&blitzStartRef.current!=null){
          const t=(performance.now()-blitzStartRef.current-blitzPausedAccRef.current)/1000;
          blitzRemainRef.current=Math.max(0,blitzSec-t);
        }
        setActive(false);setShowTimerDate(true);setTimerDone(true);stopRound();
      };

      // Countdown loop (Per Round drains blitzRemain; Per Question drains qRemain). On 0 the
      // round ends — per-round timeout shows the answer with no stat (lockReveal); per-Q
      // timeout counts a miss (timeoutMiss).
      useEffect(()=>{
        if(!active)return;
        let raf = 0;
        const loop=()=>{
          const now=performance.now();
          if(!perQ&&blitzStartRef.current!=null){
            const t=(now-blitzStartRef.current-blitzPausedAccRef.current)/1000;
            const r=Math.max(0,blitzSec-t);blitzRemainRef.current=r;
            const sx=Math.max(0,Math.min(1,r/blitzSec));
            if(blitzBarRef.current)blitzBarRef.current.style.transform="scaleX("+sx+")";
            if(blitzTimeRef.current)blitzTimeRef.current.textContent=fmtBlitzT(r);
            setBlitzRemain(r);
            if(r<=.001){eng.lockReveal();endRound();return;}
          }
          if(perQ&&qDeadlineRef.current!=null){
            const r=Math.max(0,(qDeadlineRef.current+qPausedAccRef.current-now)/1000);
            const sx=(qSec>0?Math.max(0,Math.min(1,r/qSec)):1);
            if(suddenBarRef.current)suddenBarRef.current.style.transform="scaleX("+sx+")";
            if(suddenTimeRef.current)suddenTimeRef.current.textContent=Math.ceil(r)+"s";
            setQRemain(r);
            if(r<=.001){eng.timeoutMiss();endRound();return;}
          }
          raf=requestAnimationFrame(loop);
        };
        raf=requestAnimationFrame(loop);
        return ()=>cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- endRound is behavior-stable (closes over only stable setters + ref writes); excluded so its identity change doesn't restart the countdown
      },[active,perQ,blitzSec,qSec,eng]);

      const begin=()=>{
        eng.resetStats();                       // fresh round (S→0, history clear, new date)
        currentRoundIdRef.current=nextRoundIdRef.current++;
        // Snapshot the FULL Best records standing before this round (per the active config) — the
        // reconcile floor + the resume-revert target.
        prevRoundBestRef.current={blitzBk,suddenBk,blitz:blitzBest[blitzBk],sudden:suddenBest[suddenBk]};
        setActive(true);setTimerDone(false);setShowTimerDate(false);
        const now=performance.now();
        if(!perQ){blitzStartRef.current=now;blitzPausedAccRef.current=0;blitzPausedAtRef.current=null;setBlitzRemain(blitzSec);blitzRemainRef.current=blitzSec;}
        else{qDeadlineRef.current=now+qSec*1000;qPausedAccRef.current=0;qPausedAtRef.current=null;setQRemain(qSec);}
        resetTimerBars();
      };
      const onAnswer=(i: number)=>{
        if(!active)return;
        setFlashWithTimeout({type:i===correct?"good":"bad",idx:i});
        eng.answer(i);
        if(i===correct){
          if(perQ){const now=performance.now();qDeadlineRef.current=now+qSec*1000;qPausedAccRef.current=0;qPausedAtRef.current=null;setQRemain(qSec);}
          // per-round: round continues; engine already advanced to the next date
        }else{
          // Wrong: per-Q is sudden death; per-round ends only when Allow Mistakes is off.
          if(perQ||!allowMistakes){eng.lockReveal();endRound();}
        }
      };
      // Resume a round that an Override just RESCUED. A player action (a wrong answer, a Reveal, or a
      // Show Codes) ended the round (the clock stopped, the Best was provisionally saved by the
      // timerDone effect) and crediting that resolved question via Override continues the round
      // instead of leaving it dead. Two halves: (1) revert the Best to
      // the pre-round records (it re-saves only when the round genuinely ends) + clear its ★; (2)
      // restart the clock — Per Round continues the countdown WHERE IT STOPPED
      // (blitzStart = now − elapsed, so the remaining time = blitzRemainRef), Per Question starts a
      // fresh per-question timer on the (already-advanced) next date. Restores the pre-rewrite
      // behavior the Blitz mode-untangle dropped (original 7176a50 did exactly this). (C2 Q2-A.)
      const resumeRound=()=>{
        const snap=prevRoundBestRef.current;
        if(!perQ){
          setBlitzBest(prev=>{const nx={...prev};if(snap.blitz)nx[snap.blitzBk]=snap.blitz;else delete nx[snap.blitzBk];return nx;});
          setBlitzBestNew(p=>{if(!(snap.blitzBk in p))return p;const nx={...p};delete nx[snap.blitzBk];return nx;});
        }else{
          setSuddenBest(prev=>{const nx={...prev};if(snap.sudden)nx[snap.suddenBk]=snap.sudden;else delete nx[snap.suddenBk];return nx;});
          setSuddenBestNew(p=>{if(!(snap.suddenBk in p))return p;const nx={...p};delete nx[snap.suddenBk];return nx;});
        }
        setActive(true);setTimerDone(false);setShowTimerDate(false);
        const now=performance.now();
        if(!perQ){blitzStartRef.current=now-(blitzSec-blitzRemainRef.current)*1000;blitzPausedAccRef.current=0;blitzPausedAtRef.current=null;}
        else{qDeadlineRef.current=now+qSec*1000;qPausedAccRef.current=0;qPausedAtRef.current=null;setQRemain(qSec);}
      };
      // Override-to-wrong is a mistake: flipping a CORRECT answer to wrong (a live first-try
      // reversal, or retro-flipping the most-recent correct history entry) ends the round when
      // Allow Mistakes is off (or Per Question) — exactly like a real wrong answer (bug #1).
      // Wrong→credit overrides (countedWrong / pendingWrongOverride) are corrections and never
      // end the round. Detect the to-wrong direction from the same fields the reducer reads.
      const onOverride=()=>{
        // A round ended by an action (wrong / Reveal / Show Codes — see `resumableEnd` above) is
        // RESUMABLE: crediting the resolved question via Override continues the round instead of
        // leaving it dead, and resumeRound reverts the interrupted round's provisional Best. Captured
        // BEFORE override mutates state. (C2 Q2-A + the uniform-override extension.)
        let flipToWrong=false;
        if(state.canOverrideCorrect&&state.prevStatsSnapshot)flipToWrong=!state.prevStatsSnapshot.wasWrong;
        else if(eng.retroOverrideEligible){const last=state.stack[state.stack.length-1];flipToWrong=!!(last?.capsule?.snapshot&&!last.capsule.snapshot.wasWrong);}
        if(state.countedWrong)setFlashWithTimeout({type:"good",idx:correct});
        eng.override(); // credit (Path 3); the round then resumes (rescue) or the timerDone effect reconciles
        if(resumableEnd)resumeRound();
        else if(active&&flipToWrong&&(perQ||!allowMistakes))endRound();
      };
      const onReveal=()=>{eng.reveal();endRound();};
      // Opening Show Codes during an active round ends the round (so Best Score is recorded and
      // the countdown stops), exactly like Reveal — bug #3. The original applyCalcPenalty ended
      // the round for an active timer; the Blitz migration dropped it (bare eng.showCodes).
      const onShowCodes=(open: boolean)=>{eng.showCodes(open);if(open&&active)endRound();};
      const resetRound=()=>{eng.resetStats();setActive(false);setTimerDone(false);setShowTimerDate(false);stopRound();resetTimerBars();}; // App's arm (resets stats for blitz)

      // Leaving the mode mid-round ABANDONS the round (the original App discarded an active round
      // on switch-away; AoX resets a hidden running run and Flash stops a live flash the same way —
      // this teardown was missed in the Blitz migration). Without it the hidden rAF countdown kept
      // draining behind display:none: a per-question timeout would count a phantom MISS in absentia,
      // and the round would end + reconcile a Best for play the user walked away from. The ended
      // (timerDone) state DOES survive a detour, like AoX's done run. (C2 fix; pinned in blitz.dom.)
      useEffect(()=>{if(!visible&&active)resetRound();/* eslint-disable-line react-hooks/exhaustive-deps */},[visible]);

      // On the ⚙ popover CLOSE (Q2), reconcile Blitz against the new settings: an ACTIVE round OR an
      // ENDED round (timerDone) RESETS as if Reset was pressed — its config (and any recorded Best) is now
      // stale. This RESTORES the documented "a settings change ends an active Blitz round" behavior the
      // mode-untangle dropped (BlitzMode had no settings effect; AoX does this via its own close-effect)
      // AND applies the ended-round reset so the round on screen always matches the current settings. Idle
      // has no live round/date to reconcile. Deferred to close (batched, no per-keystroke churn).
      useSettingsCloseEffect(settingsOpen??false,[randomFormat,dateFormat,useJulian,minY,maxY,leapChance,janFebChance,julianChance],()=>{
        if(active||timerDone)resetRound();
      });

      // Reconcile Best when a round is over: set to max(S) tagged with the round id, and roll
      // back when an Override has dropped the score of the round that set the Best. Runs on
      // S changes while timerDone (covers both round-end and post-round override).
      useEffect(()=>{
        if(!timerDone)return;
        if(!saveStats)return;   // practice mode (Save Stats off): the round plays + tracks internally but records NO Best (C2 Q2-B — now that the engine always tracks, gate the Best here like AoX does)
        const rid=currentRoundIdRef.current;
        if(!perQ){
          setBlitzBest(prev=>{
            const cur=prev[blitzBk]??{score:0,streak:0,scoreRoundId:null,streakRoundId:null};
            const fb=prevRoundBestRef.current;
            const next=reconcileBlitzBest(cur,S.good,S.best,rid,{score:fb.blitz?.score??0,streak:fb.blitz?.streak??0});
            if(next.score===cur.score&&next.streak===cur.streak&&next.scoreRoundId===cur.scoreRoundId&&next.streakRoundId===cur.streakRoundId)return prev;
            const scoreUp=next.score>cur.score,streakUp=next.streak>cur.streak;
            if(scoreUp||streakUp)setBlitzBestNew(p=>{const e=p[blitzBk]||{score:false,streak:false};return{...p,[blitzBk]:{score:e.score||scoreUp,streak:e.streak||streakUp}};});
            return{...prev,[blitzBk]:next};
          });
        }else{
          setSuddenBest(prev=>{
            const cur=prev[suddenBk]??{score:0,roundId:null};
            const next=reconcileSuddenBest(cur,S.good,rid,prevRoundBestRef.current.sudden?.score??0);
            if(next.score===cur.score&&next.roundId===cur.roundId)return prev;
            if(next.score>cur.score)setSuddenBestNew(p=>({...p,[suddenBk]:true}));
            return{...prev,[suddenBk]:next};
          });
        }
      },[timerDone,saveStats,S.good,S.best,perQ,blitzBk,suddenBk,setBlitzBest,setSuddenBest]);

      const togglePerQ=()=>{if(active||timerDone)return;setPerQ(v=>{const n=!v;if(n&&allowMistakes)setAllowMistakes(false);return n;});};
      const toggleAllowMistakes=()=>{if(active||timerDone)return;setAllowMistakes(v=>!v);};

      // Freshness for App's isFullyReset. The two timer lengths compare against their EFFECTIVE
      // defaults — the saved personal defaults when they exist (Q7, store/userDefaults); the
      // excluded config (perQ, allowMistakes) stays factory-fixed (not capturable).
      const defBlitzSec=useUserDefaults(s=>effectivePrefDefaults(s.saved).blitzSec);
      const defBlitzQSec=useUserDefaults(s=>effectivePrefDefaults(s.saved).blitzQSec);
      const blitzIsFresh=state.stats.played===0&&state.stats.good===0&&state.stats.streak===0&&state.stats.best===0&&state.stats.times.length===0&&state.stack.length===0&&state.forwardStack.length===0&&state.backDepth===0&&state.locked===false&&state.revealed===false&&state.countedWrong===false&&state.canOverrideCorrect===false&&state.pendingWrongOverride===null&&state.overrideUsedThisQ===false&&state.calcOpen===false&&active===false&&timerDone===false&&showTimerDate===false&&perQ===false&&allowMistakes===true&&blitzSec===defBlitzSec&&qSec===defBlitzQSec&&Object.keys(blitzBest).length===0&&Object.keys(suddenBest).length===0&&flash===null;
      useEffect(()=>{onFreshChange?.(blitzIsFresh);},[blitzIsFresh,onFreshChange]);

      const shouldShowTimerDate=active||showTimerDate;
      const optionsDisabled=!active||state.locked||state.calcOpen||state.calcPenaltyActive;
      const timerBlocksReveal=!shouldShowTimerDate;
      const revealDisabled=(state.locked&&state.revealed)||state.calcOpen||state.calcPenaltyActive||timerBlocksReveal||timerDone;
      const timerBusy=active;
      const showStreak=!perQ;
      const sOff=!saveStats;
      const statsArr=[
        {label:"Score",value:`${S.good}/${S.played}`,off:sOff,fn:null},
        {label:"Accuracy",value:fmtAccuracyPct(S.good,S.played),off:sOff,fn:null},
        ...(showStreak?[{label:"Streak",value:`${S.streak}/${S.best}`,off:sOff,fn:null}]:[]),
        {label:"Last",value:truncTime(calcLast(S.times)),off:sOff,fn:null},
        {label:"Average",value:fmtTime(calcAvg(S.times)),off:sOff,fn:null},
        {label:"Median",value:fmtTime(calcMed(S.times)),off:sOff,fn:null},
      ];
      const date=state.date;
      const dateText=shouldShowTimerDate?fmtDate(date.y,date.m,date.d,date._fmt):"—";
      const bScore=blitzBest[blitzBk],sScore=suddenBest[suddenBk];
      return(
        <div style={{display:visible?"block":"none"}}>
          <div className={saveStats?"":"opacity-50"}><StatPanel stats={statsArr}/></div>
          {!perQ&&(()=>{const newF=blitzBestNew[blitzBk]||{score:false,streak:false};const showTag=bScore&&bScore.scoreRoundId!=null&&bScore.streakRoundId!=null;return(<div className="mt-3 text-xs text-purple-300/60"><div className="flex flex-wrap items-start gap-4"><div className="min-w-[125px]">Best Score: {bScore?.score??'—'}{newF.score&&<NewBestStar/>}</div><div className="min-w-[125px]">Best Streak: {bScore?.streak??'—'}{newF.streak&&<NewBestStar/>}</div>{showTag&&<span className="shrink-0 ml-auto">{bScore.scoreRoundId===bScore.streakRoundId?"Same Round":"Different Rounds"}</span>}</div></div>);})()}
          {perQ&&(<div className="mt-3 text-xs text-purple-300/60"><div className="flex flex-wrap items-start gap-4"><div className="min-w-[125px]">Best Score: {sScore?.score??'—'}{suddenBestNew[suddenBk]&&<NewBestStar/>}</div></div></div>)}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={toggleAllowMistakes} className={`flex-1 px-2 py-1 rounded-xl text-xs font-medium border ${allowMistakes?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}${(active||timerDone)?" opacity-60 pointer-events-none":""}`}>Allow Mistakes</button>
            <button type="button" onClick={togglePerQ} className={`flex-1 px-2 py-1 rounded-xl text-xs font-medium border btn-solid border-transparent${(active||timerDone)?" opacity-60 pointer-events-none":""}`}>{perQ?"Per Question":"Per Round"}</button>
          </div>
          <div className="mt-3">{!perQ?(<div className="flex items-center gap-2"><input type="range" min="10" max="300" step="5" value={blitzSec} onChange={e=>{const v=+e.target.value;setBlitzSec(v);if(!active){setBlitzRemain(v);blitzRemainRef.current=v;if(blitzTimeRef.current)blitzTimeRef.current.textContent=fmtBlitzT(v);if(blitzBarRef.current)blitzBarRef.current.style.transform="scaleX(1)";}}} disabled={active||timerDone} style={{"--rng-fill":Math.round((blitzSec-10)/290*100)+"%"} as React.CSSProperties} className="flex-1 disabled:opacity-40"/><SliderValueEditor value={blitzSec} min={10} max={300} snap={5} disabled={active||timerDone} inputMode="numeric" label="Blitz round timer" format={fmtBlitzT} toText={String} widthClass="w-14" onCommit={v=>{setBlitzSec(v);if(!active){setBlitzRemain(v);blitzRemainRef.current=v;if(blitzTimeRef.current)blitzTimeRef.current.textContent=fmtBlitzT(v);if(blitzBarRef.current)blitzBarRef.current.style.transform="scaleX(1)";}}}/></div>):(<div className="flex items-center gap-2"><input type="range" min="1" max="30" step="0.5" value={qSec} onChange={e=>{const v=+e.target.value;setQSec(v);if(!active){setQRemain(v);if(suddenTimeRef.current)suddenTimeRef.current.textContent=v+"s";if(suddenBarRef.current)suddenBarRef.current.style.transform="scaleX(1)";}}} disabled={active||timerDone} style={{"--rng-fill":Math.round((qSec-1)/29*100)+"%"} as React.CSSProperties} className="flex-1 disabled:opacity-40"/><SliderValueEditor value={qSec} min={1} max={30} snap={0.5} disabled={active||timerDone} inputMode="decimal" label="Blitz question timer" format={v=>v+"s"} toText={String} widthClass="w-8" onCommit={v=>{setQSec(v);if(!active){setQRemain(v);if(suddenTimeRef.current)suddenTimeRef.current.textContent=v+"s";if(suddenBarRef.current)suddenBarRef.current.style.transform="scaleX(1)";}}}/></div>)}</div>
          <div className="mt-5">
            {!perQ&&(<div className="mb-3"><div className="text-center text-xs tabular-nums text-purple-200/80 mb-1"><span ref={blitzTimeRef}>{fmtBlitzT(blitzSec)}</span></div><div className="bar"><span ref={blitzBarRef} style={{width:"100%"}}></span></div></div>)}
            {perQ&&(<div className="mb-3"><div className="text-center text-xs tabular-nums text-purple-200/80 mb-1"><span ref={suddenTimeRef}>{qSec}s</span></div><div className="bar"><span ref={suddenBarRef} style={{width:"100%"}}></span></div></div>)}
            <div className="mt-4 rounded-2xl panel p-4">
              <div className="text-center relative">
                {state.backDepth>0&&<span className="absolute right-0 top-0 text-[11px] tabular-nums text-purple-300/60">Q{state.stack.length+1}</span>}
                <div className="text-3xl font-bold">{dateText}</div>
              </div>
              <WeekdayAnswer inputStyle={inputStyle} persistBtns={state.persistBtns} flash={flash} optionsDisabled={optionsDisabled} onPick={onAnswer}/>
            </div>
            <div className="mt-4 rounded-2xl panel p-3 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {(active||timerDone)?(<button type="button" data-key="N" className={`col-span-1 ${RESET_BTN_CLASS}`} onClick={resetRound}>Reset</button>):(<button type="button" data-key="N" className="col-span-1 px-3 py-2 rounded-xl btn-solid text-sm font-medium" onClick={begin}>Begin</button>)}
                <div className="col-span-1 flex gap-1">
                  <button type="button" data-key="ArrowLeft" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${(timerBusy||state.stack.length===0)?"opacity-60 pointer-events-none":""}`} onClick={eng.back}><span style={{position:'relative',top:'-1.5px'}}>&lt;</span></button>
                  <button type="button" data-key="ArrowRight" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${(timerBusy||state.forwardStack.length===0)?"opacity-60 pointer-events-none":""}`} onClick={eng.forward}><span style={{position:'relative',top:'-1.5px'}}>&gt;</span></button>
                </div>
                <button type="button" data-key="R" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${revealDisabled?"opacity-60 pointer-events-none":""}`} onClick={onReveal}>Reveal</button>
                <button type="button" data-key="O" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${!overrideAvail?"opacity-60 pointer-events-none":""}`} onClick={onOverride}>Override</button>
              </div>
              <MethodBreakdownSection date={shouldShowTimerDate?date:null} open={state.calcOpen} onOpenChange={onShowCodes} className="" contentClassName="mt-2 rounded-2xl thin px-4 pt-[3px] pb-1.5" useJulian={state.backDepth>0?(date?._jul??useJulian):useJulian} displayedFormat={date?._fmt||dateFormat}/>
            </div>
          </div>
        </div>
      );
    }

    // ============================================================
    // DeductionMode — the Deduction game mode on the shared engine (mode-untangle Step 4).
    //
    // Self-contained + always-mounted like ClassicMode/FlashMode/BlitzMode. Deduction has THREE
    // independent sub-modes (Day/Month/Year), each with its OWN stats + history silo — modeled as
    // THREE useGameEngine instances; `dedType` selects which is shown while the other two persist
    // (exactly the per-silo behavior App had via statsByMode['deduction-*'] + dedStack[type]).
    // The "correct" answer is a puzzle OPTION INDEX, not a weekday — the shared reducer handles
    // that uniformly via correctIndexOf (puzzle entries carry `type`). Puzzles come from the pure
    // makeDedPuzzle (module scope), passed as each engine's genDate. Chrome (stats strip /
    // scoring+timing toggles / freshness / settings-regen) mirrors ClassicMode and gets folded
    // into a shared shell in Step 6, once all modes' variations are known.
    // ============================================================
    function DeductionMode({visible,minY,maxY,useJulian,saveStats,dateFormat,randomFormat,leapChance,janFebChance,julianChance,settingsOpen,onFreshChange}: ModeProps){
      const dedType=useModePrefs(s=>s.dedType),setDedType=useModePrefs(s=>s.setDedType);   // persisted (mode-prefs store)
      const [abCrossOnly,setAbCrossOnly]=useState(false);
      const [julCrossOnly,setJulCrossOnly]=useState(false);
      const [monthOnly1582,setMonthOnly1582]=useState(false);
      const timingOff=useModePrefs(s=>s.dedTimingOff),setTimingOff=useModePrefs(s=>s.setDedTimingOff);   // persisted; timing hidden by default (feeds all three engines)
      const scoringOff=useModePrefs(s=>s.dedScoringOff),setScoringOff=useModePrefs(s=>s.setDedScoringOff);   // persisted; scoring shown by default

      // Per-sub-mode puzzle generators — close over the latest settings + toggles each render.
      const opts={useJulian,leapChance,janFebChance,randomFormat,dateFormat,abCrossOnly,julCrossOnly,monthOnly1582};
      // Year init can fail when the range can't build a distinct-window puzzle (yearSubPossible
      // false). Supply a minimal valid fallback so the (hidden, unreachable) Year engine stays
      // well-formed — it's never displayed in that state (the Year button is disabled).
      const yearFallback=(lo: number): DedPuzzle=>{const y=Math.max(1,lo);const w=(useJulian&&isJulianDate(y,1,1))?wdayJulian(y,1,1):wday(y,1,1);return{type:"year",y,m:1,d:1,w,options:[y],_fmt:randomFormat?rollFormat():dateFormat,_jul:useJulian,_abx:abCrossOnly,_julx:julCrossOnly};};
      const genDay=(lo: number,hi: number): DedPuzzle=>makeDedPuzzle("day",lo,hi,opts)!;
      const genMonth=(lo: number,hi: number): DedPuzzle=>makeDedPuzzle("month",lo,hi,opts)!;
      const genYear=(lo: number,hi: number): DedPuzzle=>makeDedPuzzle("year",lo,hi,opts)||yearFallback(lo);

      // Lifetime stats persist per sub-mode (Stage D1): each silo hydrates from its own saved slice
      // on mount and mirrors changes back to the store.
      const dayEng=useGameEngine({label:'dedDay',genDate:genDay,minY,maxY,useJulian,saveStats,timingOff,getInitialStats:()=>useProgress.getState().stats.dedDay});
      const monthEng=useGameEngine({label:'dedMonth',genDate:genMonth,minY,maxY,useJulian,saveStats,timingOff,getInitialStats:()=>useProgress.getState().stats.dedMonth});
      const yearEng=useGameEngine({label:'dedYear',genDate:genYear,minY,maxY,useJulian,saveStats,timingOff,getInitialStats:()=>useProgress.getState().stats.dedYear});
      const eng=dedType==="month"?monthEng:dedType==="year"?yearEng:dayEng;
      const {state,correct,overrideAvail}=eng;
      // Android Back closes the Show-Codes panel of the ACTIVE mode (Q1). Gated on `visible` so only
      // the on-screen mode registers (the others are mounted-but-hidden); `eng` is the active engine
      // (for Deduction it's the current silo), so this is one line per mode. See components/useBackButton.
      useBackButton(visible&&state.calcOpen,()=>eng.showCodes(false),'codes');
      const setModeStats=useProgress(s=>s.setModeStats);
      useEffect(()=>{setModeStats('dedDay',dayEng.state.stats);},[dayEng.state.stats,setModeStats]);
      useEffect(()=>{setModeStats('dedMonth',monthEng.state.stats);},[monthEng.state.stats,setModeStats]);
      useEffect(()=>{setModeStats('dedYear',yearEng.state.stats);},[yearEng.state.stats,setModeStats]);
      // One flash for the active grid (only one sub-mode visible at a time). setFlash is cleared
      // directly on sub-type switch (changeDedType), so it's destructured alongside the pulse setter.
      const {flash,setFlash,setFlashWithTimeout}=useButtonFlash();   // green/red answer pulse
      // Hideable stats chrome shared with Classic/Flash — operates on the ACTIVE sub-mode's engine.
      const {timingArmed,statsArr,armedSpan,armedBtnRef}=useStatsHideToggles({eng,saveStats,visible,timingOff,setTimingOff,scoringOff,setScoringOff});

      const fmtDatePartial=(y: number,m: number,d: number,storedFmt: FormatId | undefined,missing: DatePart)=>fmtPartial(y,m,d,storedFmt||dateFormat,missing);
      const centerLastOpt=(index: number,total: number)=>{if(total<=0)return"";if(index===total-1&&total%3===1)return"col-span-3";return"";};
      // Can the range support a Year puzzle? (mirrors App's yearSubPossible exactly.)
      const yearSubPossible=(()=>{const lo=Math.max(1,minY),hi=maxY;if(hi-lo+1>=5)return true;if(!useJulian)return false;const has1581=lo<=1581&&hi>=1581,has1582=lo<=1582&&hi>=1582,has1583=lo<=1583&&hi>=1583;return(has1582&&has1583)||(has1581&&has1582);})();

      const optionsDisabled=state.locked||state.calcOpen||state.calcPenaltyActive;
      const revealDisabled=(state.locked&&state.revealed)||state.calcOpen||state.calcPenaltyActive;
      const baseBtn=BASE_BTN;
      const idleBtn="surface-button";

      const changeDedType=(t: string)=>{if(t===dedType)return;setFlash(null);setDedType(t);};   // each silo persists; just swap which shows
      const onAnswer=(i: number)=>{setFlashWithTimeout({type:i===correct?"good":"bad",idx:i});eng.answer(i);};
      // Override-after-wrong flashes green on the correct option, matching App's dedFlash branch.
      const onOverride=()=>{if(state.countedWrong)setFlashWithTimeout({type:"good",idx:correct});eng.override();};

      // Auto-switch out of Year when a range/Julian change makes it unbuildable (mirrors App).
      useEffect(()=>{if(dedType==="year"&&!yearSubPossible)setDedType("day");},[dedType,yearSubPossible,setDedType]);   // setDedType is a stable store setter
      // Auto-clear toggles when their prerequisites break (mirrors App's popover effect).
      useEffect(()=>{if(!useJulian){if(julCrossOnly)setJulCrossOnly(false);if(monthOnly1582)setMonthOnly1582(false);}},[useJulian,julCrossOnly,monthOnly1582]);
      useEffect(()=>{
        if(julCrossOnly&&(1581<minY||1583>maxY))setJulCrossOnly(false);
        if(monthOnly1582&&(1582<minY||1582>maxY))setMonthOnly1582(false);
        if(abCrossOnly&&Math.floor(Math.max(1,minY)/100)===Math.floor(maxY/100))setAbCrossOnly(false);
      },[minY,maxY,abCrossOnly,julCrossOnly,monthOnly1582]);

      // Settings-change regen: regen ALL three engines' live puzzle (each no-ops on a burned or
      // browsed date), matching App's "regen the current + cleanse FRESH non-current" on a
      // format / random-format / leap / Jan-Feb / Julian-chance / range / calendar change.
      // Defer the global-settings regen to the ⚙ popover CLOSE (Q2). The cross-toggles below stay
      // immediate — they're mode-LOCAL (toggled outside the popover), so they'd never see a close transition.
      useSettingsCloseEffect(settingsOpen??false,[randomFormat,dateFormat,leapChance,janFebChance,julianChance,minY,maxY,useJulian],()=>{dayEng.regenDate();monthEng.regenDate();yearEng.regenDate();});
      // Toggle-change regen: a relevant Deduction toggle regens the ACTIVE engine's puzzle (the
      // toggles only render in their own sub-mode, so the active engine is always the right one).
      useChangeEffect([abCrossOnly,julCrossOnly,monthOnly1582],()=>eng.regenDate());

      // Freshness — all three silos' engine state fresh + Deduction's toggles/UI at launch default
      // (dates are random, so excluded). Reported up so App's isFullyReset accounts for Deduction.
      const deductionIsFresh=engineFresh(dayEng.state)&&engineFresh(monthEng.state)&&engineFresh(yearEng.state)&&dedType==="day"&&abCrossOnly===false&&julCrossOnly===false&&monthOnly1582===false&&timingOff===true&&scoringOff===false&&timingArmed===false&&flash===null;
      const {resetArmed,onResetTap,resetBtnRef}=useResetStatsArm(eng.resetStats,!engineFresh(state),visible);   // Q2 two-tap confirm (resets the ACTIVE sub-type's silo)
      useEffect(()=>{onFreshChange?.(deductionIsFresh);},[deductionIsFresh,onFreshChange]);
      const date=state.date as DedPuzzle;
      // Codes-panel target mirrors App's deduction calcTarget: just the date fields (so
      // displayedFormat falls to the current dateFormat) + the puzzle's _jul snapshot.
      const calcTarget: { y: number; m: number; d: number; _jul?: boolean; _fmt?: FormatId } | null=date?{y:date.y,m:date.m,d:date.d,_jul:date._jul}:null;
      // cellDates for the Month 1582 codes panel (answer box groups months from both calendars).
      let cellDates=null;
      if(date&&date.type==="month"&&date.y===1582&&date.boxes){
        const box=correct>=0?date.boxes[correct]:null;
        if(box&&Array.isArray(box.months)&&box.months.length>=2)cellDates=box.months.map(m=>({y:date.y,m,d:date.d}));
      }
      // Toggle enable conditions (mirror App's render gating).
      const abPossible=Math.floor(Math.max(1,minY)/100)!==Math.floor(maxY/100);
      const has1581=1581>=minY&&1581<=maxY,has1582=1582>=minY&&1582<=maxY,has1583=1583>=minY&&1583<=maxY;
      const julPossible=useJulian&&has1582&&(has1581||has1583);
      const m1582Possible=useJulian&&1582>=minY&&1582<=maxY;

      return(
        <div style={{display:visible?"block":"none"}}>
          <div className={saveStats?"":"opacity-50"}><StatPanel stats={statsArr} armedSpan={armedSpan} armedBtnRef={armedBtnRef}/></div>
          <div className="mt-3"><button type="button" data-key="S" ref={resetBtnRef} className={resetArmed?RESET_STATS_ARMED_CLASS:RESET_STATS_BTN_CLASS} onClick={onResetTap}>{resetArmed?"Reset Stats?":"Reset Stats"}</button></div>
          <div className="mt-5">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div className="flex justify-start">
                {dedType==="year"&&(()=>{const disabled=!abPossible;const active=abCrossOnly&&!disabled;return(<button type="button" onClick={()=>{if(disabled)return;setAbCrossOnly(v=>!v);}} className={`px-2 py-1 rounded-xl text-xs font-medium border min-w-20 ${active?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}${disabled?" opacity-60 pointer-events-none":""}`}><i>ab</i> Cross</button>);})()}
              </div>
              <div className="flex gap-2 items-center">
                {["day","month","year"].map(t=>{const disabled=t==="year"&&!yearSubPossible;return(<button key={t} type="button" onClick={()=>{if(disabled)return;changeDedType(t);}} className={`px-2 py-1.5 rounded-xl text-sm font-medium border min-w-16 ${dedType===t?"btn-solid border-transparent text-white":"surface-toggle text-purple-100/80"}${disabled?" opacity-60 pointer-events-none":""}`}>{t[0].toUpperCase()+t.slice(1)}</button>);})}
              </div>
              <div className="flex justify-end">
                {dedType==="year"&&(()=>{const disabled=!julPossible;const active=julCrossOnly&&!disabled;return(<button type="button" onClick={()=>{if(disabled)return;setJulCrossOnly(v=>!v);}} className={`px-2 py-1 rounded-xl text-xs font-medium border min-w-20 ${active?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}${disabled?" opacity-60 pointer-events-none":""}`}>Jul Cross</button>);})()}
                {dedType==="month"&&(()=>{const disabled=!m1582Possible;const active=monthOnly1582&&!disabled;return(<button type="button" onClick={()=>{if(disabled)return;setMonthOnly1582(v=>!v);}} className={`px-2 py-1 rounded-xl text-xs font-medium border min-w-20 ${active?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}${disabled?" opacity-60 pointer-events-none":""}`}>1582 Only</button>);})()}
              </div>
            </div>
            <div className="mt-4 rounded-2xl panel p-4">
              <div className="text-center relative">
                {state.backDepth>0&&<span className="absolute right-0 top-0 text-[11px] tabular-nums text-purple-300/60">Q{state.stack.length+1}</span>}
                <div className="text-3xl font-bold">{date?fmtDatePartial(date.y,date.m,date.d,date._fmt,date.type):"—"}</div>
                {date&&<div className="mt-1 text-lg text-purple-100">Weekday: <span className="font-semibold">{DAY[date.w]}</span></div>}
              </div>
              <div className="mt-4">
                {date&&date.type==="year"&&(()=>{const N=date.options.length;const gridCls=N===2?"grid-cols-2":N===5?"grid-cols-6":"grid-cols-3";const colSpanFor=(idx: number)=>N===5?(idx<3?"col-span-2":"col-span-3"):"";return(<div className={`grid gap-2 ${gridCls}`} data-answer-grid="true">{date.options.map((y,idx)=>{const ps=state.persistBtns[idx];const isFlashing=!!(flash&&flash.idx===idx);const bCls=buttonStateClass(ps,isFlashing,flash?.type==="good",idleBtn);const perLocked=!!ps;const shouldDim=optionsDisabled&&!ps&&!isFlashing;return(<button key={idx} type="button" onClick={()=>{if(perLocked)return;onAnswer(idx);if(isTouch)(document.activeElement as HTMLElement | null)?.blur();}} className={`${baseBtn} py-2 text-sm ${bCls} ${(perLocked||optionsDisabled)?"pointer-events-none":""} ${shouldDim?"opacity-60":""} ${colSpanFor(idx)}`}>{fmtYear(y)}</button>);})}</div>);})()}
                {date&&date.type==="month"&&(<div className="grid grid-cols-2 gap-3" data-answer-grid="true">{date.options.map((mv,idx)=>{const last=idx===date.options.length-1?"col-span-2":"";const ps=state.persistBtns[idx];const isFlashing=!!(flash&&flash.idx===idx);const bCls=buttonStateClass(ps,isFlashing,flash?.type==="good",idleBtn);const perLocked=!!ps;const shouldDim=optionsDisabled&&!ps&&!isFlashing;return(<button key={idx} type="button" onClick={()=>{if(perLocked)return;onAnswer(idx);if(isTouch)(document.activeElement as HTMLElement | null)?.blur();}} className={`${baseBtn} ${bCls} ${(perLocked||optionsDisabled)?"pointer-events-none":""} ${shouldDim?"opacity-60":""} ${last}`}>{mv}</button>);})}</div>)}
                {date&&date.type==="day"&&(<div className="grid grid-cols-3 gap-2" data-answer-grid="true">{date.options.map((dv,idx)=>{const ps=state.persistBtns[idx];const isFlashing=!!(flash&&flash.idx===idx);const bCls=buttonStateClass(ps,isFlashing,flash?.type==="good",idleBtn);const perLocked=!!ps;const shouldDim=optionsDisabled&&!ps&&!isFlashing;return(<button key={idx} type="button" onClick={()=>{if(perLocked)return;onAnswer(idx);if(isTouch)(document.activeElement as HTMLElement | null)?.blur();}} className={`${baseBtn} py-2 text-sm ${bCls} ${(perLocked||optionsDisabled)?"pointer-events-none":""} ${shouldDim?"opacity-60":""} ${centerLastOpt(idx,date.options.length)}`}>{dv}</button>);})}</div>)}
              </div>
            </div>
            <div className="mt-4 rounded-2xl panel p-3 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <button type="button" data-key="N" className="col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium" onClick={()=>eng.doNew()}>New</button>
                <div className="col-span-1 flex gap-1">
                  <button type="button" data-key="ArrowLeft" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${state.stack.length===0?"opacity-60 pointer-events-none":""}`} onClick={eng.back}><span style={{position:'relative',top:'-1.5px'}}>&lt;</span></button>
                  <button type="button" data-key="ArrowRight" className={`flex-1 px-1 py-2 rounded-xl border surface-button text-sm font-medium flex items-center justify-center ${state.forwardStack.length===0?"opacity-60 pointer-events-none":""}`} onClick={eng.forward}><span style={{position:'relative',top:'-1.5px'}}>&gt;</span></button>
                </div>
                <button type="button" data-key="R" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${revealDisabled?"opacity-60 pointer-events-none":""}`} onClick={eng.reveal}>Reveal</button>
                <button type="button" data-key="O" className={`col-span-1 px-3 py-2 rounded-xl border surface-button text-sm font-medium text-center ${!overrideAvail?"opacity-60 pointer-events-none":""}`} onClick={onOverride}>Override</button>
              </div>
              <MethodBreakdownSection date={calcTarget} open={state.calcOpen} onOpenChange={open=>eng.showCodes(open)} className="" contentClassName="mt-2 rounded-2xl thin px-4 pt-[3px] pb-1.5" useJulian={calcTarget?._jul??useJulian} displayedFormat={calcTarget?._fmt||dateFormat} cellDates={cellDates}/>
            </div>
          </div>
        </div>
      );
    }

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
      // appScrollRef container below it. We measure the bar's offsetHeight here and
      // write it to a CSS custom property (--bar-h) on the document root; the scroll
      // container reads it via padding-top:var(--bar-h) so its content starts below
      // the bar instead of being covered by it. ResizeObserver fires on initial mount
      // and any time the bar's height changes (e.g., mode switch flips pb-2.5 in
      // guide mode vs none in game modes, or content reflows). Writing to a CSS
      // variable instead of JS-applying padding directly keeps the styling
      // declarative and avoids React state churn for a value that's not part of
      // application logic.
      const htpStickyBarRef=useRef<HTMLDivElement | null>(null);
      useEffect(()=>{
        const el=htpStickyBarRef.current;if(!el)return;
        const updateBarH=()=>{document.documentElement.style.setProperty('--bar-h',`${el.offsetHeight}px`);};
        updateBarH();
        const ro=new ResizeObserver(updateBarH);
        ro.observe(el);
        return()=>ro.disconnect();
      },[]);
      // Q3 document scroll — HtP ONLY. iOS's tap-the-status-bar-to-scroll-to-top targets the
      // ROOT scroller exclusively; an inner overflow-y div can never receive it (no JS event
      // exists to intercept the tap), so it was a no-op on every page. In guide mode — the one
      // true reading page — <html data-doc-scroll> releases the app's three scroll clamps
      // (html/body overflow:hidden + the fixed 100dvh #root box; the release rules live next
      // to those clamps in index.css) so the DOCUMENT becomes the scroller and the native
      // affordance works. All other modes keep the locked fit-to-screen architecture, and the
      // bar stays position:fixed throughout (the iOS status-bar tint sampling depends on it).
      // useLayoutEffect because the ORDER on leave matters: zero the window scroll FIRST, then
      // remove the attribute (= re-clamp) — otherwise a residual document scrollTop would
      // permanently offset the re-clamped fixed layout.
      const docScroll=mode==="guide";
      useLayoutEffect(()=>{
        if(!docScroll)return;
        document.documentElement.setAttribute('data-doc-scroll','');
        return()=>{window.scrollTo(0,0);document.documentElement.removeAttribute('data-doc-scroll');};
      },[docScroll]);
      // App-wide scroll-state tracking. Two states drive the shared edge indicators —
      //   appScrolledFromTop → bar's elev-shadow-down + the top fade
      //   appAtBottom         → the bottom fade
      // — sourced from ONE of two scrollers, branched on docScroll:
      //   • clamped modes: the confined scroll container (appScrollRef) via its own scroll
      //     listener + ResizeObserver; the fades are the fade-scroll-* masks ON the container.
      //     Container scrolls when content overflows the viewport-below-bar (any mode where
      //     content can't fit at the current viewport size).
      //   • guide mode: the DOCUMENT (data-doc-scroll) via window scroll/resize, reading
      //     document.scrollingElement against window.innerHeight (the container is a plain
      //     flow block there — window resize stands in for the container ResizeObserver);
      //     the fades are the fixed doc-fade-* strips rendered after the container.
      // Defaults: appAtBottom true / appScrolledFromTop false (no indicators on first
      // paint before scroll state is evaluated). The listener runs on every mode change
      // so it picks up the right scroller and re-evaluates against new content. Inner
      // scrollables (popover, lookup) track their own scroll state independently.
      const appScrollRef=useRef<HTMLDivElement | null>(null);
      const [appAtBottom,setAppAtBottom]=useState(true);
      const [appScrolledFromTop,setAppScrolledFromTop]=useState(false);
      useEffect(()=>{
        if(docScroll){
          const evaluate=()=>{
            const se=document.scrollingElement;if(!se)return;
            const scrollTop=se.scrollTop;
            const scrollHeight=se.scrollHeight;
            const clientHeight=window.innerHeight;
            const noOverflow=scrollHeight<=clientHeight+1;
            setAppAtBottom(noOverflow||scrollTop+clientHeight>=scrollHeight-4);
            setAppScrolledFromTop(!noOverflow&&scrollTop>0);
          };
          evaluate();
          window.addEventListener('scroll',evaluate,{passive:true});
          window.addEventListener('resize',evaluate);
          return()=>{window.removeEventListener('scroll',evaluate);window.removeEventListener('resize',evaluate);};
        }
        const el=appScrollRef.current;if(!el)return;
        const evaluate=()=>{
          const scrollTop=el.scrollTop;
          const scrollHeight=el.scrollHeight;
          const clientHeight=el.clientHeight;
          const noOverflow=scrollHeight<=clientHeight+1;
          setAppAtBottom(noOverflow||scrollTop+clientHeight>=scrollHeight-4);
          setAppScrolledFromTop(!noOverflow&&scrollTop>0);
        };
        evaluate();
        el.addEventListener('scroll',evaluate,{passive:true});
        const ro=new ResizeObserver(evaluate);
        ro.observe(el);
        return()=>{el.removeEventListener('scroll',evaluate);ro.disconnect();};
      },[mode,docScroll]);
      // Mode-change effect: reset BOTH scrollers to top on every mode switch. Without this,
      // switching from HtP (where the user scrolled) into a game mode would leave the
      // container at its previous scrollTop, hiding the top of the mode's content. The window
      // reset is belt-and-braces alongside the docScroll layout-effect cleanup (which already
      // zeroes the window BEFORE re-clamping); in the clamped modes the document can't scroll,
      // so it's a no-op. Runs after evaluate() above to ensure a clean visual transition.
      useEffect(()=>{const el=appScrollRef.current;if(el)el.scrollTop=0;window.scrollTo(0,0);},[mode]);
      // BFCache scroll reset (defense-in-depth alongside position:fixed #root).
      // Multiple events + deferred resets cover edge cases where pageshow alone isn't reliable
      // on iOS Safari. visibilitychange catches tab-foreground transitions; rAF + setTimeout
      // catch late scroll restorations that happen after the initial event fires. Resets
      // both the window/body scroll (defense-in-depth — body has overflow:hidden so it
      // can't scroll, but BFCache might try anyway) AND the inner container (the actual
      // scroll surface that the user interacts with).
      useEffect(()=>{const reset=()=>{window.scrollTo(0,0);if(document.documentElement.scrollTop!==0)document.documentElement.scrollTop=0;if(document.body.scrollTop!==0)document.body.scrollTop=0;if(appScrollRef.current)appScrollRef.current.scrollTop=0;};const onPageShow=()=>{reset();requestAnimationFrame(reset);setTimeout(reset,0);};const onVisChange=()=>{if(document.visibilityState==='visible'){reset();requestAnimationFrame(reset);}};reset();window.addEventListener('pageshow',onPageShow);document.addEventListener('visibilitychange',onVisChange);return()=>{window.removeEventListener('pageshow',onPageShow);document.removeEventListener('visibilitychange',onVisChange);};},[]);
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
      // Q3: the "Updating…" overlay (BootOverlay updating) — two triggers, each cleared by its reload:
      // the Settings "Check for updates" button shows it for ~0.9s (so the screen registers) then runs
      // forceReloadLatest (clear caches + reload), and the auto-update-on-open effect below shows it
      // while a WAITING new version activates.
      const [updating,setUpdating]=useState(false);
      const onCheckUpdates=useCallback(()=>{setUpdating(true);window.setTimeout(forceReloadLatest,900);},[]);
      // Q3 Loading screen: remove index.html's #boot splash once BOTH are true —
      //   • it has been VISIBLE ≥0.5s (bootHoldRemaining, anchored to the __bootShownAt rAF stamp — not
      //     navigation start), so a fast cached load doesn't flash it for a single frame (which read
      //     like a glitch); on a slow load it has already served its time → the hold clamps to 0;
      //   • the real stylesheet has APPLIED — the build swaps the render-blocking CSS <link> into a
      //     preload (vite.config.js bootCssPreload) so the splash can be the page's first paint, and
      //     the swap stamps window.__cssReady + fires 'app-css-ready'. Removing #boot before then would
      //     reveal an unstyled app: the module script is NOT CSSOM-blocked (it precedes the link), so on
      //     a SW-cached load React commits before the CSS lands. In dev/tests no preload link exists
      //     (CSS arrives through the JS module graph before mount) → the querySelector check is ready.
      // When the auto-update path below has claimed the handoff (updateEngagedRef), finish leaves #boot
      // alone — the Updating overlay replaces it (the updating effect), never a frame with neither.
      const updateEngagedRef=useRef(false);
      useEffect(()=>{
        let disposed=false;
        let cssFallbackId: number | undefined;
        const finish=()=>{if(!disposed&&!updateEngagedRef.current)dismissBootSplash();};
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
        },bootHoldRemaining(window.__bootShownAt,performance.now()));
        return ()=>{disposed=true;window.clearTimeout(id);if(cssFallbackId!==undefined)window.clearTimeout(cssFallbackId);window.removeEventListener('app-css-ready',finish);};
      },[]);
      // Q3 auto-update-on-open: in PRODUCTION only, register the SW (src/sw.ts, DYNAMICALLY imported so
      // the virtual:pwa-register module never loads in dev/tests; registering also kicks off src/sw.ts's
      // background registration.update() prefetch) and — IN PARALLEL, since this check needs only the
      // browser's registration, never that module — look for a new version that installed on a previous
      // visit and is WAITING. If one is: claim the #boot handoff, wait for the css-ready gate the normal
      // boot path enforces (the Updating overlay is styled by the real stylesheet — entering sooner would
      // paint it unstyled), show the Updating screen (the updating effect below removes #boot AFTER the
      // overlay commits), message the waiting worker DIRECTLY ({type:'SKIP_WAITING'} — a handler the
      // generateSW worker ships natively, so unlike registerSW's returned updateSW(true) this cannot race
      // the register module's own registration and no-op), and reload exactly ONCE when it takes control
      // (controllerchange + the reloaded guard — controllerchange can also fire for unrelated SW
      // handoffs). Cold-open only — NO resume/focus re-check (owner's call). All SW behaviour is
      // on-device. The whole flow is wrapped in the sessionStorage attempt counter (the loop breaker —
      // see readUpdateAttempts): after 2 straight failed attempts the flow is SKIPPED, the counter
      // cleared, and the app renders on the old version instead of looping Updating→reload forever.
      useEffect(()=>{
        if(!import.meta.env.PROD||typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
        let cancelled=false;
        let engageOnCss: (()=>void) | null=null;
        import('./sw.js').catch(()=>{});
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
            setUpdating(true); // #boot comes down only after this commits (the updating effect below)
            let reloaded=false;
            const reloadOnce=()=>{if(reloaded)return;reloaded=true;window.location.reload();};
            navigator.serviceWorker.addEventListener('controllerchange',()=>{clearUpdateAttempts();reloadOnce();}); // success — reset the loop breaker, then the one reload
            waiting.postMessage({type:'SKIP_WAITING'});
            // Safety net: if activation never fires controllerchange (skipWaiting failed), don't leave the
            // Updating screen stuck — a PLAIN reload after a few seconds (the old worker serves the old app
            // again; the update retries next launch). NEVER forceReloadLatest here: it wipes every cache,
            // and offline that bricks the app — the manual Check-for-updates button keeps that big hammer.
            // The attempt counter deliberately SURVIVES this reload (sessionStorage) — that's what limits
            // the retry to two rounds via the >=2 check above.
            window.setTimeout(()=>{if(!cancelled)reloadOnce();},4000);
          };
          if(appCssApplied())engage();
          else{engageOnCss=engage;window.addEventListener('app-css-ready',engage,{once:true});}
        }).catch(()=>{});
        return ()=>{cancelled=true;if(engageOnCss)window.removeEventListener('app-css-ready',engageOnCss);};
      },[]);
      // The update path's #boot handoff (paired with updateEngagedRef above): remove the splash only
      // AFTER the Updating overlay has COMMITTED — effects run post-commit, so by now the overlay is in
      // the DOM and there is never a frame with neither splash nor overlay. A no-op for the manual
      // Check-for-updates trigger (#boot is long gone by then; dismissBootSplash is idempotent).
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
          // The Save Defaults MODAL owns Tab while it's up (its scrim's focus trap) — opening the mode
          // dropdown behind an aria-modal dialog would break the modal contract. The trap already
          // stopPropagation()s presses inside its tree; this covers presses that start outside it.
          if(document.querySelector('[data-save-defaults]'))return;
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
        // Category 3a: mode switching — direct setMode (no DOM button per mode)
        const MODE_KEYS: Record<string, string>={K:'classic',F:'flash',B:'blitz',A:'aox',D:'deduction',L:'lookup'};
        if(MODE_KEYS[dataKey]){e.preventDefault();setMode(MODE_KEYS[dataKey]);setSettingsOpen(false);return;}
        // Category 3b: H — toggle to/from guide, preserving previous non-guide mode
        if(dataKey==='H'){e.preventDefault();setMode(m=>m==='guide'?(prevNonGuideModeRef.current||'classic'):'guide');setSettingsOpen(false);return;}
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
      };window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
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
      //   julianChance's 5-button row is locked when useJulian is off OR the year range is all-Gregorian
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
      // mode-screen rows from the live modePrefs store at open. Edits touch ONLY this pending
      // snapshot — Cancel/scrim/Back/settings-close discard it; Save commits it (aoxN normalized).
      const [saveDefaultsOpen,setSaveDefaultsOpen]=useState(false);
      const saveDefaultsCardRef=useRef<HTMLDivElement | null>(null); // the dialog card — focused on open (the modal a11y contract below)
      const pendSettingsRef=useRef<SettingsValues | null>(null);
      const [pendPrefs,setPendPrefs]=useState<PrefDefaults>(()=>effectivePrefDefaults(null));
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
      // Scroll-state tracking for the settings popover inner scroll wrapper.
      // Popover inner scroll state. Three flags drive the visual edge indicators:
      //   popoverScrolledFromTop → top fade (no shadow at top — no fixed UI there)
      //   popoverAtBottom        → bottom fade + sticky footer shadow (both signal "more below")
      // Defaults: scrolledFromTop false, atBottom true (no indicators on first open before
      // the listener evaluates). The two fade flags combine into fade-scroll-both when both apply.
      const popoverInnerScrollRef=useRef<HTMLDivElement | null>(null);
      const [popoverAtBottom,setPopoverAtBottom]=useState(true);
      const [popoverScrolledFromTop,setPopoverScrolledFromTop]=useState(false);
      useEffect(()=>{
        if(!settingsOpen){setPopoverAtBottom(true);setPopoverScrolledFromTop(false);return;}
        const el=popoverInnerScrollRef.current;if(!el)return;
        const evaluate=()=>{
          const noOverflow=el.scrollHeight<=el.clientHeight+1;
          setPopoverAtBottom(noOverflow||el.scrollTop+el.clientHeight>=el.scrollHeight-4);
          setPopoverScrolledFromTop(!noOverflow&&el.scrollTop>0);
        };
        evaluate();
        el.addEventListener('scroll',evaluate,{passive:true});
        const ro=new ResizeObserver(evaluate);
        ro.observe(el);
        return()=>{el.removeEventListener('scroll',evaluate);ro.disconnect();};
      },[settingsOpen]);
      // Footer-button caption auto-fit (Round-2) — the StatPanel value-fit pattern applied to the
      // Save Defaults / Reset Settings / Full Reset trio: on a narrow phone the three flex-1 buttons
      // can get too tight for their captions, so ONE shared font-size (never per-button — unequal
      // caption sizes across a matched row read as a glitch) shrinks all three together. Naturals
      // come from hidden STATIC twins of the widest caption set ("Save Defaults" / "Reset Settings" /
      // "Full Reset"), never the live captions — the Full Reset → "Confirm?" swap would otherwise
      // shrink the measurement and jiggle the whole row's size while arming. The math is
      // lib/statFit's sharedFitScale (min ratio, capped at 1); an 11px floor keeps the captions
      // legible over cosmetic fit, and overflow-hidden on the buttons (below) contains the extreme
      // remainder. In jsdom every width is 0 → scale 1 → no-op (the statFit convention).
      const footerFitRef=useRef<HTMLDivElement | null>(null);
      const fitFooterBtns=()=>{
        const row=footerFitRef.current;if(!row)return;
        const labels=Array.from(row.querySelectorAll<HTMLElement>('[data-fitlabel]'));
        const twins=Array.from(row.querySelectorAll<HTMLElement>('[data-fittwin]'));
        if(labels.length===0||twins.length===0)return;
        const naturals=twins.map(t=>t.scrollWidth);
        const avails=labels.map(l=>{const btn=l.parentElement;if(!btn)return 0;const cs=getComputedStyle(btn);return btn.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0);});
        const scale=sharedFitScale(naturals,avails);
        // Base font off a STATIC twin, never a live caption: the captions carry the inline
        // fontSize the PREVIOUS pass set, so reading them would compound the shrink on every
        // re-run of the dep-less effect (14·s, 14·s², … → pinned at the floor). Same feedback
        // loop StatPanel guards against by resetting before measuring (StatPanel.tsx fitAll);
        // here the twin — same text classes, never inline-sized — is the clean base.
        const base=parseFloat(getComputedStyle(twins[0]).fontSize)||0;
        const px=scale<1&&base>0?Math.max(11,base*scale)+"px":"";
        // Apply the fitted size to the BUTTON, not the caption span: the caption inherits it, so
        // the button's line-box strut shrinks WITH the text and the label stays vertically
        // centered. (Sizing the inline span alone left it baseline-aligned inside the button's
        // un-shrunk text-sm strut — measured ~0.6px low on-device, the owner's 2026-07-13 catch.)
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
        // Open CustomSelect dropdown panels (the mode select + the theme selects) portal out to
        // #root with role="listbox", so a tap on an option lands OUTSIDE the popover in the DOM.
        // Treat that as "inside" so picking a theme/mode doesn't slam the settings popover shut
        // before the selection registers.
        const inListbox=!!(target&&target.closest&&target.closest('[role="listbox"]'));
        // The Save Defaults popup (Q7) portals to #root with a full-screen scrim — clicks on it
        // (scrim included) are "inside": a scrim tap cancels only the POPUP (its own onClick
        // handler), never the settings panel beneath it.
        const inSaveDefaults=!!(target&&target.closest&&target.closest('[data-save-defaults]'));
        if(!inBtn&&!inPop&&!inSel&&!inListbox&&!inSaveDefaults){
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
      // Escape cancels the POPUP first — registered in the CAPTURE phase with stopPropagation so
      // the settings Escape handler above (bubble phase) never sees the same press and the panel
      // stays open. TEXT-ENTRY inputs keep their own Escape handling (the N field normalize-commits),
      // mirroring the settings handler's guard — and like it, the guard excludes type="range": the
      // popup's three sliders keep focus after an adjust and must not swallow the dismiss.
      useEffect(()=>{if(!saveDefaultsOpen)return;const h=(e: KeyboardEvent)=>{if(e.key!=="Escape")return;const ae=document.activeElement as HTMLInputElement | null;if(ae&&ae.tagName==="INPUT"&&ae.type!=="range")return;e.preventDefault();e.stopPropagation();setSaveDefaultsOpen(false);};document.addEventListener('keydown',h,true);return()=>document.removeEventListener('keydown',h,true);},[saveDefaultsOpen]);
      // The popup's modal a11y contract, part 1 of 2 (part 2 = the Tab trap on the scrim, below): on
      // open, move focus INTO the dialog — the card is tabIndex={-1} with role="dialog" +
      // aria-modal="true", so screen readers announce a modal and keyboard context starts inside it.
      // Without this, focus stays on the Save Defaults button UNDER the scrim, and keyboard/AT input
      // keeps operating the live settings panel while commitSaveDefaults would still save the snapshot
      // captured at open — a silent divergence between what's on screen and what Save persists.
      useEffect(()=>{if(saveDefaultsOpen)saveDefaultsCardRef.current?.focus();},[saveDefaultsOpen]);
      // Theme option arrays — keys match the CustomSelect API (value/label) so
      // they can be passed directly without per-render mapping.
      const DARK_THEMES=[{value:'dusk',label:'Dusk'},{value:'midnight',label:'Midnight'},{value:'nebula',label:'Nebula'}];
      const LIGHT_THEMES=[{value:'light',label:'Light'},{value:'parchment',label:'Parchment'}];
      const ALL_THEMES_LABELED=[{value:'dusk',label:'Dusk (dark)'},{value:'midnight',label:'Midnight (dark)'},{value:'nebula',label:'Nebula (dark)'},{value:'light',label:'Light (light)'},{value:'parchment',label:'Parchment (light)'}];
      // Resets every setting in the ⚙ popover to its EFFECTIVE default — the user's saved personal
      // defaults when they exist (Q7, store/userDefaults), the factory launch values otherwise.
      // Stays PANEL-ONLY by design: never touches mode-specific config outside the popover (AoX N,
      // timer durations, Deduction sub-types/toggles) or stats/history (Reset Stats handles that) —
      // Full Reset alone restores the four captured mode prefs.
      // Triggers the unified popover-settings effect, which will regenerate the current
      // date as appropriate (Random Format / Date Format / Leap Chance are always-regen).
      const resetSettings=()=>{
        // Apply the effective defaults to the 14 store-held settings in one shot (store/settings
        // applySettings), then the 2 transient text mirrors that live locally.
        applySettingsStore(defSettings);
        setMinInputVal(String(defSettings.minY));setMaxInputVal(String(defSettings.maxY));
      };
      // Save Defaults (Q7): open the confirmation popup, seeding the pending snapshot from the
      // LIVE stores (panel captured whole; the four mode-screen prefs become editable rows).
      const openSaveDefaults=()=>{
        const s=useSettings.getState();
        pendSettingsRef.current=Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(k=>[k,s[k as keyof SettingsValues]])) as SettingsValues;
        const p=useModePrefs.getState();
        const seeded={flashMs:p.flashMs,blitzSec:p.blitzSec,blitzQSec:p.blitzQSec,aoxN:normalizeAoxN(p.aoxN)};
        setPendPrefs(seeded);
        setSaveDefaultsOpen(true);
      };
      const closeSaveDefaults=useCallback(()=>setSaveDefaultsOpen(false),[]);
      // Save commits the EDITED pending snapshot (never the live stores — they stay untouched);
      // from here on Reset Settings / Full Reset / the gear indicator mean THESE values by "default".
      const commitSaveDefaults=()=>{
        if(pendSettingsRef.current)saveUserDefaults({settings:pendSettingsRef.current,prefs:{...pendPrefs,aoxN:normalizeAoxN(pendPrefs.aoxN)}});
        setSaveDefaultsOpen(false);
      };
      // Full Reset — back to the launch state, where "launch" honors the user's SAVED personal
      // defaults (Q7): the ⚙ panel and the four captured mode prefs restore to the
      // store/userDefaults snapshot when one exists, everything else to factory (and the snapshot
      // itself survives — clearing it is the Save Defaults popup's job, never Full Reset's).
      // The five always-mounted mode components own ALL
      // gameplay state (stats, history, run/round progress, config toggles, timers), so bumping
      // their *ResetKey props below remounts them and resets every per-mode value to its hook
      // default in the same render. App therefore only resets what IT owns: the current mode,
      // the ⚙ settings (delegated to resetSettings → the Zustand store + the 2 input mirrors),
      // the Lookup state, and the scroll position. Deliberately NOT a location.reload() — this
      // stays the single source of truth for "back to launch" as offline/profile state is added.
      const fullReset=()=>{
        prevNonGuideModeRef.current="classic";
        setMode("classic");
        setSettingsOpen(false);
        setAppAtBottom(true);
        setAppScrolledFromTop(false);
        // Settings popover → EFFECTIVE defaults (14 store values incl. theme + the 2 transient
        // input mirrors — the user's saved personal defaults when present, Q7).
        resetSettings();
        // Saved gameplay progress → wiped (Stage D1): clears lifetime stats + all-time bests + Lookup
        // history in the persisted store, making Full Reset permanent. Runs BEFORE the remount-key bumps
        // below, so the continuous modes re-hydrate from the now-empty store (blank stats).
        resetProgress();
        // Per-mode setup (Flash speed, Blitz/AoX config, Deduction sub-type, last mode) → launch
        // defaults. Runs BEFORE the remount-key bumps so the modes re-read the now-default prefs.
        resetModePrefs();
        // …then push the four SAVED personal defaults (Flash speed, both Blitz timers, AoX N — Q7,
        // store/userDefaults, which deliberately SURVIVES Full Reset) back over that factory reset,
        // still before the remount-key bumps. Everything else in modePrefs (Per-Round/Question,
        // Deduction sub-type, Allow Mistakes, One-By-One, show/hide toggles) stays factory. A no-op
        // when nothing is saved (defPrefs = the factory values).
        applyModePrefs(defPrefs);
        // Lookup input/output are transient local state (the history itself was cleared by resetProgress).
        setLookupInput("");setLookupOutput("");
        setLookupCalcDate(null);setLookupSelectedHistoryId(null);setLookupCalcOpen(false);
        // Remount all five mode components → their internal state resets to launch defaults.
        setAoxResetKey(k=>k+1);
        setClassicResetKey(k=>k+1);
        setFlashResetKey(k=>k+1);
        setBlitzResetKey(k=>k+1);
        setDeductionResetKey(k=>k+1);
        // Scroll window + app container to top (synchronous, avoids a visual flash before the
        // mode-change effect would do it; window.scrollTo is defense-in-depth, body can't scroll).
        if(typeof window!=="undefined")window.scrollTo(0,0);
        if(appScrollRef.current)appScrollRef.current.scrollTop=0;
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
      useBackButton(mode==='guide', ()=>setMode(prevNonGuideModeRef.current||'classic'), 'guide');
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
      const settingsStoreAtDefaults=randomFormat===defSettings.randomFormat&&dateFormat===defSettings.dateFormat&&inputStyle===defSettings.inputStyle&&useJulian===defSettings.useJulian&&minY===defSettings.minY&&maxY===defSettings.maxY&&leapChance===defSettings.leapChance&&janFebChance===defSettings.janFebChance&&julianChance===defSettings.julianChance&&saveStats===defSettings.saveStats&&useSystem===defSettings.useSystem&&darkTheme===defSettings.darkTheme&&lightTheme===defSettings.lightTheme&&manualTheme===defSettings.manualTheme;
      // The Reset Settings dim-and-lock (same pattern as Reveal/Override/etc.) ADDS the two
      // year-range *input text* mirrors, so a dirty (uncommitted) input keeps the button active
      // to clear it back to the default text.
      const settingsAtDefaults=settingsStoreAtDefaults&&minInputVal===String(defSettings.minY)&&maxInputVal===String(defSettings.maxY);
      // The ⚙ gear "modified" indicator (Q8) + the Save Defaults dim: live state diverges from the
      // effective defaults in EITHER store (any menu setting, or any of the four capturable
      // mode-screen prefs). Its complement means "nothing new to save".
      const settingsModified=!(settingsStoreAtDefaults&&prefsAtDefaults);
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
      // drag-dismiss listener → the apply-on-close pass); data-drag-stay regions (the theme selects +
      // BOTH footer rows) opt back out — the theme dropdowns must survive their open, Full Reset needs
      // its Confirm? tap, Reset Settings should show controls snapping to defaults, and Save Defaults
      // opens its confirmation popup (which portals OUT of this card, so a drag-release on popup
      // content can never drag-dismiss the panel). The Year Range
      // inputs are data-drag-focus (release = focus for typing, panel stays open). The inner scroll
      // wrapper is data-drag-scroll — the controller's auto-scroll target + edge-band geometry.
      const settingsJsx=settingsOpen&&(<div ref={settingsPopoverRef} id="settings-popover" data-drag-dismiss style={{boxShadow:'0 0 8px rgba(0,0,0,0.12)'}} className="absolute left-4 right-4 top-full mt-2 z-50 rounded-2xl card py-4 space-y-4 flex flex-col max-h-[calc(100dvh_-_var(--bar-h)_-_0.5rem_-_1rem_-_env(safe-area-inset-bottom))]">
        <div ref={popoverInnerScrollRef} data-drag-scroll className={`overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-4 px-4${popoverScrolledFromTop&&!popoverAtBottom?" fade-scroll-both":popoverScrolledFromTop?" fade-scroll-top":!popoverAtBottom?" fade-scroll-bottom":""}`}>
        {/* SETTINGS regrouped into 3 categories (Q2): Display (how it's shown + how you answer + theme),
            Dates (which dates get generated), Stats. Each category is a SectionLabel header; the former
            per-setting headings are now muted sub-labels (the Leap-Year header+sub-label pattern). Every
            control + its behaviour is unchanged — purely a regroup. */}
        <div className="space-y-2">
          <SectionLabel>Display</SectionLabel>
          <div className="text-xs text-purple-200/80">Date Format</div>
          <div className="flex items-center justify-between"><span className="text-xs text-purple-200/80">Random Format</span><button type="button" onClick={()=>setRandomFormat(v=>!v)} className={`px-3 py-1 rounded-xl text-xs font-medium border ${randomFormat?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>{randomFormat?"On":"Off"}</button></div>
          {/* The Written/Numeric format pickers + the Input picker below use the chance-row pattern
              (individually rounded gap-separated buttons, selected = btn-solid) rather than a fused
              segmented control: a fused group's overflow-hidden clipped the press-drag ring square on
              the inner buttons, while each button's own rounded-xl lets the ring follow every corner. */}
          <div className={`flex gap-2 ${randomFormat?"opacity-60 pointer-events-none":""}`}>
            <div className="flex-1 space-y-1.5">
              <SectionLabel className="text-center">Written</SectionLabel>
              <div className="flex gap-1.5">
                <button type="button" onClick={()=>setDateFormat('written-mdy')} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${dateFormat==='written-mdy'?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>MDY</button>
                <button type="button" onClick={()=>setDateFormat('written-dmy')} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${dateFormat==='written-dmy'?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>DMY</button>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              <SectionLabel className="text-center">Numeric</SectionLabel>
              <div className="flex gap-1.5">
                <button type="button" onClick={()=>setDateFormat('numeric-mdy')} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${dateFormat==='numeric-mdy'?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>MDY</button>
                <button type="button" onClick={()=>setDateFormat('numeric-dmy')} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${dateFormat==='numeric-dmy'?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>DMY</button>
                <button type="button" onClick={()=>setDateFormat('numeric-ymd')} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${dateFormat==='numeric-ymd'?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>YMD</button>
              </div>
            </div>
          </div>
          {/* Input — Buttons / Dots (the logo's 7-dot answer layout). Locks/dims in Deduction (answers
              aren't weekdays; value preserved), like Julian/Leap-Year Chance when they don't apply. */}
          <div className="text-xs text-purple-200/80 pt-1">Input</div>
          <div className={`flex gap-1.5${mode==='deduction'?" opacity-60 pointer-events-none":""}`}>
            <button type="button" onClick={()=>{if(mode!=='deduction')setInputStyle('buttons');}} aria-disabled={mode==='deduction'} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${inputStyle==='buttons'?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>Buttons</button>
            <button type="button" onClick={()=>{if(mode!=='deduction')setInputStyle('dots');}} aria-disabled={mode==='deduction'} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${inputStyle==='dots'?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>Dots</button>
          </div>
          <div className="text-xs text-purple-200/80 pt-1">Theme</div>
          <div className="flex items-center justify-between"><span className="text-xs text-purple-200/80">Use System Settings</span><button type="button" onClick={()=>setUseSystem(v=>!v)} className={`px-3 py-1 rounded-xl text-xs font-medium border ${useSystem?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>{useSystem?"On":"Off"}</button></div>
          {useSystem?(<><div data-drag-stay className="flex items-center gap-3"><span className="text-xs text-purple-200/80 w-10 shrink-0">Dark:</span><CustomSelect value={darkTheme} onChange={setDarkTheme} options={DARK_THEMES} ariaLabel="Dark theme" wrapperClassName="flex-1" className="panel rounded-xl px-2 py-1 text-sm w-full focus:outline-hidden focus-ring text-left"/></div><div data-drag-stay className="flex items-center gap-3"><span className="text-xs text-purple-200/80 w-10 shrink-0">Light:</span><CustomSelect value={lightTheme} onChange={setLightTheme} options={LIGHT_THEMES} ariaLabel="Light theme" wrapperClassName="flex-1" className="panel rounded-xl px-2 py-1 text-sm w-full focus:outline-hidden focus-ring text-left"/></div></>):(<div data-drag-stay className="flex items-center gap-3"><span className="text-xs text-purple-200/80 w-10 shrink-0">Theme:</span><CustomSelect value={manualTheme} onChange={setManualTheme} options={ALL_THEMES_LABELED} ariaLabel="Theme" wrapperClassName="flex-1" className="panel rounded-xl px-2 py-1 text-sm w-full focus:outline-hidden focus-ring text-left"/></div>)}
        </div>
        <div className="space-y-2 pt-3 border-t border-purple-500/20">
          <SectionLabel>Dates</SectionLabel>
          <div className="text-xs text-purple-200/80">Year Range</div>
          <div className="flex items-center gap-2">
            <input ref={minInputRef} type="text" inputMode="numeric" pattern="[0-9]*" data-drag-focus value={minInputVal} onChange={e=>{if(e.target.value===''||/^\d*$/.test(e.target.value))setMinInputVal(e.target.value);}} onBlur={commitMin} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commitMin();e.currentTarget.blur();}if(e.key==="Escape"){setMinInputVal(String(minY));e.currentTarget.blur();}blockMinus(e);}} onBeforeInput={blockMinusBI} className="w-16 panel rounded-xl px-2 py-1.5 text-xs text-center focus:outline-hidden focus-ring tabular-nums"/>
            <span className="text-purple-300/60 text-sm shrink-0">→</span>
            <input ref={maxInputRef} type="text" inputMode="numeric" pattern="[0-9]*" data-drag-focus value={maxInputVal} onChange={e=>{if(e.target.value===''||/^\d*$/.test(e.target.value))setMaxInputVal(e.target.value);}} onBlur={commitMax} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commitMax();e.currentTarget.blur();}if(e.key==="Escape"){setMaxInputVal(String(maxY));e.currentTarget.blur();}blockMinus(e);}} onBeforeInput={blockMinusBI} className="w-16 panel rounded-xl px-2 py-1.5 text-xs text-center focus:outline-hidden focus-ring tabular-nums"/>
          </div>
          <div className="flex items-center justify-between pt-1"><span className="text-xs text-purple-200/80">Julian Calendar (pre-Oct 15, 1582)</span><button type="button" onClick={()=>setUseJulian(v=>!v)} className={`px-3 py-1 rounded-xl text-xs font-medium border ${useJulian?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>{useJulian?"On":"Off"}</button></div>
          {/* Julian Chance: locked unless the active year range straddles 1582 (= mixed Julian+Gregorian:
              minY<=1582<=maxY). Year 1582 itself spans both calendars. When locked, the selected value
              stays visually selected so it's restored when the range becomes mixed again. */}
          <div className="text-xs text-purple-200/80 pt-1">Julian Chance</div>
          <div className="flex gap-1.5">
            {(() => { const julianMixed=useJulian&&minY<=1582&&maxY>=1582; return ['random','25','50','75','100'].map(v=>(<button key={v} type="button" onClick={()=>{if(!julianMixed)return;setJulianChance(v);}} aria-disabled={!julianMixed} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${julianChance===v?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}${!julianMixed?" opacity-60 pointer-events-none":""}`}>{v==='random'?'Random':v+'%'}</button>)); })()}
          </div>
          {/* Leap Year Chance: locked when the active range/calendar has no leap years; the selected value
              is preserved + restored when a leap year becomes reachable again. */}
          <div className="text-xs text-purple-200/80 pt-1">Leap Year Chance</div>
          <div className="flex gap-1.5">
            {(() => { const leapReachable=rangeHasLeapYear(minY,maxY,useJulian); return ['random','50','75','100'].map(v=>(<button key={v} type="button" onClick={()=>{if(!leapReachable)return;setLeapChance(v);}} aria-disabled={!leapReachable} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${leapChance===v?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}${!leapReachable?" opacity-60 pointer-events-none":""}`}>{v==='random'?'Random':v+'%'}</button>)); })()}
          </div>
          {/* Jan/Feb Chance: the listed % is the exact probability a leap-year date lands on Jan/Feb
              (Random = natural ~17%). Stays unlocked even when leap years aren't currently reachable. */}
          <div className="text-xs text-purple-200/80 pt-1">Jan/Feb Chance on Leap Years</div>
          <div className="flex gap-1.5">
            {['random','25','50','75','100'].map(v=>(<button key={v} type="button" onClick={()=>setJanFebChance(v)} className={`flex-1 px-1.5 py-1.5 rounded-xl text-xs font-medium border ${janFebChance===v?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>{v==='random'?'Random':v+'%'}</button>))}
          </div>
        </div>
        <div className="space-y-2 pt-3 border-t border-purple-500/20">
          <SectionLabel>Stats</SectionLabel>
          <div className="flex items-center justify-between"><span className="text-xs text-purple-200/80">Save Stats</span><button type="button" onClick={toggleSaveStats} className={`px-3 py-1 rounded-xl text-xs font-medium border ${saveStats?"btn-solid border-transparent":"surface-toggle text-purple-100/80"}`}>{saveStats?"On":"Off"}</button></div>
        </div>
        </div>
        <div data-drag-stay className={`popover-sticky-footer pt-4 px-4 border-t border-purple-500/20${!popoverAtBottom?" elev-shadow-up":""}`}>
          <div ref={footerFitRef} className="flex gap-2">
            {/* The invisible STATIC caption twins the auto-fit measures (fitFooterBtns above) — the
                full resting set, so the live Full Reset → "Confirm?" swap never changes the fit.
                absolute keeps them out of the flex row; same text classes as the buttons. */}
            <span data-fittwin aria-hidden="true" className="absolute invisible whitespace-nowrap text-sm font-medium">Save Defaults</span>
            <span data-fittwin aria-hidden="true" className="absolute invisible whitespace-nowrap text-sm font-medium">Reset Settings</span>
            <span data-fittwin aria-hidden="true" className="absolute invisible whitespace-nowrap text-sm font-medium">Full Reset</span>
            {/* Save Defaults (Q7): constructive → btn-solid purple (the Begin-button language), keeping
                rose exclusively for the two destructive neighbors. Dims when live state already equals
                the saved defaults (factory when none saved) — nothing new to save. Each caption sits in
                a data-fitlabel span (whitespace-nowrap so it MEASURES at full width instead of
                wrapping; overflow-hidden on the button contains the pre-fit paint). */}
            <button type="button" onClick={openSaveDefaults} className={`flex-1 px-3 py-2 rounded-xl btn-solid text-sm font-medium overflow-hidden${!settingsModified?" opacity-60 pointer-events-none":""}`}><span data-fitlabel className="whitespace-nowrap">Save Defaults</span></button>
            <button type="button" onClick={resetSettings} className={`flex-1 ${RESET_BTN_CLASS} overflow-hidden ${settingsAtDefaults?"opacity-60 pointer-events-none":""}`}><span data-fitlabel className="whitespace-nowrap">Reset Settings</span></button>
            <button ref={fullResetBtnRef} type="button" onClick={armFullReset} className={`flex-1 ${RESET_BTN_CLASS} overflow-hidden${fullResetArmed?" ring-2 ring-rose-200":""}${isFullyReset?" opacity-60 pointer-events-none":""}`}><span data-fitlabel className="whitespace-nowrap">{fullResetArmed?"Confirm?":"Full Reset"}</span></button>
          </div>
        </div>
        <div data-drag-stay className="pt-3 px-4 border-t border-purple-500/20 text-[11px] text-purple-300/60 space-y-0.5">
          {/* All three footer text links carry rounded-md px-1 -mx-1: the padding gives the press-drag
              ring breathing room around the text and the radius rounds its corners (vs a square outline
              hugging the glyphs); the negative margin cancels the padding so the text keeps its exact
              flow position. */}
          {/* The always-available way back to factory semantics (Q7). The Save Defaults popup carries a
              matching link, but the popup sits behind the Save Defaults button, which dims + locks
              exactly when live == saved — at steady state the popup link is unreachable, so this footer
              link (the same muted tier as Check for updates below) is the guaranteed path. FIRST link
              row, directly under the button trio (Round-2): it's the only actionable setting in this
              block, and it belongs to the trio's story — below it the footer decays into contact info
              and metadata. Shown only while saved defaults exist. A plain immediate action, no
              arm/confirm step: it only forgets the snapshot — live settings are untouched, and a
              re-save recreates it in two taps. It inherits the footer's data-drag-stay, so the panel
              stays open and the link's own disappearance is the visible feedback. */}
          {savedDefaults!==null&&(<div><button type="button" onClick={clearUserDefaults} className="underline select-none rounded-md px-1 -mx-1">Clear saved defaults</button></div>)}
          <div>Contact: <a href="mailto:dayoftheweekcalculation@gmail.com" className="underline break-all select-text rounded-md px-1 -mx-1">dayoftheweekcalculation@gmail.com</a></div>
          <div className="flex items-center gap-2 flex-wrap">
            <span>Last Updated: {(()=>{const d=DEPLOY_TS;const yy=d.getFullYear();const mo=d.getMonth()+1;const da=d.getDate();const numFmt=numericFormatOf(dateFormat);const datePart=fmt(yy,mo,da,numFmt);const timePart=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});return`${datePart} ${timePart}`;})()}</span>
            {/* Force the latest deployed version (clears the service-worker cache + reloads; keeps saved data). Handy on a phone where you can't hard-refresh. Styled exactly like the Contact email link above (underline, inherits the footer's text-purple-300/60) so it matches the surrounding footer text on every theme. */}
            <button type="button" onClick={onCheckUpdates} className="underline select-none rounded-md px-1 -mx-1">Check for updates</button>
          </div>
        </div>
      </div>);
      // Save Defaults confirmation popup (Q7). PORTALED to #root — deliberately OUTSIDE the
      // popover card (the ⚙ trigger's aria-controls menu), so its DOM is invisible to the press-drag controller
      // (a drag-release on popup content can never drag-dismiss the panel) and it escapes the
      // card's overflow/max-height context (a true centered modal — scrim + the popover's own
      // card/shadow language). data-save-defaults marks the whole tree (scrim included) "inside"
      // for the settings click-outside handler above; the scrim itself cancels the POPUP only
      // (target===currentTarget, so card clicks never do), and Escape + Android Back + any
      // settings close also cancel (the effects above). Edits touch ONLY the pending snapshot:
      // the three sliders mirror the mode screens' (same ranges/steps/--rng-fill, and the same
      // tap-to-type SliderValueEditor readouts — the popup seeds from the LIVE prefs, so its
      // ranges must stay a superset of every committable value) and
      // the N field mirrors the AoX input's validation trio — digits only while typing (stricter
      // than the AoX field's raw writes: the pending snapshot never holds junk), and blur, Enter
      // and Escape all normalize-commit with the AoX clamp (2–1000, fallback 10) — Escape on the
      // AoX field likewise commits the clamped current value; the popup's real discard is Cancel.
      const commitPendAoxN=()=>setPendPrefs(p=>({...p,aoxN:normalizeAoxN(p.aoxN)}));
      // Modal a11y contract, part 2 of 2 (part 1 = the focus-on-open effect above): the card is a real
      // role="dialog" aria-modal, and the scrim's Tab handler is the focus trap — plain Tab / Shift+Tab
      // cycle the popup's own controls and WRAP at the ends (native traversal in between), never
      // escaping to the settings panel under the scrim. stopPropagation keeps the press from the
      // app-wide Tab shortcut (which would open the mode selector behind the modal); the shortcut's own
      // handler also bails while the modal is mounted for presses that start outside the scrim's tree.
      const trapSaveDefaultsTab=(e: React.KeyboardEvent<HTMLDivElement>)=>{
        if(e.key!=='Tab')return;
        e.stopPropagation();
        const f=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,input'));
        if(f.length===0)return;
        const first=f[0],last=f[f.length-1],ae=document.activeElement;
        if(e.shiftKey){if(ae===first||!e.currentTarget.contains(ae)){e.preventDefault();last.focus();}}
        else if(ae===last||!e.currentTarget.contains(ae)){e.preventDefault();first.focus();}
      };
      const saveDefaultsJsx=saveDefaultsOpen&&ReactDOM.createPortal(
        (<div data-save-defaults role="presentation" className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-4" onClick={e=>{if(e.target===e.currentTarget)setSaveDefaultsOpen(false);}} onKeyDown={trapSaveDefaultsTab}>
          <div ref={saveDefaultsCardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="save-defaults-title" style={{boxShadow:'0 0 8px rgba(0,0,0,0.12)'}} className="card rounded-2xl p-4 w-full max-w-[20rem] space-y-3 focus:outline-hidden">
            <div id="save-defaults-title" className="text-sm font-semibold text-purple-50">Save current settings as your defaults?</div>
            <div className="text-xs text-purple-200/80">Also saved from the mode screens:</div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-purple-200/80 shrink-0">AoX run length (N)</span>
              {/* The Escape branch STOPS PROPAGATION: it blurs the field, and without the stop the
                  same native event would reach the document-level settings Escape handler AFTER the
                  blur — its input-has-focus skip no longer applies, and it would slam the whole
                  panel (and this popup) shut on what the user meant as a keyboard dismiss. */}
              <input type="text" inputMode="numeric" pattern="[0-9]*" aria-label="AoX run length (N)" value={pendPrefs.aoxN} onChange={e=>{const v=e.target.value;if(v===''||/^\d*$/.test(v))setPendPrefs(p=>({...p,aoxN:v}));}} onBlur={commitPendAoxN} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commitPendAoxN();e.currentTarget.blur();}else if(e.key==="Escape"){e.stopPropagation();commitPendAoxN();e.currentTarget.blur();}}} className="panel rounded-xl px-2 py-1 w-14 text-center tabular-nums text-sm focus:outline-hidden focus-ring shrink-0"/>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-purple-200/80">Flash speed</div>
              <div className="flex items-center gap-2"><input type="range" min="100" max="5000" step="100" aria-label="Flash speed" value={pendPrefs.flashMs} onChange={e=>{const v=+e.target.value;setPendPrefs(p=>({...p,flashMs:v}));}} style={{"--rng-fill":Math.round((pendPrefs.flashMs-100)/4900*100)+"%"} as React.CSSProperties} className="flex-1"/><SliderValueEditor value={pendPrefs.flashMs} min={100} max={5000} snap={100} inputMode="decimal" label="Flash speed" format={fmtFlashT} toText={v=>String(v/1000)} fromText={n=>n*1000} widthClass="w-10" onCommit={v=>setPendPrefs(p=>({...p,flashMs:v}))}/></div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-purple-200/80">Blitz round timer</div>
              <div className="flex items-center gap-2"><input type="range" min="10" max="300" step="5" aria-label="Blitz round timer" value={pendPrefs.blitzSec} onChange={e=>{const v=+e.target.value;setPendPrefs(p=>({...p,blitzSec:v}));}} style={{"--rng-fill":Math.round((pendPrefs.blitzSec-10)/290*100)+"%"} as React.CSSProperties} className="flex-1"/><SliderValueEditor value={pendPrefs.blitzSec} min={10} max={300} snap={5} inputMode="numeric" label="Blitz round timer" format={fmtBlitzT} toText={String} widthClass="w-14" onCommit={v=>setPendPrefs(p=>({...p,blitzSec:v}))}/></div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-purple-200/80">Blitz question timer</div>
              <div className="flex items-center gap-2"><input type="range" min="1" max="30" step="0.5" aria-label="Blitz question timer" value={pendPrefs.blitzQSec} onChange={e=>{const v=+e.target.value;setPendPrefs(p=>({...p,blitzQSec:v}));}} style={{"--rng-fill":Math.round((pendPrefs.blitzQSec-1)/29*100)+"%"} as React.CSSProperties} className="flex-1"/><SliderValueEditor value={pendPrefs.blitzQSec} min={1} max={30} snap={0.5} inputMode="decimal" label="Blitz question timer" format={v=>v+"s"} toText={String} widthClass="w-8" onCommit={v=>setPendPrefs(p=>({...p,blitzQSec:v}))}/></div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={closeSaveDefaults} className="flex-1 px-3 py-2 rounded-xl text-sm font-medium border surface-toggle text-purple-100/80">Cancel</button>
              <button type="button" onClick={commitSaveDefaults} className="flex-1 px-3 py-2 rounded-xl btn-solid text-sm font-medium">Save</button>
            </div>
            {/* Escape hatch back to factory semantics — clears the snapshot (Full Reset deliberately
                never does; the ⚙ footer's "Clear saved defaults" link is the same action, reachable
                even when the dimmed Save Defaults button makes this popup unopenable). Shown only
                while saved defaults exist; the popup stays open (the pending values remain saveable). */}
            {savedDefaults!==null&&(<div className="text-center"><button type="button" onClick={clearUserDefaults} className="text-[11px] text-purple-300/60 underline select-none">Clear saved defaults (back to factory)</button></div>)}
          </div>
        </div>),
        document.getElementById('root')!
      );
      return(
        <>
          {updating?<BootOverlay updating/>:null}
        {/* Bar (position:fixed): the bar is a CHROME-STYLE fixed element above
            everything — explicitly positioned at the viewport top so iOS PWA recognizes
            it as chrome UI and live-samples its bg-(--bg1) (theme-aware) for the
            status bar color. Sibling appScrollRef container sits below with
            padding-top:var(--bar-h) so its content starts below the bar
            (position:absolute in the clamped modes; a plain flow block in guide mode,
            where the document scrolls — see docScroll).
            ResizeObserver elsewhere in App writes the bar's offsetHeight to --bar-h.
            Full width (no max-w) so theme bg + elevation shadow span edge-to-edge on
            screens wider than 480px; inner max-w-[30rem] wrapper holds the title row.
            elev-shadow-down appears when the scroll container is past top.
            HtP-only bar pb-2.5: absorbs half (10px) of the 20px gap that normally sits
            between the title row and the first GuidePage panel. The <GuidePage/> wrapper
            also drops mt-5 → mt-2.5 to compensate, so the total gap stays 20px — but the
            visual "lock line" is centered between title row and first panel rather than
            sitting right at the title row's bottom edge.
            ⚠ The SPACE in `pt-5 ${` is REQUIRED — Tailwind v4's source scanner silently drops a
            utility glued directly to `${` when it appears nowhere else; without it the bar lost
            its pt-5 (20px) top padding and the whole site sat ~20px too high. Don't remove the
            space. (Calendar Game layout bug-fix, 2026-06-01.) */}
        <div ref={htpStickyBarRef} style={{position:'fixed',top:0,left:0,right:0,zIndex:30}} className={`htp-sticky-bar bg-(--bg1) w-full pt-5 ${mode==="guide"?" pb-2.5":""}${appScrolledFromTop?" elev-shadow-down":""}`}>
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
                      gear-modified (Q8, the inside-bottom violet bar — index.css) marks live state ≠
                      the saved defaults while the panel is CLOSED (the open gear is solid purple, no
                      bar); the aria-label mirrors the same boolean in both states. */}
                  <button type="button" data-select-trigger aria-controls={settingsOpen?"settings-popover":undefined} onPointerDown={e=>{if(!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;setSettingsOpen(v=>!v);}} onClick={()=>setSettingsOpen(v=>!v)} className={`px-2.5 py-2 rounded-xl text-sm border ${settingsOpen?"btn-solid border-transparent":`panel text-purple-100/80${settingsModified?" gear-modified":""}`}`} aria-label={settingsModified?"Settings (modified)":"Settings"}>⚙</button>
                </div>
                {/* mode selector */}
                {/* Mode CustomSelect. Replaced the original native <select> as part of the
                    site-wide CustomSelect rollout that fixed iOS Safari's native picker
                    auto-close bug — see the CustomSelect component for full context.
                    wrapperRef={modeSelectRef} so the existing settings click-outside handler
                    keeps treating taps inside the mode dropdown the same way it treated taps
                    on the original <select>. showChevron renders the same ▲▼ indicator. */}
                <CustomSelect wrapperRef={modeSelectRef} value={mode} onChange={(v)=>{setMode(v);setSettingsOpen(false);}} options={MODE_LABELS} ariaLabel="Mode" showChevron pressDrag className="panel rounded-xl px-2.5 py-2 pr-9 text-sm focus:outline-hidden focus-ring text-left"/>
              </div>
            </div>
            {settingsJsx}
            {saveDefaultsJsx}
          </div>
        </div>
        {/* Scroll container. Clamped modes (everything but HtP): position:absolute inset:0
            with padding-top:var(--bar-h) so content starts immediately below the bar;
            overscroll-contain keeps rubber-band bounce LOCAL to this container (bar is
            unaffected); the fade-scroll-* masks mark overflowing edges. Guide mode
            (docScroll): the DOCUMENT scrolls instead — same div, same ref, same padding-top,
            but a plain classless flow block (no clamp/overflow/mask classes; the doc-fade
            strips below replace the masks), and the inner wrapper trades pb-3 for the same
            0.75rem plus the safe-area inset — in document flow the 100dvh #root clamp no
            longer keeps the last panel above the iPhone home indicator. */}
        <div ref={appScrollRef} style={{paddingTop:'var(--bar-h)'}} className={docScroll?undefined:`absolute inset-0 overflow-y-auto overscroll-contain${appScrolledFromTop&&!appAtBottom?" fade-scroll-both":appScrolledFromTop?" fade-scroll-top":!appAtBottom?" fade-scroll-bottom":""}`}>
        <div className={`mx-auto px-4 w-full max-w-[30rem]${docScroll?" pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]":" pb-3"}`}>
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
            <FlashMode visible={mode==="flash"} genDate={genDate} minY={minY} maxY={maxY} useJulian={useJulian} saveStats={saveStats} dateFormat={dateFormat} randomFormat={randomFormat} inputStyle={inputStyle} leapChance={leapChance} janFebChance={janFebChance} julianChance={julianChance} fmtDate={fmtDate} settingsOpen={settingsOpen} onFreshChange={setFlashIsFresh}/>
          </ModeErrorBoundary>
          <ModeErrorBoundary key={"blitz-"+blitzResetKey} mode="Blitz" active={mode==="blitz"}>
            <BlitzMode visible={mode==="blitz"} genDate={genDate} minY={minY} maxY={maxY} useJulian={useJulian} saveStats={saveStats} dateFormat={dateFormat} randomFormat={randomFormat} inputStyle={inputStyle} leapChance={leapChance} janFebChance={janFebChance} julianChance={julianChance} fmtDate={fmtDate} settingsOpen={settingsOpen} onFreshChange={setBlitzIsFresh}/>
          </ModeErrorBoundary>
          <ModeErrorBoundary key={"deduction-"+deductionResetKey} mode="Deduction" active={mode==="deduction"}>
            <DeductionMode visible={mode==="deduction"} minY={minY} maxY={maxY} useJulian={useJulian} saveStats={saveStats} dateFormat={dateFormat} randomFormat={randomFormat} leapChance={leapChance} janFebChance={janFebChance} julianChance={julianChance} settingsOpen={settingsOpen} onFreshChange={setDeductionIsFresh}/>
          </ModeErrorBoundary>
          {mode==="lookup"&&(<ModeErrorBoundary mode="Lookup" active={true}><div className="mt-5"><LookupCard history={lookupHistory} onAddHistory={pushLookupHistory} onMoveHistory={moveHistoryEntryToTop} onClearHistory={clearLookupHistory} inputValue={lookupInput} onInputChange={setLookupInput} outputValue={lookupOutput} onOutputChange={setLookupOutput} calcDate={lookupCalcDate} onCalcDateChange={setLookupCalcDate} selectedHistoryId={lookupSelectedHistoryId} onSelectedHistoryIdChange={setLookupSelectedHistoryId} calcOpen={lookupCalcOpen} onCalcOpenChange={setLookupCalcOpen} fmtDate={fmtDate} dateFormat={dateFormat} useJulian={useJulian}/></div></ModeErrorBoundary>)}
          {mode==="guide"&&(<ModeErrorBoundary mode="How to Play" active={true}><div className="mt-2.5"><GuidePage/></div></ModeErrorBoundary>)}
        </div>
        </div>
        {/* Doc-scroll edge fades (guide mode only): the fade-scroll-* masks live ON the scroll
            container and fade its CONTENT box — meaningless once the document scrolls (the
            mask's bottom edge would sit at the end of the whole document, off-screen). These
            fixed, untouchable strips paint the same 24px feather over the VIEWPORT edges
            instead (see index.css), driven by the same two scroll states as the masks.
            position:fixed is correct here — this is the real app viewport, not a transformed
            portal; the top strip tucks under the fixed bar at --bar-h, the bottom strip hugs
            the viewport floor. */}
        {docScroll&&appScrolledFromTop?<div aria-hidden="true" className="doc-fade-top"/>:null}
        {docScroll&&!appAtBottom?<div aria-hidden="true" className="doc-fade-bottom"/>:null}
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
    // MethodExplanation / MethodBreakdownSection (Show Codes panel) → src/components/MethodBreakdown.jsx, imported at top.

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

    // Real-user error reporting (C1). PRODUCTION + STAGING only — import.meta.env.PROD is false in
    // `vite dev`, so dev never reports. Lazy-loads the Sentry SDK as its own chunk (see
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
    // calculation (tests/bootSplash.dom).
    export { App, randomDate, makeDedPuzzle, bootHoldRemaining, BootOverlay };
