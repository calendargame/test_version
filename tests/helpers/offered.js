// IS THIS CONTROL OFFERED TO THE USER? — the one place in the whole suite that knows how the app
// spells "you cannot press this".
//
// WHY THIS FILE EXISTS. The app has never had a disabled ATTRIBUTE on its dimmed controls (the one
// exception is Check for updates, deliberately, and tests/checkUpdates pins that on purpose). A
// control the app is not offering wears `opacity-60 pointer-events-none` — CSS only — so for years
// eight test files each carried their own `const isDisabled = (btn) =>
// btn.className.includes('pointer-events-none')`. That made a Tailwind class string the CONTRACT in
// eight places at once: change how the app withholds a control and eight files go red for a reason
// none of them names, and no single edit can ever move the app off it.
//
// So the question is asked once, here, in the user's terms. A caller says "is this offered", never
// "does this className contain a token", and the day the app withholds a control some other way
// (a real `disabled`, `inert`, aria-disabled) this file changes and nothing else does.
//
// ⚠ FOUR PLACES DELIBERATELY STILL NAME THE CLASS, and they are not oversights. This list is the
// whole of it: `grep -rn "pointer-events-none" tests/` returns exactly these six assertion sites
// and nothing else (the remaining hits are prose).
//   • tests/settings.dom's PIXEL GATES (~1015/1017) — exact-equality className pins that exist
//     precisely to freeze the string. Routing them through an abstraction would defeat the only
//     thing they do.
//   • tests/settings.dom (~904), in the KEYBOARD describe and NOT in the gates — the bare
//     <PillGroup> render, an exact-equality pin on a component mounted OUTSIDE the app to prove
//     an inherited lock never re-dims. It is about what the component EMITS, not about what the
//     panel offers, and it cannot reach this helper's subject at all.
//   • tests/aox.dom (~1180/1191) — asserts the FULL dim treatment (opacity-60 +
//     cursor-not-allowed + pointer-events-none) as a visual contract, which is a wider claim than
//     "not offered" and would be weakened by this helper.
//   • tests/deduction.dom (~720) — a transparent sizer element that must not intercept pointers.
//     That is a layout fact about an element the user never presses, not an offer.

// `el` is any rendered control. Returns whether a real press would reach it.
export const isOffered = (el) => !el.className.includes('pointer-events-none')
