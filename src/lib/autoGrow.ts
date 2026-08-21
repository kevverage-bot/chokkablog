/**
 * Growing the editor's textarea to fit what is in it.
 *
 * ⚠ THE PART THAT IS NOT OBVIOUS: MEASURING COSTS A SCROLL POSITION.
 *
 * To find out how tall the content wants to be, the box has to be collapsed —
 * `height: auto` — so that `scrollHeight` reports the content rather than the
 * height already set. On a long draft that momentarily removes thousands of
 * pixels from the document, and the browser responds by CLAMPING the window's
 * scroll position to the new, much smaller maximum. Putting the height back does
 * not put the scroll back, so the page ends up at the top.
 *
 * The symptom is a page that jumps on every keystroke, but only once a post gets
 * long — on a short one there is no scroll to clamp, which is what makes it look
 * like a mysterious threshold rather than a measurement bug.
 *
 * Called from a layout effect, so the collapse happens before the browser
 * paints and is never seen. Only the lost scroll position survives it, and that
 * is what this puts back.
 *
 * Split out of MarkdownField so it can be tested at all: jsdom does no layout,
 * so the clamp has to be simulated, and that needs a seam.
 */

/** The bit of `window` this needs. A parameter so a test can supply one that
 *  clamps, which jsdom will not do on its own. */
export interface ScrollView {
  scrollX: number
  scrollY: number
  scrollTo(x: number, y: number): void
}

export function fitToContent(
  ta: { style: { height: string }; scrollHeight: number },
  minHeight: number,
  view: ScrollView,
): void {
  const top = view.scrollY

  ta.style.height = 'auto'
  ta.style.height = `${Math.max(ta.scrollHeight, minHeight)}px`

  // Guarded, so an editor working at the top of the page is not handed a
  // pointless scroll call on every character typed.
  if (view.scrollY !== top) view.scrollTo(view.scrollX, top)
}
