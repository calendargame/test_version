// THE GUIDE'S SCROLLER, as an ABSTRACTION — the one place in the suite that is allowed to know
// HOW How to Play scrolls.
//
// WHY THIS FILE EXISTS, and what it has already done. It was written in round 13 group 2, one
// group ahead of the move it was built for: the guide used to be the only screen that did not
// scroll an inner box (<html data-doc-scroll> released the app's three clamps and the DOCUMENT
// scrolled it), and it was about to be moved onto App's #appScroll container like everything else.
// A behaviour test that read window.scrollY, document.scrollingElement or the attribute would have
// had to be rewritten on the far side, which is exactly the situation rule 10 exists to prevent: a
// safety net you have to edit is not a safety net. So the net asks this file the questions instead
// — "where is the reader", "how much content is there", "how strong is each edge indicator", "what
// has the app written" — and this file answered them against whichever scroller was live, by
// walking up from the guide's own root for the shared SCROLLER_CORE_CLASS token and falling back
// to the document when it found none.
//
// THE MOVE HAS LANDED, and tests/guideScroll.dom passed it unchanged — all 34 of it, which was the
// move's proof. The document fallback is therefore unreachable, and unreachable code modelling an
// architecture the app no longer has is precisely the kind of leftover this project does not keep.
// It is gone; what remains is the same abstraction with one backing. The BEHAVIOUR net still names
// no mechanism, and this file is still the only place that may.
//
// ⚠ THE MODEL IS STATEFUL, AND DELIBERATELY SO. jsdom lays nothing out, so a real scroller has to
// be stood up by hand — and the suite's habit of stubbing one number per test is what let three
// scroll bugs ship (the round-10 resting-state shadow, both round-11 freezes). This models the
// thing rather than the read: the app's own writes MOVE it, a test's scroll MOVES it, and every
// read — the app's and the test's — comes back from the same number. That is what lets a test say
// "the reader is still at 640" instead of "el.scrollTop was assigned 640", which is the difference
// between a behaviour pin and a mechanism pin.
//
// ⚠ AND A HIDDEN SCREEN REPORTS 0, which is the model's one piece of real platform fidelity and it
// is load-bearing. A display:none element has no layout, so its scrollTop is 0 — flatly, on every
// engine. So the app CANNOT read the guide's reading position after React has hidden it; it has to
// take the number synchronously, inside the event that switches the mode. Modelling that here is
// what makes "the reader's place survives a detour" a discriminating test instead of a formality:
// an implementation that read the position one commit late would capture 0 and land the reader at
// the top, and the net would catch it. (It was true of the document scroller too — a re-clamped
// document collapsed to a screenful and clamped its offset the same way — so this survived the
// move as an argument, not just as code.)
import { act } from '@testing-library/react'
import { SCROLLER_CORE_CLASS } from '../../src/components/scrollRegion.js'

// The guide's own root — the element that carries the display toggle (App keeps every screen
// mounted) and the panel-gap layout token.
const guideRoot = (container) =>
  [...container.querySelectorAll('div')].find((d) =>
    d.className.includes('space-y-(--guide-panel-gap)'),
  ) ?? null

// The overflow token every scroll region in the app must come through (tests/scrollRegionGuard
// fails the suite on a raw vertical-overflow literal anywhere else), so this is a resolution by
// shared contract rather than by position or by name.
const SCROLLER_TOKEN = SCROLLER_CORE_CLASS.split(' ')[0]

// The guide's scroll box — walking UP from the guide's own root, so it finds the scroller whether
// the app hands the whole screen stack one container (today) or the guide ever gets its own.
const scrollerAncestor = (container) => {
  for (let node = guideRoot(container); node && node !== container; node = node.parentElement)
    if (typeof node.className === 'string' && node.className.includes(SCROLLER_TOKEN)) return node
  return null
}

// The viewport height every fixture measures against — jsdom's window.innerHeight default, kept as
// the number the whole net's arithmetic is written in. An element's clientHeight is 0 in jsdom, so
// this is what the model reports for it.
const VIEWPORT_H = 768

// ── The backing ──────────────────────────────────────────────────────────────────────────────
function elementBacking(el, visible, writes, startY) {
  let y = startY
  let content = 0
  const reported = () => (visible() ? y : 0)
  const write = (next) => {
    y = next
    writes.push(next)
  }
  // scrollTop is a prototype accessor in jsdom, so an own accessor shadows it and `delete` puts the
  // element back exactly as it was. Both write paths are covered — a plain assignment and the
  // scrollTo() form — because which one a scroller is driven with is a detail the net must not
  // depend on.
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: reported, set: write })
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => content })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => VIEWPORT_H })
  el.scrollTo = (a, b) => write(typeof a === 'object' && a !== null ? a.top : b)
  return {
    raw: () => y,
    pos: reported,
    setPos: (next) => {
      y = next
    },
    setContent: (next) => {
      content = next
    },
    scrollSource: () => el,
    restore: () => {
      delete el.scrollTop
      delete el.scrollHeight
      delete el.clientHeight
      delete el.scrollTo
    },
  }
}

// ── The handle ───────────────────────────────────────────────────────────────────────────────
// Install AFTER the app is in guide mode — "the guide's scroller" is only a well-defined question
// while the guide is on screen, and the model's hidden-screen fidelity above needs a root to read
// the display of. Restore in an afterEach.
export function installGuideScroller(container) {
  let target = container
  const writes = []
  const visible = () => {
    const root = guideRoot(target)
    return !root || root.style.display !== 'none'
  }
  let backing = null
  const attach = (carriedY) => {
    const el = scrollerAncestor(target)
    if (!el)
      throw new Error('installGuideScroller: the guide’s scroll box is no longer in the tree')
    backing = elementBacking(el, visible, writes, carriedY)
  }
  if (!visible())
    throw new Error('installGuideScroller: enter guide mode before installing the scroller model')
  attach(0)
  return {
    // Where the reader is. 0 whenever the guide is off screen: a hidden screen has no layout.
    pos: () => backing.pos(),
    // Put the scroller at y and deliver the scroll event that follows — the reader dragging, the
    // platform placing it. Wrapped in act() so the listener's React state writes never warn.
    scrollTo: (y) => {
      backing.setPos(y)
      act(() => {
        backing.scrollSource().dispatchEvent(new Event('scroll'))
      })
    },
    // Move the scroller with NO event — the platform handing an offset back (history scroll
    // restoration), which is a placement rather than a scroll.
    setPos: (y) => backing.setPos(y),
    // How tall the guide's content is. The scroll range is this minus the viewport.
    setContent: (px) => backing.setContent(px),
    viewport: VIEWPORT_H,
    // Every position the APP has written to the scroller, in order. Used only where the claim is
    // "it wrote nothing" — a resume, a BFCache restore, a glide the coordinator declined — since
    // WHICH call moved it is mechanism and the resulting position is already covered by pos().
    writes,
    clearWrites: () => writes.splice(0, writes.length),
    // The reading line the accordion seats a tapped panel on (--bar-h + --guide-panel-gap). Set on
    // the root AND on the scroll box, so it resolves whichever element the coordinator reads its
    // computed style from — jsdom does not inherit custom properties down the tree. (Since the
    // move it reads the box, because scroll-padding-top — the ladder's second rung — is a
    // non-inherited property and is declared there.)
    setSeat: (px) => {
      document.documentElement.style.setProperty('--seat-top', `${px}px`)
      scrollerAncestor(target)?.style.setProperty('--seat-top', `${px}px`)
    },
    // The two surfaces this screen writes its 0…1 --shade onto, as RAW strings: '' means never
    // written, which round 10 proved is a different state from a written 0 (an unwritten --shade
    // inherits @property's initial-value of 1 — a full-strength shadow).
    //   top    — the fixed bar's boundary shadow.
    //   bottom — the guide's bottom soft edge.
    // The move KEPT the fixed .doc-fade-* strips rather than folding the guide onto the container's
    // own mask fades — deliberately, since the masks are boolean state classes and these two are
    // the app's only progressive edges — so this resolution is unchanged and stable.
    topShade: () => target.querySelector('.htp-sticky-bar')?.style.getPropertyValue('--shade'),
    bottomShade: () => target.querySelector('.doc-fade-bottom')?.style.getPropertyValue('--shade'),
    // The element under extent observation, and the child whose growth IS the content growing.
    // Delivering a resize for either is how a test performs the change no scroll event reports.
    get extentHost() {
      return scrollerAncestor(target)
    },
    get contentEl() {
      return scrollerAncestor(target).firstElementChild
    },
    // The app remounted — carry the platform's scroller across, the way a reload hands the next
    // instance the offset the last one left. Re-resolves against the new tree, which is safe in
    // ANY mode now that every screen scrolls the same box (it was not while the guide had its own
    // shape: re-resolving in a clamped mode would have answered about the game screens' scroller).
    retarget: (next) => {
      const carried = backing.raw()
      backing.restore()
      target = next
      attach(carried)
    },
    restore: () => backing.restore(),
  }
}
