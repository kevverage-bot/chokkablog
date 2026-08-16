/**
 * Getting a usable URL out of whatever the author pasted.
 *
 * The Embed button on GERS Explorer and the CRA explorer copies a whole
 * `<iframe src="…" …></iframe>` snippet, because that is what you paste into
 * someone else's CMS. Here it has to become a bare URL: a post stores
 * `@[Chart](url)`, and the token's URL cannot contain spaces or quotes — paste
 * the snippet raw and the token silently fails to match, leaving the markup
 * sitting in the post as literal text.
 *
 * So both forms are accepted and reduced to the URL.
 */

/**
 * Decode HTML entities — chiefly the `&amp;` that separates query parameters
 * inside a pasted `src="…"` attribute. Left undecoded, the chart receives
 * `amp;year=2024` and silently ignores half its settings.
 *
 * Uses the DOM where there is one, and falls back to the ampersand forms that
 * actually matter for URLs, so this still works under test.
 */
function decodeEntities(s: string): string {
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea')
    ta.innerHTML = s
    return ta.value
  }
  return s.replace(/&amp;/gi, '&').replace(/&#0*38;/g, '&').replace(/&#x0*26;/gi, '&')
}

/** Pull the src out of a pasted iframe snippet, or return the trimmed input if
 *  it is already a bare URL. */
export function extractEmbedUrl(input: string): string {
  const trimmed = (input ?? '').trim()
  const m = trimmed.match(/src\s*=\s*["']([^"']+)["']/i)
  return decodeEntities((m ? m[1] : trimmed).trim())
}

/**
 * Whether a string can be used as an embed URL at all.
 *
 * Deliberately not an allowlist of hosts: the tools live on several domains and
 * more will be added, and the iframe sandbox — not this — is what limits what an
 * embedded page can do. This only rejects what cannot work: anything with
 * whitespace or a bracket in it (which would break the `@[…](…)` token), and any
 * scheme that is not plain http(s).
 */
export function isUsableEmbedUrl(url: string): boolean {
  const u = (url ?? '').trim()
  if (!u) return false
  if (/[\s()<>"']/.test(u)) return false
  return /^https?:\/\//i.test(u) || u.startsWith('/')
}
