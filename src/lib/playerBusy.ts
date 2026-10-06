import { useEffect } from 'react'
import { opensKeyboard } from './textEntry.js'

// lib/playerBusy.ts — IS THE PLAYER IN THE MIDDLE OF SOMETHING RIGHT NOW?
//
// ★ THE ONE DEFINITION. The player is BUSY while any of these is true:
//   • A ROUND, A RUN OR A FLASH IS UNDER WAY on the page being shown — a Blitz round from Begin to
//     its end, a MoX run from Begin to its last solve (the wait for Continue between two One-by-One
//     dates included), a Flash from Begin until it is answered right or revealed. All of it, whatever
//     card is on screen and whether or not anything is being recorded: these have a clock of their
//     own, and a date that may be on screen for half a second.
//   • A SOLVE CLOCK IS RUNNING on a casual question (Classic, Deduction): the question is waiting,
//     nothing has judged it yet, and its first answer would record a solve time. The question need
//     not be the card on screen — browsing back to an older card leaves the waiting question's clock
//     running behind it.
//   • A TEXT BOX HAS THE KEYBOARD: a date being typed into Lookup, a year, a preset's name. Anything
//     that took the keyboard away would cut the entry short (and drop a phone's keyboard mid-word).
// The first two are worked out by engine/useGameEngine for its own question (every mode screen runs
// on that hook) and reported here; the third is read off the document. Nothing else decides it.
// So the player is free on an answered or revealed casual card, on an ended round or run, on a Flash
// / MoX / Blitz screen that has not been started, on Lookup or How to Play with no box in use, and in
// a casual mode whose times are not being recorded (timing hidden, or Save Stats off).
//
// WHO ASKS. What the app does BY ITSELF that would get between the player and what they are doing
// waits for a moment they are free: the popup that opens on its own when the device is nearly full
// (store/storageUsage). The narrower question — isRoundLive — is for what the player has stepped
// away to do by choice (opening ⚙): a casual question simply waits behind the menu, but a round, a
// run or a flash keeps running there.
type Report = 'live' | 'clock'
const reports = new Map<symbol, Report>()
const waiting = new Set<() => void>()

/** Is a Flash, a MoX run or a Blitz round under way on the page being shown? */
export const isRoundLive = (): boolean => [...reports.values()].includes('live')

export const isPlayerBusy = (): boolean => reports.size > 0 || opensKeyboard(document.activeElement)

// ★ "THE PLAYER HAS JUST BECOME FREE" IS SAID FROM THE NEXT TASK, AND CHECKED AGAIN THERE. The things
// that end one kind of busy are followed at once by the things that begin another, and "free" said
// in the gap between the two would open a popup over a question whose clock had just started, or
// take the keyboard off a box the player had just pressed. There are two such gaps, and they are
// not the same length:
//   • ONE SCREEN'S CLOCK STOPS AND THE NEXT SCREEN'S STARTS within one commit (a mode letter, a
//     preset switch, a Deduction type change). That gap closes inside the turn that opened it.
//   • FOCUS LEAVES ONE BOX ON ITS WAY TO THE NEXT. When a SCRIPT moves it, that too is one turn. But
//     when a PRESS moves it — a tap or a click from one text box into another — the browser tells
//     the page the first box has been left, lets everything the page queued in answer to that run,
//     and only then gives the second box focus. ⚠ Nothing that runs inside the turn can see across
//     that: a microtask is exactly what runs in the middle of it, with focus on nothing. "Free" was
//     said from one, and the waiting popup opened and took the keyboard off the box being entered.
// A task cannot start until the browser has finished handling the press that is moving focus, so by
// then both gaps have closed — and "free" is said only if it is still true.
let queued = false
const freed = (): void => {
  if (queued || waiting.size === 0) return
  queued = true
  setTimeout(() => {
    queued = false
    if (!isPlayerBusy()) for (const fn of [...waiting]) fn()
  })
}

/** Be called each time the player stops being busy. Returns the undo. */
export function onPlayerFree(fn: () => void): () => void {
  if (waiting.size === 0) document.addEventListener('focusout', freed)
  waiting.add(fn)
  return () => {
    waiting.delete(fn)
    if (waiting.size === 0) document.removeEventListener('focusout', freed)
  }
}

/** Report what one engine's question is to the player — engine/useGameEngine's, and only its. */
export function usePlayerBusy(report: Report | null): void {
  useEffect(() => {
    if (!report) return
    const id = Symbol()
    reports.set(id, report)
    return () => {
      reports.delete(id)
      freed()
    }
  }, [report])
}
