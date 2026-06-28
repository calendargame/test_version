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
//   • PRESS-DRAG MENU (Q5): a press on a [data-select-trigger] (e.g. the mode selector) whose own
//     pointerdown opens a menu — you can drag straight into the menu ([data-select-group]) that appears
//     and release on an option to pick it, in one gesture. Because the trigger toggles on pointerdown,
//     its click is ALWAYS suppressed (else it would double-toggle); a quick tap with no menu-open still
//     toggles via pointerdown.
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
const MENU_SELECTOR = '[data-select-group]' // the open menu a press-drag trigger opens

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

  const btnAt = (x: number, y: number): HTMLElement | null =>
    (document.elementFromPoint(x, y)?.closest('button') as HTMLElement | null) ?? null
  const memberAt = (g: Element | null, x: number, y: number): Element | null => {
    if (!g) return null
    const b = btnAt(x, y)
    return b && g.contains(b) ? b : null
  }
  // The live selection group for the current gesture: a direct group, or — for a trigger gesture — the
  // menu it has since opened (it isn't in the DOM at pointerdown, so it's queried live).
  const liveGroup = (): Element | null =>
    group ?? (triggerMode ? document.querySelector(MENU_SELECTOR) : null)
  const setHilite = (el: Element | null) => {
    if (hilited === el) return
    if (hilited) hilited.classList.remove(HILITE)
    if (el) el.classList.add(HILITE)
    hilited = el
  }
  const endGesture = () => {
    setHilite(null)
    startEl = null
    group = null
    triggerMode = false
  }
  // Suppress the imminent native click on `el`, then drop the flag next tick — if no click arrives (a
  // mouse drag-off fires none), a later real click on the same button mustn't be swallowed.
  const armSuppress = (el: Element) => {
    suppressEl = el
    clearTimer = setTimeout(() => {
      suppressEl = null
      clearTimer = null
    }, 0)
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
    if (group) setHilite(memberAt(group, e.clientX, e.clientY) ?? el)
  }
  const onMove = (e: PointerEvent) => {
    if (!startEl) return
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
      const menu = document.querySelector(MENU_SELECTOR)
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
    setHilite(null)
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('pointerup', onUp, true)
    document.removeEventListener('pointercancel', onCancel, true)
    document.removeEventListener('click', onClick, true)
  }
}
