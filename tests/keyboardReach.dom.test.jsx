// @vitest-environment jsdom
//
// THE KEYBOARD'S REACH (components/overlayStack) — the one rule for where the keyboard may be while
// something covers the page: a popup, the ⚙ menu, an open dropdown list. Unit-tested here against
// a fabricated layer, so every branch is provable without standing up the app:
//   • the layer TAKES the keyboard as it opens, off whatever on the page had it;
//   • focus that lands outside it COMES BACK;
//   • Tab and Shift+Tab WALK its controls and WRAP at the ends (it used to be a popup's own
//     handler, components/modalContract's trapModalTab; the ⚙ menu had none, and Shift+Tab walked
//     out of it into the page);
//   • closing it GIVES THE KEYBOARD BACK.
// The same rule through the real app — Enter and Space behind the ⚙ menu, the lists, the popups —
// is in tests/keysUnderMenu.dom and tests/popupStack.dom.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { useRef } from 'react'
import { isPageCovered, useLayer } from '../src/components/overlayStack.js'

// A layer shaped like a popup: an outer box the keyboard may be inside, and a card in it that
// holds the keyboard. `walks: false` is a dropdown list's shape — Tab is its own key.
function Layer({ id = 'layer', html, walks = true }) {
  const box = useRef(null)
  const card = useRef(null)
  useLayer(true, () => {}, id, undefined, {
    parts: () => [box.current],
    hold: () => card.current,
    walk: () => (walks ? box.current : null),
  })
  return (
    <div ref={box} data-layer={id}>
      <div ref={card} role="dialog" tabIndex={-1} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

// The page behind: one button, which has the keyboard before anything opens.
function mount(html, { walks = true, open = true } = {}) {
  const view = render(
    <>
      <button data-page>Page</button>
      {open && <Layer html={html} walks={walks} />}
    </>,
  )
  const page = document.querySelector('[data-page]')
  const card = document.querySelector('[role="dialog"]')
  const rerender = (isOpen) =>
    view.rerender(
      <>
        <button data-page>Page</button>
        {isOpen && <Layer html={html} walks={walks} />}
      </>,
    )
  return { page, card, rerender }
}

// A real Tab key press, as the browser sends it: on the focused element, bubbling to the window.
// Returns whether the rule took the step itself (preventDefault) rather than leaving it to the
// browser — jsdom moves no focus for a Tab, so that is the only way to tell the two apart.
function tab({ shiftKey = false, ...init } = {}) {
  let delivered = true
  act(() => {
    delivered = fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Tab',
      shiftKey,
      ...init,
    })
  })
  return { taken: !delivered }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('a layer that covers the page takes the keyboard, and gives it back', () => {
  it('covers the page for as long as it is open', () => {
    const { rerender } = mount('<button>A</button>', { open: false })
    expect(isPageCovered()).toBe(false)
    rerender(true)
    expect(isPageCovered()).toBe(true)
    rerender(false)
    expect(isPageCovered()).toBe(false)
  })

  it('opening takes the keyboard off the page, and closing hands it back to what had it', () => {
    const { page, rerender } = mount('<button>A</button>', { open: false })
    page.focus()
    rerender(true)
    expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'))
    rerender(false)
    expect(document.activeElement).toBe(page)
  })

  it('opening with the keyboard nowhere puts it on the layer too', () => {
    const { rerender } = mount('<button>A</button>', { open: false })
    expect(document.activeElement).toBe(document.body)
    rerender(true)
    expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'))
  })

  it('focus that lands on the page behind comes straight back', () => {
    const { page, card } = mount('<button>A</button>')
    act(() => page.focus())
    expect(document.activeElement).toBe(card)
  })

  it('closing does not pull the keyboard back from somewhere it has already gone', () => {
    const { page, rerender } = mount('<button>A</button>', { open: false })
    page.focus()
    rerender(true)
    const elsewhere = document.createElement('input')
    document.body.appendChild(elsewhere)
    // The stack is asked as the focus arrives, so a closed layer no longer holds it: model a press
    // that closed the layer and then focused what it pressed.
    rerender(false)
    elsewhere.focus()
    expect(document.activeElement).toBe(elsewhere)
  })
})

describe('Tab and Shift+Tab walk the layer`s own controls and wrap', () => {
  it('ignores every key that is not Tab, and Tab with Ctrl / Alt / ⌘', () => {
    mount('<button>Only</button>')
    const only = document.querySelector('[role="dialog"] button')
    only.focus()
    for (const init of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }])
      expect(tab(init).taken).toBe(false)
    let delivered
    act(() => {
      delivered = fireEvent.keyDown(only, { key: 'Enter' })
    })
    expect(delivered).toBe(true)
  })

  it('NO controls: the Tab is consumed and the keyboard stays on what the layer holds', () => {
    const { card } = mount('<p>just some prose, nothing to focus</p>')
    expect(tab().taken).toBe(true)
    expect(document.activeElement).toBe(card)
    expect(tab({ shiftKey: true }).taken).toBe(true)
    expect(document.activeElement).toBe(card)
  })

  it('ONE control: Tab off it wraps in place', () => {
    mount('<button>Only</button>')
    const only = document.querySelector('[role="dialog"] button')
    only.focus()
    expect(tab().taken).toBe(true)
    expect(document.activeElement).toBe(only)
  })

  it('from the card, the first Tab goes to the first control and the first Shift+Tab to the last', () => {
    const { card } = mount('<button>A</button><button>B</button><button>C</button>')
    const [a, , c] = card.querySelectorAll('button')
    expect(document.activeElement).toBe(card)
    // Forward from the card the browser's own step is the right one — the first control is the
    // next thing after it — so the rule leaves it alone…
    expect(tab().taken).toBe(false)
    // …and backward there is nothing before it inside the layer: the rule wraps to the last.
    expect(tab({ shiftKey: true }).taken).toBe(true)
    expect(document.activeElement).toBe(c)
    expect(tab().taken).toBe(true)
    expect(document.activeElement).toBe(a)
  })

  it('Tab off the last wraps to the first, Shift+Tab off the first wraps to the last', () => {
    const { card } = mount('<button>A</button><button>B</button>')
    const [a, b] = card.querySelectorAll('button')
    b.focus()
    expect(tab().taken).toBe(true)
    expect(document.activeElement).toBe(a)
    expect(tab({ shiftKey: true }).taken).toBe(true)
    expect(document.activeElement).toBe(b)
  })

  it('a Tab from the MIDDLE is left to the browser (only the ends wrap)', () => {
    const { card } = mount('<button>A</button><button>B</button><button>C</button>')
    const b = card.querySelectorAll('button')[1]
    b.focus()
    expect(tab().taken).toBe(false)
    expect(tab({ shiftKey: true }).taken).toBe(false)
    expect(document.activeElement).toBe(b)
  })

  it('an element made a tab stop by hand is a control too — it can be an END of the walk', () => {
    // The preset manager's reorder grip is a div with tabIndex 0. Left out of the walk, a card
    // ending on one would let Tab step off it and out of the layer.
    const { card } = mount('<button>A</button><div role="button" tabindex="0">grip</div>')
    card.querySelector('[role="button"]').focus()
    expect(tab().taken).toBe(true)
    expect(document.activeElement).toBe(card.querySelector('button'))
  })

  it('what Tab cannot land on is not an end: tabindex −1, disabled, hidden', () => {
    // A setting's options share ONE tab stop (the others are tabindex −1), and a row can be
    // hidden. Counted as stops, the real last control would not be seen as the last, and Tab off it
    // would walk out. The old popup trap counted every <button>.
    const { card } = mount(
      '<button>A</button><button>B</button>' +
        '<button tabindex="-1">roving</button><button disabled>off</button>' +
        '<span style="display:none"><button>hidden</button></span>',
    )
    const [a, b] = card.querySelectorAll('button')
    b.focus()
    expect(tab().taken).toBe(true)
    expect(document.activeElement).toBe(a)
    expect(tab({ shiftKey: true }).taken).toBe(true)
    expect(document.activeElement).toBe(b)
  })

  it('a control marked unavailable (aria-disabled) is still a stop', () => {
    const { card } = mount('<button>A</button><button aria-disabled="true">B</button>')
    const [a, b] = card.querySelectorAll('button')
    a.focus()
    expect(tab().taken).toBe(false) // B is further on: the browser steps to it
    b.focus()
    expect(tab().taken).toBe(true)
    expect(document.activeElement).toBe(a)
  })

  it('a layer whose Tab is its own key (an open list) is not walked', () => {
    mount('<button>A</button><button>B</button>', { walks: false })
    document.querySelectorAll('[role="dialog"] button')[1].focus()
    expect(tab().taken).toBe(false)
  })
})
