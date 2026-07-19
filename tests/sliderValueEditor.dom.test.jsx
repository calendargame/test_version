// @vitest-environment jsdom
//
// SliderValueEditor — the tap-to-type value readout beside every timer slider (Round-2).
//
// Direct component tests: tap swaps the readout button for a focused text input; the permissive
// onChange regex; blur/Enter commit through the parse → convert → snap → clamp pipeline
// (lib/sliderValue, pure math locked in tests/sliderValue.test.js); Escape reverts WITHOUT
// committing and stops propagation (the popup/settings Escape contract); disabled follows the
// slider's lock; the widest-string width strut (invisible + nowrap, button nowrap, input
// min-w-0 + size 1). The finger-sized tap-target feel is on-device per the standing lesson.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import SliderValueEditor from '../src/components/SliderValueEditor.jsx'

// The three production configs (main.tsx call sites), minus the app-side onCommit wiring.
const flashProps = {
  value: 2000,
  min: 100,
  max: 5000,
  snap: 100,
  inputMode: 'decimal',
  label: 'Flash speed',
  format: (v) => (v / 1000).toFixed(1) + 's',
  toText: (v) => String(v / 1000),
  fromText: (n) => n * 1000,
  widest: '2m 55s', // the widest-possible strut string (all six production sites pass SLIDER_READOUT_WIDEST)
}
const roundProps = {
  value: 60,
  min: 10,
  max: 300,
  snap: 5,
  inputMode: 'numeric',
  label: 'Blitz round timer',
  format: (v) => v + 's',
  toText: String,
  widest: '2m 55s',
}
const perQProps = {
  value: 10,
  min: 1,
  max: 30,
  snap: 0.5,
  inputMode: 'decimal',
  label: 'Blitz question timer',
  format: (v) => v + 's',
  toText: String,
  widest: '2m 55s',
}

const readout = (label) => screen.getByRole('button', { name: `Edit ${label}` })
const field = (label) => screen.getByRole('textbox', { name: `${label} (seconds)` })
const openEditor = (label) => act(() => fireEvent.click(readout(label)))

afterEach(cleanup)

describe('SliderValueEditor', () => {
  it('renders the formatted readout; tapping swaps in a focused input seeded unit-less', () => {
    render(<SliderValueEditor {...flashProps} onCommit={vi.fn()} />)
    expect(readout('Flash speed')).toHaveTextContent('2.0s')
    openEditor('Flash speed')
    const input = field('Flash speed')
    expect(input.value).toBe('2') // toText seed: seconds, no unit
    expect(document.activeElement).toBe(input) // auto-focused so the keyboard is live at once
  })

  it('Flash: typing "2.5" and Enter commits 2500ms (×1000 conversion) and returns to display mode', () => {
    const onCommit = vi.fn()
    render(<SliderValueEditor {...flashProps} onCommit={onCommit} />)
    openEditor('Flash speed')
    act(() => fireEvent.change(field('Flash speed'), { target: { value: '2.5' } }))
    act(() => fireEvent.keyDown(field('Flash speed'), { key: 'Enter' }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(2500)
    expect(readout('Flash speed')).toBeInTheDocument() // input unmounted, readout is back
  })

  it('Flash: a comma-locale "2,5" commits 2500ms too, never a silent 10× value', () => {
    const onCommit = vi.fn()
    render(<SliderValueEditor {...flashProps} onCommit={onCommit} />)
    openEditor('Flash speed')
    act(() => fireEvent.change(field('Flash speed'), { target: { value: '2,5' } }))
    act(() => fireEvent.keyDown(field('Flash speed'), { key: 'Enter' }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(2500)
  })

  it('per-round: blur commits with the snap-to-5 grid', () => {
    const onCommit = vi.fn()
    render(<SliderValueEditor {...roundProps} onCommit={onCommit} />)
    openEditor('Blitz round timer')
    act(() => fireEvent.change(field('Blitz round timer'), { target: { value: '63' } }))
    act(() => fireEvent.blur(field('Blitz round timer')))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(65)
  })

  it('per-question: an over-max value clamps to 30 on commit', () => {
    const onCommit = vi.fn()
    render(<SliderValueEditor {...perQProps} onCommit={onCommit} />)
    openEditor('Blitz question timer')
    act(() => fireEvent.change(field('Blitz question timer'), { target: { value: '999' } }))
    act(() => fireEvent.keyDown(field('Blitz question timer'), { key: 'Enter' }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(30)
  })

  it('the onChange regex is permissive-but-numeric: decimal allows ONE dot or comma, numeric allows none', () => {
    render(<SliderValueEditor {...flashProps} onCommit={vi.fn()} />)
    openEditor('Flash speed')
    act(() => fireEvent.change(field('Flash speed'), { target: { value: '2.5' } }))
    expect(field('Flash speed').value).toBe('2.5')
    act(() => fireEvent.change(field('Flash speed'), { target: { value: '2.5.1' } }))
    expect(field('Flash speed').value).toBe('2.5') // second dot rejected outright
    act(() => fireEvent.change(field('Flash speed'), { target: { value: '2.5,1' } }))
    expect(field('Flash speed').value).toBe('2.5') // ONE separator total — dot+comma rejected too
    act(() => fireEvent.change(field('Flash speed'), { target: { value: 'abc' } }))
    expect(field('Flash speed').value).toBe('2.5') // letters rejected outright
    act(() => fireEvent.change(field('Flash speed'), { target: { value: '2,5' } }))
    expect(field('Flash speed').value).toBe('2,5') // comma-locale keypads only offer ','
    cleanup()
    render(<SliderValueEditor {...roundProps} onCommit={vi.fn()} />)
    openEditor('Blitz round timer')
    act(() => fireEvent.change(field('Blitz round timer'), { target: { value: '60.5' } }))
    expect(field('Blitz round timer').value).toBe('60') // numeric mode: no dot at all
  })

  it('an emptied field reverts on blur — no commit, the readout shows the untouched value', () => {
    const onCommit = vi.fn()
    render(<SliderValueEditor {...roundProps} onCommit={onCommit} />)
    openEditor('Blitz round timer')
    act(() => fireEvent.change(field('Blitz round timer'), { target: { value: '' } }))
    act(() => fireEvent.blur(field('Blitz round timer')))
    expect(onCommit).not.toHaveBeenCalled()
    expect(readout('Blitz round timer')).toHaveTextContent('60s')
  })

  it('Escape reverts without committing AND stops propagation (the popup dismiss contract)', () => {
    const onCommit = vi.fn()
    const docKeydown = vi.fn()
    document.addEventListener('keydown', docKeydown)
    try {
      render(<SliderValueEditor {...perQProps} onCommit={onCommit} />)
      openEditor('Blitz question timer')
      act(() => fireEvent.change(field('Blitz question timer'), { target: { value: '25' } }))
      act(() => fireEvent.keyDown(field('Blitz question timer'), { key: 'Escape' }))
      expect(onCommit).not.toHaveBeenCalled()
      expect(readout('Blitz question timer')).toHaveTextContent('10s') // reverted
      // The same native press must never reach the document-level settings/popup Escape
      // handlers — the input unmounts on revert, so their input-has-focus skip can't save it.
      expect(docKeydown).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', docKeydown)
    }
  })

  it('disabled mirrors the slider lock: the readout is inert, and a lock mid-edit drops the edit', () => {
    const onCommit = vi.fn()
    const { rerender } = render(<SliderValueEditor {...flashProps} disabled onCommit={onCommit} />)
    expect(readout('Flash speed')).toHaveAttribute('aria-disabled', 'true')
    act(() => fireEvent.click(readout('Flash speed')))
    expect(screen.queryByRole('textbox')).toBeNull() // tap does nothing while locked
    // Unlock, start editing, then lock mid-edit (a round starts) — the edit is dropped, never
    // late-committed against the frozen slider.
    rerender(<SliderValueEditor {...flashProps} onCommit={onCommit} />)
    openEditor('Flash speed')
    act(() => fireEvent.change(field('Flash speed'), { target: { value: '4' } }))
    rerender(<SliderValueEditor {...flashProps} disabled onCommit={onCommit} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('the width strut sizes both modes: invisible nowrap widest string, nowrap button, min-w-0 size-1 input', () => {
    render(<SliderValueEditor {...flashProps} onCommit={vi.fn()} />)
    // The strut is always mounted, invisible, hidden from the a11y tree, and single-line — it
    // holds the shared single-cell grid at the widest POSSIBLE readout width in the live font.
    const strut = screen.getByText('2m 55s')
    expect(strut).toHaveClass('invisible', 'whitespace-nowrap', 'tabular-nums', 'text-xs')
    expect(strut).toHaveAttribute('aria-hidden', 'true')
    expect(strut.parentElement).toHaveClass('inline-grid')
    // The display button overlays the strut's cell and must never wrap at the "2m 55s" space
    // (the Round-4 iOS bug: SF Pro outgrew the hand-measured width and the readout broke lines).
    expect(readout('Flash speed')).toHaveClass('col-start-1', 'row-start-1', 'whitespace-nowrap')
    openEditor('Flash speed')
    // The strut stays mounted through the swap; the input fills the cell but MUST collapse BOTH
    // of its intrinsic sizes — min-w-0 kills the min-content floor, and size={1} the ~20-char
    // default max-content (the auto grid column tracks max-content too, so without it the cell
    // blew open and squeezed the slider the moment editing started — the Round-5 staging bug
    // jsdom's layout-less DOM could not catch; the fixed layout itself stays an on-device check).
    expect(screen.getByText('2m 55s')).toBe(strut)
    expect(field('Flash speed')).toHaveClass('col-start-1', 'row-start-1', 'w-full', 'min-w-0')
    expect(field('Flash speed')).toHaveAttribute('size', '1')
  })
})
