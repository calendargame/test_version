// UpdateDot — the light-blue "there is news" marker, the two-stage breadcrumb from the ⚙ gear and
// the ⚙ panel's Changelog link to the changelog popup after a new build lands. The build-stamp check
// lights both persisted flags, opening Settings retires the gear's, the first tap on the link
// retires the link's (main.tsx owns those flags; src/changelog.ts owns their storage keys).
//
// WHY A COMPONENT AND NOT ONE CSS CLASS. Round 6 shipped a single recipe — an absolutely positioned
// corner badge with fixed px insets — and reused it verbatim on both hosts. A corner badge is only
// safe on a host that reserves room for it inside its own padding: the ⚙ gear does (px-2.5 / py-2),
// a text link does not, so on the Changelog link the dot necessarily landed on top of the word. The
// precondition was real but unwritten, so nothing could catch the reuse. Here the call site NAMES
// the form it can host — which is also why no string-scanning guard test is needed: there is no way
// to ask for the corner badge without saying "corner".
//
// PURELY DECORATIVE. The marker is aria-hidden, so every host has to publish the same fact in its
// own accessible name — the ⚙ gear folds "update" into its aria-label (which it needs regardless:
// its visible content is a bare glyph), the Changelog link carries a visually-hidden text node.
// Both are pinned in tests/changelog.dom.test.jsx.
//
// The paint — em sizing, the theme colours, and the corner form's per-axis precondition — lives in
// src/index.css under [data-update-dot].

export type UpdateDotPlacement =
  // Absolutely positioned in the host's top-right inside corner. Icon buttons only: the host must
  // be a containing block (a literal `relative`) AND clear the inset + the dot in its own padding.
  | 'corner'
  // In-flow marker trailing the host's text, for text links. Its slot exists whether or not the
  // marker is lit, so lighting up moves nothing.
  | 'inline'

export function UpdateDot({ placement, lit }: { placement: UpdateDotPlacement; lit: boolean }) {
  // data-lit rather than conditional rendering: the inline slot has to occupy space in BOTH states
  // (see above), so one attribute drives the paint (index.css) and the tests alike.
  return <span aria-hidden="true" data-update-dot={placement} data-lit={lit ? 'true' : 'false'} />
}
