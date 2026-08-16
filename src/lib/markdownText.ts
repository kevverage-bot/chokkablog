/**
 * Markdown → plain text, for the subset src/components/RichText.tsx renders.
 *
 * One implementation, used by everything that needs prose without markup: hub
 * excerpts, meta descriptions, tab titles, and — from Phase 5 — search snippets.
 * GERS Explorer grew two near-identical copies of this that drifted apart; the
 * whole point of it living alone in a file is that there is nowhere for a second
 * one to hide.
 *
 * Order matters. Footnotes come out before emphasis, so the contents of a
 * `^[…]` reveal note don't survive as stray prose in the middle of a sentence.
 */
export function stripMarkdown(md: string): string {
  return String(md ?? '')
    // Reveal notes ^[ … ] and traditional markers [^1], with their definitions.
    .replace(/\^\[(?:[^[\]]|\[[^\]]*\])*\]/g, '')
    .replace(/\[\^[^\]]+\]:[^\n]*/g, '')
    .replace(/\[\^[^\]]+\]/g, '')
    // An embed alone on a line is a chart, not prose — drop it whole, or a meta
    // description ends up containing the word "Chart" and a URL. One written
    // mid-sentence renders as a link, so it keeps its text like any other link.
    .replace(/^[ \t]*@\[[^\]]*\]\([^)]*\)[ \t]*$/gm, '')
    .replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1')
    // An image contributes its CAPTION, not its alt: the alt describes the
    // picture to someone who cannot see it, which reads oddly dropped into the
    // middle of an excerpt. `caption|alt` keeps the part before the pipe; plain
    // `![alt](url)` has no caption, so it contributes nothing.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, text: string) => {
      const pipe = String(text).indexOf('|')
      return pipe < 0 ? ' ' : ` ${String(text).slice(0, pipe)} `
    })
    // Ordinary links → their text.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // The one inline tag we allow (underline).
    .replace(/<\/?[a-z][^>]*>/gi, '')
    // Block markers at line starts: headings, quotes, list bullets.
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '')
    // Emphasis and code.
    .replace(/\*\*|__/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
