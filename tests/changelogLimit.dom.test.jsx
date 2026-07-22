// @vitest-environment jsdom
//
// The changelog popup's latest-10 cap (round-6 Q6), proven against a LARGER data set than the
// real one: the module mock below swaps in 14 fake days while keeping the REAL visibleEntries
// (main.tsx renders visibleEntries(CHANGELOG), so the genuine slice runs over the fake array —
// nothing about the cap is reimplemented here). The repo keeps every entry forever; the popup
// stays a 10-day digest, newest first, scrolling within its own region. Everything else about
// the popup lives in changelog.dom.test.jsx against the real data.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, cleanup, fireEvent, act } from '@testing-library/react'

// 14 days, newest first: 2026-06-30 down to 2026-06-17, one line each.
const FAKE = vi.hoisted(() =>
  Array.from({ length: 14 }, (_, i) => ({
    date: `2026-06-${30 - i}`,
    items: [`change ${30 - i}`],
  })),
)
vi.mock('../src/changelog.js', async (importOriginal) => ({
  ...(await importOriginal()),
  CHANGELOG: FAKE,
}))

import { App } from '../src/main.jsx'
import { useSettings } from '../src/store/settings.js'

function mountApp() {
  // CustomSelect panels AND the settings modals portal into #root; provide one.
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  return render(<App />)
}

describe('the Changelog popup caps at the latest 10 days (Q6)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().resetSettings()
  })
  afterEach(() => {
    cleanup()
    document.getElementById('root')?.remove()
  })

  it('renders exactly the newest 10 of 14 entries, in order, and none of the older 4', () => {
    mountApp()
    act(() => fireEvent.click(screen.getByRole('button', { name: /^Settings/ })))
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Changelog' })))
    const dialog = screen.getByRole('dialog', { name: "What's new" })
    const lists = within(dialog).getAllByRole('list')
    expect(lists).toHaveLength(10)
    // Newest first, one line per fake day: 30 down to 21 shown…
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(FAKE.slice(0, 10).map((en) => en.items[0]))
    expect(within(dialog).getByText('6/30/2026')).toBeInTheDocument()
    expect(within(dialog).getByText('6/21/2026')).toBeInTheDocument()
    // …and the four older days stay repo-only (the module keeps them; the popup is a digest).
    expect(within(dialog).queryByText('6/20/2026')).toBeNull()
    expect(within(dialog).queryByText('change 20')).toBeNull()
  })
})
