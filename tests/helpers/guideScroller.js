// THE GUIDE'S SCROLLER, as an ABSTRACTION — the one place in the suite that is allowed to know
// HOW How to Play scrolls.
//
// WHY THIS FILE EXISTS. The guide is the app's one long reading page and the only screen that does
// not scroll an inner box: <html data-doc-scroll> releases the app's three clamps and the DOCUMENT
// becomes the scroller (main.tsx, index.css). That is an implementation choice, and it is on its
// way out — the guide is being moved onto an inner overflow div like every other screen. A test
// written against `window.scrollY`, `document.scrollingElement` or the attribute would have to be
// rewritten on the far side of that move, which is exactly the situation rule 10 exists to
// prevent: a safety net you have to edit is not a safety net.
//
// So the net asks this file the questions instead — "where is the reader", "how much content is
// there", "how strong is each edge indicator", "what has the app written" — and this file answers
// them against whichever scroller is live. It RESOLVES, it does not assume:
//
//   • if the guide's content sits inside a real overflow scroller (any ancestor carrying the shared
//     SCROLLER_CORE_CLASS token, components/scrollRegion), that element is the scroller. Reads and
//     writes go through its scrollTop / scrollHeight / clientHeight, and a scroll event is
//     dispatched from it.
//   • otherwise the DOCUMENT is the scroller — today's shape. Reads and writes go through
//     window.scrollY / window.scrollTo / document.scrollingElement against window.innerHeight, and
//     a scroll event is dispatched from the window.
//
// Neither branch is named by any test. That is the whole point: the same behaviour test reads
// correctly on both sides of the move, and "the net passed unchanged" becomes the move's proof.
//
// ⚠ THE MODEL IS STATEFUL, AND DELIBERATELY SO. jsdom lays nothing out, so a real scroller has to
// be stood up by hand — and the suite's habit of stubbing one number per test is what let three
// scroll bugs ship (the round-10 resting-state shadow, both round-11 freezes). This models the
// thing rather than the read: the app's own writes MOVE it, a test's scroll MOVES it, and every
// read — the app's and the test's — comes back from the same number. That is what lets a test say
// "the reader is still at 640" instead of "window.scrollTo was called with (0, 640)", which is the
// difference between a behaviour pin and a mechanism pin.
//
// ⚠ AND A HIDDEN SCREEN REPORTS 0, which is the model's one piece of real platform fidelity and it
// is load-bearing. A display:none element has no layout: its scrollTop is 0, and a document whose
// clamps have just been re-applied has collapsed to a screenful and clamped its offset the same
// way. So the app CANNOT read the guide's reading position after React has hidden it — it has to
// take the number synchronously, inside the event that switches the mode. Modelling that here is
// what makes "the reader's place survives a detour" a discriminating test instead of a formality:
// an implementation that read the position one commit late would capture 0 and land the reader at
// the top, and the net would catch it.
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

// The guide's scroll box, or null when its content is not inside one — walking UP from the guide's
// own root, so it finds a scroller whether the app hands the whole screen stack one container or
// the guide gets its own.
const scrollerAncestor = (container) => {
  for (let node = guideRoot(container); node && node !== container; node = node.parentElement)
    if (typeof node.className === 'string' && node.className.includes(SCROLLER_TOKEN)) return node
  return null
}

// The app's main content container — the div carrying the inline paddingTop:var(--bar-h), the one
// style both scroll branches keep. Used only for the DOCUMENT branch, where it is the plain flow
// block whose height IS what the document scrolls, and therefore the element main.tsx hands to
// observeScrollExtent.
const appContainer = (container) =>
  [...container.querySelectorAll('div')].find((d) => d.style.paddingTop === 'var(--bar-h)') ?? null

// The viewport height every fixture measures against. jsdom's window.innerHeight default, pinned
// here so BOTH branches answer the "how much room is there" question with the same number — an
// element's clientHeight is 0 in jsdom, and leaving that asymmetry in place would make the same
// arithmetic give two answers across the move.
const VIEWPORT_H = 768

// ── The two backings ─────────────────────────────────────────────────────────────────────────
// Both expose the identical surface; nothing above this line branches on which one is live.

function documentBacking(visible, writes, startY) {
  let y = startY
  let content = 0
  const reported = () => (visible() ? y : 0)
  const savedScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')
  const savedInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')
  const savedScrollTo = window.scrollTo
  // ONE object, not a fresh literal per read: the app reads .scrollTop and .scrollHeight off it in
  // the same evaluate() pass and both must answer from the same state.
  const scrollingElement = {
    get scrollTop() {
      return reported()
    },
    get scrollHeight() {
      return content
    },
  }
  Object.defineProperty(window, 'scrollY', { configurable: true, get: reported })
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => VIEWPORT_H })
  Object.defineProperty(document, 'scrollingElement', {
    configurable: true,
    get: () => scrollingElement,
  })
  window.scrollTo = (a, b) => {
    const next = typeof a === 'object' && a !== null ? a.top : b
    y = next
    writes.push(next)
  }
  return {
    raw: () => y,
    pos: reported,
    setPos: (next) => {
      y = next
    },
    setContent: (next) => {
      content = next
    },
    scrollSource: () => window,
    restore: () => {
      // Put back the descriptor that was there, or remove the shadow outright when the property
      // was inherited rather than own — jsdom defines both of these on the Window instance today,
      // but restoring by descriptor is only correct if one existed.
      for (const [name, saved] of [
        ['scrollY', savedScrollY],
        ['innerHeight', savedInnerHeight],
      ])
        if (saved) Object.defineProperty(window, name, saved)
        else delete window[name]
      delete document.scrollingElement
      window.scrollTo = savedScrollTo
    },
  }
}

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
// while the guide is on screen (in a clamped mode the container the guide is hidden inside is the
// GAME screen's scroller, and resolving against it would model the wrong thing). Restore in an
// afterEach: the document branch stubs three window/document properties.
export function installGuideScroller(container) {
  let target = container
  const writes = []
  const visible = () => {
    const root = guideRoot(target)
    return !root || root.style.display !== 'none'
  }
  let backing = null
  let kind = null
  // ⚠ RESOLVED ONCE, IN GUIDE MODE, and re-used from then on. The fork can only be read while the
  // guide is on screen: in a clamped mode the container the hidden guide sits inside is the GAME
  // screens' scroll box, so a re-resolution there would answer "element" about the wrong element.
  // Which shape the app uses is a property of the build, not of the moment, so a remount carries
  // the kind across and re-resolves only the node it applies to.
  const attach = (carriedY, forcedKind) => {
    const el = scrollerAncestor(target)
    kind = forcedKind ?? (el ? 'element' : 'document')
    if (kind === 'document') {
      backing = documentBacking(visible, writes, carriedY)
      return
    }
    if (!el)
      throw new Error('installGuideScroller: the guide’s scroll box is no longer in the tree')
    backing = elementBacking(el, visible, writes, carriedY)
  }
  if (!visible())
    throw new Error('installGuideScroller: enter guide mode before installing the scroller model')
  attach(0)
  // The element main.tsx hands to observeScrollExtent — the thing whose height IS the scroll
  // extent. That is the scroll box itself once there is one, and the flow block the document
  // scrolls until then.
  const extentHost = () => scrollerAncestor(target) ?? appContainer(target)
  return {
    // Which shape resolved. The BEHAVIOUR net never reads this — it exists so the mechanism file
    // can state, in one place, what the guide currently scrolls.
    get kind() {
      return kind
    },
    // Where the reader is. 0 whenever the guide is off screen: a hidden screen has no layout.
    pos: () => backing.pos(),
    // Put the scroller at y and deliver the scroll event that follows — the reader dragging, a
    // status-bar tap, the platform placing it. Wrapped in act() so a listener that touches React
    // state (the clamped branch does) never warns.
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
    // computed style from — jsdom does not inherit custom properties down the tree.
    setSeat: (px) => {
      document.documentElement.style.setProperty('--seat-top', `${px}px`)
      scrollerAncestor(target)?.style.setProperty('--seat-top', `${px}px`)
    },
    // The two surfaces this screen writes its 0…1 --shade onto, as RAW strings: '' means never
    // written, which round 10 proved is a different state from a written 0 (an unwritten --shade
    // inherits @property's initial-value of 1 — a full-strength shadow).
    //   top    — the fixed bar's boundary shadow.
    //   bottom — the guide's bottom soft edge.
    // ⚠ THE ONE LINE THAT MAY NEED THE MOVE'S ATTENTION: the bottom surface is the fixed
    // .doc-fade-bottom strip today. If the guide's bottom edge becomes the container's own mask
    // instead, this resolution changes — and nothing in any test file does.
    topShade: () => target.querySelector('.htp-sticky-bar')?.style.getPropertyValue('--shade'),
    bottomShade: () => target.querySelector('.doc-fade-bottom')?.style.getPropertyValue('--shade'),
    // The element under extent observation, and the child whose growth IS the content growing.
    // Delivering a resize for either is how a test performs the change no scroll event reports.
    get extentHost() {
      return extentHost()
    },
    get contentEl() {
      return extentHost().firstElementChild
    },
    // The app remounted — carry the platform's scroller across, the way a reload hands the next
    // instance the offset the last one left. Re-resolves, so a fresh element is picked up.
    retarget: (next) => {
      const carried = backing.raw()
      backing.restore()
      target = next
      attach(carried, kind)
    },
    restore: () => backing.restore(),
  }
}
