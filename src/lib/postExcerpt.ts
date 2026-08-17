import { stripMarkdown } from './markdownText'

/**
 * The one-or-two-sentence excerpt shown for a post on the /blog hub — and,
 * from Phase 3, its `<meta name="description">`.
 *
 * A written `summary` always wins. The auto-excerpt is the fallback, so every
 * post has something readable without anyone having to write one for each; the
 * field exists for posts whose opening sentence reads badly out of context, or
 * that open on a caveat.
 */

/**
 * Sentence-aware truncation: keep whole sentences up to `max`, and never cut
 * mid-word even when the first sentence alone is too long.
 *
 * The 0.4 floor stops a very early full stop ("In 2019. …") from returning a
 * three-word excerpt — below that the sentence boundary is worse than a clean
 * word break with an ellipsis.
 */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const window = text.slice(0, max + 1)
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '))
  if (lastStop > max * 0.4) return text.slice(0, lastStop + 1)
  const lastSpace = window.lastIndexOf(' ')
  return `${text.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`
}

/** Up to `max` characters of readable prose from the start of the body. */
export function autoExcerpt(body: string, max = 220): string {
  const plain = stripMarkdown(body || '')
  if (!plain) return ''
  return clip(plain, max)
}

/**
 * The excerpt to show for a post: the written summary, else the automatic one.
 *
 * Takes the fields rather than a whole Post so the prerenderer can call it
 * without pulling the app's types in.
 */
export function postExcerpt(
  fields: { summary?: string | null; body?: string | null },
  max = 220,
): string {
  const written = (fields.summary ?? '').trim()
  if (written) return stripMarkdown(written)
  return autoExcerpt(fields.body ?? '', max)
}
