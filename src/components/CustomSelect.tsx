import { useState, useRef, useEffect, useId, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useBackButton } from './useBackButton.js'

// CustomSelect — the app's custom dropdown, replacing the native <select>.
//
// Renders a trigger button; when open, the option list is PORTALED to #root so
// it escapes any clipping/overflow ancestor (e.g. the scrollable Settings
// popover) and floats over the page. Full listbox keyboard support
// (↑/↓/Home/End/Enter/Space/Esc/Tab) and a click-outside-to-close handler that
// correctly treats taps inside the portaled panel (and on native scrollbars)
// as "inside". While open, an ELEMENT scroll (the settings popover's inner
// wrapper) repositions the panel to its trigger, but a DOCUMENT scroll (guide
// mode's page pan — even a touch-drag that starts inside the open panel)
// CLOSES it with outside-tap semantics — see the reposition effect.
//
// ⚠ STABILITY NOTE: the portal positioning (measurePanel) and open-direction
// logic (handleToggle's space-based flip) were tuned against iOS Safari over
// several attempts and are QA-confirmed working. They look like ordinary
// geometry but are device-sensitive — ALWAYS re-verify on iPhone Safari
// (browser + PWA) after editing anything here.
//
// Props: value, onChange, options [{value,label}], className (trigger), ariaLabel,
// wrapperRef (forwarded to the wrapper so callers can treat it like the old <select>
// ref), showChevron, and pressDrag (press-drag-select, documented at the prop below).
// The panel opens DOWN unless it doesn't fit below AND does fit above — see handleToggle.
//
// Extracted from main.jsx in Stage C, Step 4d (verbatim; the only change is
// ReactDOM.createPortal → the directly-imported createPortal — same function).

export interface CustomSelectOption {
  value: string
  label: ReactNode
}
// Measured coordinates for the portaled panel, in its CONTAINING-BLOCK space
// (viewport rect + document scroll — see measurePanel): right edge always
// pinned, and exactly one of top (opening down) / bottom (flipping up).
interface PanelPos {
  right: number
  top?: number
  bottom?: number
}
export default function CustomSelect({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  wrapperRef,
  showChevron = false,
  pressDrag = false,
}: {
  value: string
  onChange: (value: string) => void
  options: CustomSelectOption[]
  className?: string
  ariaLabel?: string
  wrapperRef?: RefObject<HTMLDivElement | null>
  showChevron?: boolean
  // Q5: enable press-drag-select (the mode selector). The trigger toggles on POINTERDOWN (so a press can
  // drag straight into the just-opened menu and release on an option to pick it — handled by the global
  // pointer controller, lib/pointerGestures: the data-select-trigger marker starts the gesture and the
  // trigger's aria-controls={listboxId} pairs it with the portaled listbox, resolved live by id);
  // its click is suppressed there to avoid a double-toggle. A quick tap still toggles; keyboard (the Tab
  // shortcut's .click(), arrows, Enter) is unaffected — those clicks have no preceding pointer gesture.
  pressDrag?: boolean
}) {
  const [open, setOpen] = useState(false)
  // activeIdx tracks the keyboard-highlighted option (≠ selected value). -1 when nothing is
  // highlighted (e.g. mouse-only interaction). Reset to selected option's index on open so
  // ↑/↓ start from the current value, not the top.
  const [activeIdx, setActiveIdx] = useState(-1)
  const localRef = useRef<HTMLDivElement>(null)
  const ref = wrapperRef || localRef
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Stable unique id for the listbox + its option ids (aria-controls /
  // aria-activedescendant). useId is React's blessed generator — it replaces the old
  // useRef(`...${Math.random()}`).current, which both called an impure function and
  // read a ref during render. Used only as opaque aria/id strings (never queried via a
  // CSS selector), so useId's separator characters are harmless here.
  const listboxId = useId()
  const optionId = (i: number) => `${listboxId}-opt-${i}`
  const selectedIdx = options.findIndex((o) => o.value === value)
  // panelRef points at the PORTALED panel so the click-outside handler can
  // treat taps inside it as "inside" (the panel is no longer a DOM descendant
  // of the wrapper). openUpwardRef holds the flip decision as a ref (not state)
  // so measurePanel can read it synchronously within the same toggle that sets
  // it. panelPos holds the measured viewport coordinates for the portal.
  const panelRef = useRef<HTMLDivElement>(null)
  const openUpwardRef = useRef(false)
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null)
  // measurePanel reads the trigger's current viewport rect and writes panelPos:
  // right edge aligned to the trigger, 6px below it (top) when opening down, or
  // 6px above it (bottom) when flipping up. Called on open and on element-scroll/resize
  // so the portaled panel stays pinned to its trigger (a DOCUMENT scroll closes the
  // panel instead — see the reposition effect).
  // Plain function (no useCallback): it reads ref.current, which a manual dep array can't
  // track at ref.current granularity — useCallback here trips preserve-manual-memoization.
  // The React Compiler memoizes this automatically, so the reposition effect below can list
  // it as a dependency and the compiler keeps its identity stable (no listener re-subscribe).
  const measurePanel = () => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    // documentElement.clientWidth, NOT window.innerWidth: the CSS `right` offset resolves against
    // the containing block's right edge. In GUIDE mode the containing block is the initial
    // containing block, whose width EXCLUDES a classic document scrollbar — innerWidth includes
    // it, which painted every dropdown one scrollbar-width LEFT of its trigger on the How-to-Play
    // page (desktop Windows browsers; overlay-scrollbar platforms were unaffected). In app mode
    // the document can't scroll, so clientWidth === innerWidth — bit-identical to the
    // iOS-QA-confirmed values.
    // Round 10's sub-pixel sweep (--bar-h, GuidePage's panel heights) deliberately left this
    // read alone: same rounding class, but horizontal, worth ≤0.5px, and sitting on the
    // iOS-QA'd portal geometry path. Nothing here stacks against a hairline border.
    const right = document.documentElement.clientWidth - rect.right
    // The ± window.scrollY term converts the viewport rect into the portal's containing-block
    // space. In app mode #root is position:fixed at the viewport origin and the document can't
    // scroll — scrollY is always 0, so these are bit-identical to the iOS-QA-confirmed values.
    // In GUIDE mode (html[data-doc-scroll]) #root goes static and the DOCUMENT becomes the
    // scroller, so the absolute panel's containing block anchors at the document origin: without
    // the term, a page scrolled down S px painted the panel S px above the trigger, sliding off
    // the top of the screen (the Round-4 "mode menu opens upward + clipped in HtP" report).
    if (openUpwardRef.current)
      setPanelPos({ right, bottom: window.innerHeight - rect.top + 6 - window.scrollY })
    else setPanelPos({ right, top: rect.bottom + 6 + window.scrollY })
  }
  // Toggle handler measures available space the moment the dropdown opens.
  // Each option button is ~45px tall (py-3 + the text-[15px] menu text) plus a small panel
  // margin, so estimatedHeight is what the panel needs. DOWN is the default; the panel flips
  // UP only when it does NOT fit below and DOES fit above. visualViewport height is used (it
  // excludes Safari's bottom toolbar) so bottom-of-screen dropdowns don't open down into
  // toolbar-covered space. The 16px buffer keeps the panel off the bottom edge.
  // Measurement only happens on open (close is cheap).
  // ⚠ ROUND-8 FIX — the flip used to compare space-above against space-BELOW and never checked
  // that the panel actually fits above, so a long list with cramped room on both sides flipped
  // up into a space that couldn't hold it. Two corrections: the fit test is now spaceAbove vs
  // estimatedHeight, and the ceiling above is the FIXED BAR (--bar-h), not the screen edge — a
  // panel that clears the viewport but paints over the title/gear/mode selector is not
  // "fitting". The 6px mirrors measurePanel's gap. The old "spaceAbove > spaceBelow" term is
  // redundant under the new test (spaceAbove >= est > spaceBelow implies it) and is gone.
  // Downward geometry is untouched — it is the iOS-QA-confirmed path.
  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight
      const barH =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 0
      const spaceBelow = vh - rect.bottom - 16
      const spaceAbove = rect.top - barH - 6
      const estimatedHeight = options.length * 45 + 10
      openUpwardRef.current = spaceBelow < estimatedHeight && spaceAbove >= estimatedHeight
      measurePanel()
      // Do NOT pre-highlight the selected option on open. The grey "active" box is a
      // pointer/keyboard cursor, not an open-state indicator (the ✓ already marks the
      // selection). It appears only once the user hovers with a MOUSE or presses an arrow —
      // touch sends neither, so the box never shows on mobile. First ↑/↓ reveals it one step from the
      // selected option — Down just below the ✓, Up just above (see handleTriggerKeyDown).
      setActiveIdx(-1)
    }
    setOpen((v) => !v)
  }
  const closeAndFocus = () => {
    setOpen(false)
    setActiveIdx(-1)
    if (triggerRef.current) triggerRef.current.focus()
  }
  const selectAt = (i: number) => {
    if (i < 0 || i >= options.length) return
    onChange(options[i].value)
    closeAndFocus()
  }
  // Trigger keyboard handler — opens dropdown with ↑/↓/Enter/Space, then arrow nav happens
  // via the document-level handler below (set up only when open). Standard listbox pattern.
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (open) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeAndFocus()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        // First arrow (from the no-cursor -1 state) steps ONE option from the selected one — Down lands
        // just below the ✓, Up just above (owner's call 2026-06-06; previously the first arrow landed on
        // the selected option itself). Clamped at the ends; subsequent arrows keep moving.
        setActiveIdx((i) =>
          i < 0
            ? selectedIdx >= 0
              ? Math.min(options.length - 1, selectedIdx + 1)
              : 0
            : Math.min(options.length - 1, i + 1),
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) =>
          i < 0 ? (selectedIdx >= 0 ? Math.max(0, selectedIdx - 1) : 0) : Math.max(0, i - 1),
        )
      } else if (e.key === 'Home') {
        e.preventDefault()
        setActiveIdx(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setActiveIdx(options.length - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        selectAt(activeIdx >= 0 ? activeIdx : selectedIdx)
      } else if (e.key === ' ') {
        // Space is inert on the trigger (owner's call 2026-06-06) — see the closed-state note below.
        e.preventDefault()
      } else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        setActiveIdx(-1)
      }
      return
    }
    // Closed: NO key opens the dropdown from the trigger — only the global Tab shortcut, or a mouse
    // click, opens it (owner's call 2026-06-06). The Tab shortcut leaves the trigger focused, and the
    // owner doesn't want a focused-but-invisible trigger to spring open on Enter/Space/arrows. Swallow
    // Enter + Space so the browser's default button activation can't open it either; arrows fall through
    // to normal page scrolling. (Once open, ↑/↓ navigate, Enter selects, Esc/Tab close — branch above.)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
    }
  }
  // Android hardware Back closes an open dropdown instead of quitting the app (Q1). listboxId is a
  // stable per-instance useId, so multiple selects (mode + the settings dropdowns) register distinctly.
  useBackButton(open, () => setOpen(false), listboxId)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Element | null
      if (!ref.current || ref.current.contains(target)) return
      // The panel is portaled out of the wrapper, so a tap on an option is NOT
      // contained by ref.current — without this, the mousedown/touchstart handler
      // would close the dropdown before the option's click (selection) fired.
      if (panelRef.current && panelRef.current.contains(target)) return
      // Ignore mousedowns that landed in a scrollbar (Windows native scrollbars register
      // mousedown on the scrolling element itself). Without this, dragging the Settings
      // popover's scrollbar while a dropdown inside it is open closes the dropdown.
      const t = target
      if (t && t.nodeType === 1) {
        const r = t.getBoundingClientRect()
        const cx = 'clientX' in e ? e.clientX : null
        const cy = 'clientY' in e ? e.clientY : null
        if (t.scrollHeight > t.clientHeight && cx != null && cx > r.left + t.clientWidth) return
        if (t.scrollWidth > t.clientWidth && cy != null && cy > r.top + t.clientHeight) return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', h)
    document.addEventListener('touchstart', h)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('touchstart', h)
    }
  }, [open, ref])
  // While open, captured scrolls (capture phase, since scroll doesn't bubble) split by
  // TARGET: an ELEMENT scroll — the settings popover's inner scroll wrapper — re-measures
  // panelPos so the panel stays pinned to its trigger (the QA'd reposition), but a
  // DOCUMENT scroll — the guide page itself panning (html[data-doc-scroll]; the app-mode
  // document can't scroll) — CLOSES the panel with outside-tap semantics (activeIdx reset,
  // no trigger refocus) instead of chasing the trigger through momentum-scroll jitter.
  // A page scroll targets the Document node; documentElement is accepted too for WebKit
  // safety. Accepted consequence: a touch-drag that starts inside the open panel and pans
  // the page also closes it (native-iOS-like). Resize + visualViewport keep repositioning.
  useEffect(() => {
    if (!open) return
    const reposition = () => measurePanel()
    const onScroll = (e: Event) => {
      if (e.target === document || e.target === document.documentElement) {
        setOpen(false)
        setActiveIdx(-1)
        return
      }
      reposition()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', reposition)
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', reposition)
      vv.addEventListener('scroll', reposition)
    }
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', reposition)
      if (vv) {
        vv.removeEventListener('resize', reposition)
        vv.removeEventListener('scroll', reposition)
      }
    }
    // Depend on [open] alone. measurePanel closes over nothing render-specific (only the
    // stable ref/openUpwardRef/setPanelPos) and setOpen/setActiveIdx are React's stable
    // setters, so calling a "stale" copy is behavior-identical; listing them would just
    // re-subscribe the listeners every render. useCallback isn't an option here — it reads
    // ref.current, which trips preserve-manual-memoization. The React Compiler memoizes
    // measurePanel automatically, making this exactly correct at runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        onPointerDown={
          pressDrag
            ? (e) => {
                // Mirror the pointer controller's latch (Q5 rework): only the primary pointer's
                // left/first contact toggles — a second finger or a right-click must not flip the
                // menu mid-gesture.
                if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
                handleToggle()
              }
            : undefined
        }
        onKeyDown={handleTriggerKeyDown}
        data-select-trigger={pressDrag || undefined}
        className={className}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIdx >= 0 ? optionId(activeIdx) : undefined}
      >
        <span className="grid items-center">
          {options.map((o) => (
            <span
              key={o.value}
              className={`col-start-1 row-start-1 truncate text-left ${o.value === value ? '' : 'invisible'}`}
              aria-hidden={o.value !== value}
            >
              {o.label}
            </span>
          ))}
        </span>
      </button>
      {showChevron && (
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 flex flex-col items-center leading-none text-[7px] text-(--tx-w90)">
          <span>▲</span>
          <span>▼</span>
        </div>
      )}
      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            data-select-group={pressDrag || undefined}
            aria-label={ariaLabel}
            // p-1 + the options' rounded-xl keep the drag-ring CONCENTRIC: the 12px inner radius
            // plus the 4px inset sits inside the 16px outer radius, so the ring is never clipped
            // by overflow-hidden and all four corners of the first/last options stay round.
            className="rounded-2xl overflow-hidden p-1"
            style={{
              position: 'absolute',
              right: panelPos.right,
              ...(panelPos.top != null ? { top: panelPos.top } : { bottom: panelPos.bottom }),
              zIndex: 60,
              background: 'rgba(245,245,247,0.50)',
              WebkitBackdropFilter: 'blur(28px) saturate(120%)',
              backdropFilter: 'blur(28px) saturate(120%)',
              boxShadow: '0 6px 28px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.05)',
              width: 'max-content',
              maxWidth: '90vw',
            }}
          >
            {options.map((opt, i) => (
              <button
                id={optionId(i)}
                role="option"
                aria-selected={opt.value === value}
                key={opt.value}
                type="button"
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setActiveIdx(i)
                }}
                onClick={() => {
                  onChange(opt.value)
                  closeAndFocus()
                }}
                className={`w-full text-left rounded-xl pl-4 pr-4 py-3 text-[15px] flex items-center gap-2.5 ${i === activeIdx ? 'bg-black/10' : 'cs-option-press'}`}
                style={{ color: '#1a1a1a', whiteSpace: 'nowrap' }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    // The reserved check column stays a fixed 14px so row indents never shift,
                    // but the ✓ glyph scales WITH the row's text tier (1em, so ~15px today) —
                    // a hardcoded 14px check would read wrong the moment the tier moves.
                    width: '14px',
                    color: '#1a1a1a',
                    fontSize: '1em',
                  }}
                >
                  {opt.value === value ? '✓' : ''}
                </span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>,
          // #root is the app's mount node — always present once the app has rendered.
          document.getElementById('root')!,
        )}
    </div>
  )
}
