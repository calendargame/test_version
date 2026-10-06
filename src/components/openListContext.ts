import { createContext } from 'react'

// components/openListContext — one fact a dropdown's option label can ask of the list drawing it
// (components/CustomSelect provides it; a file of its own because a component file may export only
// components).
//
// ★ IS THIS LABEL BEING DRAWN IN THE OPEN LIST (true), or in the trigger (false)? An option's label
// is one node drawn in both places, and the two are not the same box: the trigger stacks every
// label in one cell and sizes itself from them, while a list row is as wide as the panel says. A
// label that must hold a width open in the trigger (the preset lists' name cell — components/
// PresetSwitcher) has to be able to stand down in the list, where the same hold would WIDEN the
// panel past the trigger it is meant to match. It asks this.
export const InOpenListContext = createContext(false)
