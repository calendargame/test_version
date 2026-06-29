// ─────────────────────────────────────────────────────────────────────────
// lib/pointerGestures.ts — the global press-drag-release input controller (Q4 + Q5).
//
// Makes button activation RELEASE-based instead of press-based, with three behaviours:
//
//   • SLIDE-OFF-TO-CANCEL (every <button>): a press fires the button only if you RELEASE on it. Slide
//     your finger off and release → nothing happens (cancelled). This matches the mobile convention and
//     what a desktop mouse already does, and finally lets you escape a misclick. (Today on touch the
//     browser's implicit pointer-capture fires the ORIGINAL button no matter where the finger drifts.)
//
//   • DRAG-TO-SELECT (inside a [data-answer-grid] or [data-select-group] — "selection groups"): press an
//     option, drag across (the option under your finger highlights live), release on an option → THAT
//     option activates; release outside → cancel. So a wrong first touch can be corrected by sliding to
//     the right one. Outside a group, dragging onto another button never activates it — the gesture
//     belongs to the button you pressed.
//
//   • PRESS-DRAG MENU (Q5 + C2): a press on a [data-select-trigger] (the mode selector, or the ⚙ Settings
//     button) whose own pointerdown opens a menu — you can drag straight into the menu and release on an
//     option to pick it, in one gesture. The menu is a [data-select-group] (mode menu) OR a
//     [data-select-menu] (the tall scrollable Settings panel — menu-only, NOT a drag-select group, so a
//     drag that STARTS inside the panel still scrolls natively instead of selecting). For a tall menu,
//     dragging near its top/bottom edge AUTO-SCROLLS it so you can reach options below the fold in the one
//     gesture (autoScroll, below). Because the trigger toggles on pointerdown, its click is ALWAYS
//     suppressed (else it would double-toggle); a quick tap with no menu-open still toggles via pointerdown.
//
// HOW: one set of document capture-phase Pointer-Event listeners (unifying mouse + touch + pen). On
// `pointerup` we read the button under the release point (elementFromPoint) and decide. To override the
// native click — which on touch targets the pressed button regardless of drift — we SUPPRESS it in a
// capture-phase `click` listener (it runs before React's root listener, so a suppressed click never
// reaches the component's onClick), and for a drag-to-select we synthesize a `.click()` on the release
// member instead. Keyboard activation (the app's shortcut handler calls `.click()`) is unaffected: those
// clicks have no preceding gesture, so they pass.
//
// TESTABILITY: resolveRelease is pure (decided from the start element, the release button, and the group)
// and unit-tested; the wiring (real pointer events + elementFromPoint) is verified on-device — jsdom has
// no layout engine, so elementFromPoint/getBoundingClientRect don't work there.
// ─────────────────────────────────────────────────────────────────────────

const HILITE = 'drag-target' // the live "this will be selected" class toggled during a drag (index.css)
const GROUP_SELECTOR = '[data-answer-grid],[data-select-group]'
const MENU_SELECTOR = '[data-select-group],[data-select-menu]' // the menu a press-drag trigger opens — a mode-style group OR the scrollable Settings panel (menu-only, NOT a drag-select group)

// Pure decision: given where the press STARTED, the <button> under the RELEASE point (or null), and the
// selection group the press began inside (or null), decide whether to suppress the native click on the
// start button and which button (if any) to activate instead.
//   • In a group: release on the SAME option → let the native click activate it (suppress nothing). Drag
//     to ANOTHER option → suppress the start's click + activate the release option. Release OFF the grid
//     → suppress (cancel), activate nothing.
//   • Not in a group: activate only if released on the SAME button; otherwise suppress (slide-off cancel).
export function resolveRelease(
  startEl: Element,
  releaseBtn: Element | null,
  group: Element | null,
): { suppressStart: boolean; activate: Element | null } {
  if (group) {
    const member = releaseBtn && group.contains(releaseBtn) ? releaseBtn : null
    if (member === startEl) return { suppressStart: false, activate: null }
    return { suppressStart: true, activate: member }
  }
  return { suppressStart: releaseBtn !== startEl, activate: null }
}

// Install the controller on `document`. Returns a cleanup that removes every listener. Call once (an App
// effect). Safe to call where `document` exists; a no-op-ish guard keeps it import-safe in non-DOM envs.
export function installPointerGestures(): () => void {
  if (typeof document === 'undefined') return () => {}

  let startEl: HTMLElement | null = null
  let group: Element | null = null // a direct group (an answer grid the press began inside)
  let triggerMode = false // the press began on a [data-select-trigger] — its menu is the group, found live
  let suppressEl: Element | null = null
  let hilited: Element | null = null
  let clearTimer: ReturnType<typeof setTimeout> | null = null
  let lastX = 0 // latest pointer position, kept current for the edge auto-scroll loop
  let lastY = 0
  let rafId: number | null = null

  const btnAt = (x: number, y: number): HTMLElement | null =>
    (document.elementFromPoint(x, y)?.closest('button') as HTMLElement | null) ?? null
  const memberAt = (g: Element | null, x: number, y: number): Element | null => {
    if (!g) return null
    const b = btnAt(x, y)
    return b && g.contains(b) ? b : null
  }
  // The menu a press-drag trigger opened. Several menus can be in the DOM at once — the Settings panel can
  // stay open while the mode selector is pressed (the settings click-outside ignores the mode selector). A
  // plain querySelector returns the FIRST in document order, which would wrongly pick the inline Settings
  // panel over a later-appended portal menu (the mode dropdown) — so take the LAST match: portal menus
  // append late, and when only one menu is open it's still that one.
  const triggerMenu = (): Element | null => {
    const all = document.querySelectorAll(MENU_SELECTOR)
    return all.length ? all[all.length - 1] : null
  }
  // The live selection group for the current gesture: a direct group, or — for a trigger gesture — the
  // menu it has since opened (it isn't in the DOM at pointerdown, so it's queried live).
  const liveGroup = (): Element | null => group ?? (triggerMode ? triggerMenu() : null)
  const setHilite = (el: Element | null) => {
    if (hilited === el) return
    if (hilited) hilited.classList.remove(HILITE)
    if (el) el.classList.add(HILITE)
    hilited = el
  }
  // EDGE AUTO-SCROLL (C2): while dragging a press-drag-trigger menu that's TALLER than its viewport (the
  // Settings panel), scroll it when the finger nears its top/bottom edge so options below the fold are
  // reachable in the one gesture; re-highlight the option now under the finger as it scrolls. No-op for
  // non-scrollable menus (the mode menu) and for non-trigger drags (answer grids). rAF-driven; verified
  // on-device (jsdom has no layout, and no real pointer drag fires there, so this never runs in tests).
  const EDGE = 56 // px from the menu's top/bottom edge where auto-scroll engages
  const MAX_SCROLL = 14 // px/frame at the very edge (ramps with proximity)
  const autoScroll = () => {
    rafId = null
    if (!startEl) return
    const g = liveGroup() as HTMLElement | null
    if (g && g.scrollHeight > g.clientHeight + 1) {
      const r = g.getBoundingClientRect()
      let dy = 0
      if (lastY < r.top + EDGE) dy = -MAX_SCROLL * Math.min(1, (r.top + EDGE - lastY) / EDGE)
      else if (lastY > r.bottom - EDGE)
        dy = MAX_SCROLL * Math.min(1, (lastY - (r.bottom - EDGE)) / EDGE)
      if (dy !== 0) {
        g.scrollTop += dy
        setHilite(memberAt(g, lastX, lastY)) // content moved under the finger
      }
    }
    rafId = requestAnimationFrame(autoScroll)
  }
  const startAutoScroll = () => {
    if (rafId == null) rafId = requestAnimationFrame(autoScroll)
  }
  const stopAutoScroll = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }
  const endGesture = () => {
    stopAutoScroll()
    setHilite(null)
    startEl = null
    group = null
    triggerMode = false
  }
  // Suppress the start button's native click. On touch that click fires the ORIGINAL button regardless
  // of drift AND is DELAYED/async after release (a long press makes the browser "commit" to the pressed
  // button, so it still fires that button's click even after you drag away). So the flag must OUTLAST the
  // click delay: it persists until the click consumes it (onClick) or the next gesture clears it
  // (onDown), with a generous fallback timer only for the no-click case (a mouse drag-off fires none) so
  // a much-later real click on the same button isn't swallowed. (A 0ms tick lost this race — held-then-
  // dragged taps and the mode-selector re-toggle leaked through. Q5 fix.)
  const armSuppress = (el: Element) => {
    suppressEl = el
    if (clearTimer) clearTimeout(clearTimer)
    clearTimer = setTimeout(() => {
      suppressEl = null
      clearTimer = null
    }, 1000)
  }

  const onDown = (e: PointerEvent) => {
    if (clearTimer) {
      clearTimeout(clearTimer)
      clearTimer = null
    }
    suppressEl = null
    if (e.pointerType === 'mouse' && e.button !== 0) {
      endGesture()
      return
    }
    const el = ((e.target as Element | null)?.closest?.('button') as HTMLElement | null) ?? null
    if (!el) {
      endGesture()
      return
    }
    startEl = el
    group = el.closest(GROUP_SELECTOR)
    triggerMode = !group && !!el.closest('[data-select-trigger]')
    lastX = e.clientX
    lastY = e.clientY
    if (group) setHilite(memberAt(group, e.clientX, e.clientY) ?? el)
    if (triggerMode) startAutoScroll() // edge auto-scroll only for press-drag trigger menus (the tall Settings panel); answer-grid/mode drags don't need it
  }
  const onMove = (e: PointerEvent) => {
    if (!startEl) return
    lastX = e.clientX
    lastY = e.clientY
    const g = liveGroup()
    if (!g) return
    setHilite(memberAt(g, e.clientX, e.clientY))
  }
  const onUp = (e: PointerEvent) => {
    if (!startEl) return
    const start = startEl
    const relBtn = btnAt(e.clientX, e.clientY)
    if (triggerMode) {
      // The trigger's own pointerdown already toggled its menu; ALWAYS suppress its click (else it
      // double-toggles). If the release landed on a menu option, activate it (pick that mode).
      const menu = triggerMenu()
      const member = menu && relBtn && menu.contains(relBtn) ? relBtn : null
      endGesture()
      armSuppress(start)
      if (member) (member as HTMLElement).click()
      return
    }
    const { suppressStart, activate } = resolveRelease(start, relBtn, group)
    endGesture()
    if (suppressStart) armSuppress(start)
    if (activate && activate !== start) (activate as HTMLElement).click()
  }
  const onCancel = () => endGesture()
  const onClick = (e: MouseEvent) => {
    if (
      suppressEl &&
      (e.target === suppressEl || (suppressEl as Element).contains(e.target as Node))
    ) {
      suppressEl = null
      if (clearTimer) {
        clearTimeout(clearTimer)
        clearTimer = null
      }
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }

  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('pointermove', onMove, true)
  document.addEventListener('pointerup', onUp, true)
  document.addEventListener('pointercancel', onCancel, true)
  document.addEventListener('click', onClick, true)
  return () => {
    if (clearTimer) clearTimeout(clearTimer)
    stopAutoScroll()
    setHilite(null)
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('pointerup', onUp, true)
    document.removeEventListener('pointercancel', onCancel, true)
    document.removeEventListener('click', onClick, true)
  }
}
