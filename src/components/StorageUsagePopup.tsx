import Popup from './Popup.js'
import { MODAL_CARD_SHADOW, MODAL_PLAIN_CARD_CLASS } from './modalContract.js'
import { useStorageUsage } from '../store/storageUsage.js'
import type { UsageRow } from '../store/storageUsage.js'
import { usePresets } from '../store/presets.js'
import type { Preset } from '../store/presets.js'

// StorageUsagePopup — what is using the device's room for this app, and how to get some back.
//
// One popup, two ways in: the "Storage used: N%" line in ⚙ opens it, and it opens BY ITSELF once
// when the reading first passes the warning line (store/storageUsage decides when, and remembers
// that it did). It is the EARLY warning; components/StorageFullNotice is the late one, for a save
// the device has already refused, and takes precedence — this popup does not open by itself while
// that is happening, and if a refusal comes while this one is up the notice opens on top of it.
//
// Rendered once, at App level, and reads its own open flag — the same arrangement as the
// storage-full notice, and for the same reason: it can open from any screen. Through the shared
// Popup shell, so it is a normal stacked popup (Escape, Back, the dim, the focus trap and the
// status-bar strip are the shell's) — and app-wide: no screen or panel owns it, so a mode letter
// under it does nothing (components/overlayStack's isAppWidePopupOpen).

const MODE_NAME: Record<string, string> = {
  classic: 'Classic',
  flash: 'Flash',
  dedDay: 'Deduction (Day)',
  dedMonth: 'Deduction (Month)',
  dedYear: 'Deduction (Year)',
}

const count = (n: number): string => n.toLocaleString('en-US')

// A row's name, in the words the app uses for the thing. A preset is named only when there is more
// than one to tell apart; one that is no longer in the list is said to be so.
function rowLabel(row: UsageRow, presets: Preset[]): string {
  if (row.kind === 'lookup') return `Lookup history (${count(row.count)})`
  if (row.kind === 'other') return 'Everything else'
  const preset = presets.find((p) => p.id === row.presetId)
  const who = preset ? (presets.length > 1 ? `${preset.name}: ` : '') : 'A deleted preset: '
  if (row.kind === 'preset') return `${who}Bests, settings and saved defaults`
  return `${who}${MODE_NAME[row.silo] ?? row.silo} solve times (${count(row.count)})`
}

export default function StorageUsagePopup() {
  const open = useStorageUsage((s) => s.popupOpen)
  const close = useStorageUsage((s) => s.closePopup)
  const percent = useStorageUsage((s) => s.percent)
  const warning = useStorageUsage((s) => s.warning)
  const rows = useStorageUsage((s) => s.rows)
  const limit = useStorageUsage((s) => s.limit)
  const presets = usePresets((s) => s.presets)
  if (!open) return null
  // Each owner's share of the WHOLE allowance, so the shares add up to the headline. Anything under
  // one percent is gathered into the last line rather than listed as a column of "<1%".
  const share = (chars: number) => (chars / limit) * 100
  const listed = rows.filter((row) => row.kind !== 'other' && share(row.chars) >= 1)
  const rest = rows.filter((row) => !listed.includes(row)).reduce((sum, row) => sum + row.chars, 0)
  const shown = (chars: number) => (share(chars) < 1 ? '<1%' : `${Math.round(share(chars))}%`)
  return (
    <Popup id="storage-usage" onDismiss={close} appWide>
      <div
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-usage-title"
        style={MODAL_CARD_SHADOW}
        className={MODAL_PLAIN_CARD_CLASS}
      >
        <div id="storage-usage-title" className="text-sm font-semibold text-(--tx-50)">
          Storage used: {percent}%
        </div>
        <div className="text-xs text-(--tx-200-80) space-y-2">
          <p>
            {warning
              ? 'This device is running out of room for Calendar Game’s saved data. Once it is full, new answers can’t be saved until some room is made.'
              : 'Calendar Game keeps your stats, history and settings on this device, which gives it a fixed amount of room.'}
          </p>
          <p className="font-semibold text-(--tx-100-90)">What is using it</p>
          <ul className="space-y-1">
            {listed.map((row) => (
              <li
                key={`${row.kind}:${'presetId' in row ? row.presetId : ''}:${'silo' in row ? row.silo : ''}`}
                className="flex justify-between gap-3"
              >
                <span>{rowLabel(row, presets)}</span>
                <span className="tabular-nums whitespace-nowrap">{shown(row.chars)}</span>
              </li>
            ))}
            {rest > 0 && (
              <li className="flex justify-between gap-3">
                <span>{listed.length ? 'Everything else' : 'Everything saved'}</span>
                <span className="tabular-nums whitespace-nowrap">{shown(rest)}</span>
              </li>
            )}
          </ul>
          <p className="font-semibold text-(--tx-100-90)">To make room</p>
          <ul className="space-y-1 list-disc ps-4">
            <li>
              <b>Reset Stats</b>, on a mode&apos;s own screen, clears that mode&apos;s solve times
              in the preset you are on.
            </li>
            <li>
              <b>Clear History</b>, on the Lookup page, empties the Lookup history.
            </li>
            <li>
              Deleting a preset you no longer use removes everything it holds (⚙ → Global → Manage
              Presets).
            </li>
          </ul>
        </div>
      </div>
    </Popup>
  )
}
