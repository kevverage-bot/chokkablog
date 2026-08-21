import { describe, it, expect, vi } from 'vitest'
import { fitToContent, type ScrollView } from '../lib/autoGrow'

/**
 * The editor's textarea, and the page that used to jump.
 *
 * ⚠ WHAT THIS SIMULATES, because jsdom will not do it: a real browser CLAMPS the
 * window's scroll position when the document gets shorter. Collapsing the
 * textarea to measure it removes thousands of pixels from a long draft, so the
 * scroll is clamped to near zero — and restoring the height does not restore the
 * scroll. The page jumps to the top on every keystroke, but only once a post is
 * long enough to have somewhere to fall from.
 *
 * The clamp is simulated by a `scrollHeight` getter with a side effect, which is
 * exactly when it happens for real: the read comes immediately after the
 * collapse, while the document is short.
 */

/** A textarea stand-in whose measurement clamps the page, as a browser's does. */
function collapsingTextarea(contentHeight: number, view: ScrollView, clampTo = 0) {
  return {
    style: { height: '' },
    get scrollHeight() {
      // Read while the box is collapsed — which is the moment the document is
      // short and the browser moves the scroll.
      if (this.style.height === 'auto') view.scrollY = clampTo
      return contentHeight
    },
  }
}

function fakeView(scrollY: number): ScrollView & { scrollTo: ReturnType<typeof vi.fn> } {
  const view = {
    scrollX: 0,
    scrollY,
    scrollTo: vi.fn((x: number, y: number) => { view.scrollX = x; view.scrollY = y }),
  }
  return view
}

describe('fitToContent', () => {
  it('sizes the box to its content', () => {
    const view = fakeView(0)
    const ta = collapsingTextarea(4000, view)
    fitToContent(ta, 120, view)
    expect(ta.style.height).toBe('4000px')
  })

  it('never goes below the floor it was given', () => {
    const view = fakeView(0)
    const ta = collapsingTextarea(20, view)
    fitToContent(ta, 120, view)
    expect(ta.style.height).toBe('120px')
  })

  it('⚠ puts the page back where it was after measuring', () => {
    // The bug: editing a long draft scrolled the page to the top on every
    // keystroke, because measuring collapsed the document and the browser
    // clamped the scroll.
    const view = fakeView(3200)
    const ta = collapsingTextarea(6000, view)

    fitToContent(ta, 120, view)

    expect(view.scrollY).toBe(3200)
    expect(view.scrollTo).toHaveBeenCalledWith(0, 3200)
  })

  it('restores the horizontal position it found, not zero', () => {
    const view = fakeView(3200)
    view.scrollX = 40
    const ta = collapsingTextarea(6000, view)
    fitToContent(ta, 120, view)
    expect(view.scrollTo).toHaveBeenCalledWith(40, 3200)
  })

  it('does not touch the scroll when nothing moved', () => {
    // The short-draft case, and the common one: no clamp, so no scroll call on
    // every character typed.
    const view = fakeView(0)
    const ta = collapsingTextarea(300, view, 0)
    fitToContent(ta, 120, view)
    expect(view.scrollTo).not.toHaveBeenCalled()
  })

  it('measures with the box collapsed, or the height only ever grows', () => {
    // Reading scrollHeight without collapsing first reports the height already
    // set, so a shortened post would keep the box it had when it was long.
    const view = fakeView(0)
    let heightWhenMeasured: string | null = null
    const ta = {
      style: { height: '2000px' },
      get scrollHeight() { heightWhenMeasured = this.style.height; return 300 },
    }
    fitToContent(ta, 120, view)
    expect(heightWhenMeasured).toBe('auto')
    expect(ta.style.height).toBe('300px')
  })
})
