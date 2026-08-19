import { describe, it, expect } from 'vitest'
import { markMatchesInDom, firstMark } from '../lib/markDom'
import { splitSnippet, plainSnippet, SNIPPET_OPEN, SNIPPET_CLOSE } from '../lib/archiveSnippet'
// `?raw` for the same reason publicWrite.test.ts uses it on the Edge Functions:
// the file is not something this project can import, and its text is what needs
// asserting on.
import ARCHIVE_SEARCH_SQL from '../../supabase/011_archive_search.sql?raw'

/**
 * Highlighting inside an archive post.
 *
 * These pages are the site's soft underbelly: 229 of its 235 URLs, carrying
 * thirteen years of Blogger markup that was sanitised once at import and is
 * injected verbatim. Marking search terms in them means touching HTML the app
 * did not render, so what this file mostly asserts is DAMAGE NOT DONE — that a
 * search for a word which also appears in a tag name, an attribute or a URL
 * marks the prose and leaves the markup exactly as it was.
 *
 * The images are hotlinked from blogger.googleusercontent.com and cannot be
 * re-fetched, so a corrupted `src` is permanent as far as a reader is concerned.
 */

const html = (s: string) => {
  const el = document.createElement('div')
  el.innerHTML = s
  return el
}

describe('markMatchesInDom', () => {
  it('marks a match in the prose', () => {
    const root = html('<p>Richard Murphy said something.</p>')
    expect(markMatchesInDom(root, ['murphy'])).toBe(1)
    expect(root.querySelector('mark')?.textContent).toBe('Murphy')
  })

  it('keeps the surrounding words intact', () => {
    const root = html('<p>Richard Murphy said something.</p>')
    markMatchesInDom(root, ['murphy'])
    expect(root.textContent).toBe('Richard Murphy said something.')
  })

  it('⚠ never touches a tag name, however well it matches', () => {
    // The naive implementation — a regex over innerHTML — rewrites this into
    // nonsense, and the reader loses the paragraph.
    const root = html('<p>A paragraph about the letter p.</p>')
    markMatchesInDom(root, ['p'])
    expect(root.querySelectorAll('p').length).toBe(1)
    expect(root.textContent).toBe('A paragraph about the letter p.')
  })

  it('⚠ never touches an attribute or a URL', () => {
    // Searching "http" or "img" is not far-fetched on a blog about data, and
    // these images cannot be re-fetched if the src is broken.
    const src = 'https://blogger.googleusercontent.com/img/chart.png'
    const root = html(`<p>See the <img src="${src}" alt="http chart"> above.</p>`)
    markMatchesInDom(root, ['http', 'img', 'png'])
    expect(root.querySelector('img')?.getAttribute('src')).toBe(src)
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('http chart')
  })

  it('marks across several elements without flattening them', () => {
    const root = html('<blockquote><p>Murphy</p></blockquote><table><tr><td>Murphy</td></tr></table>')
    expect(markMatchesInDom(root, ['murphy'])).toBe(2)
    expect(root.querySelector('blockquote p mark')).toBeTruthy()
    expect(root.querySelector('table td mark')).toBeTruthy()
  })

  it('is idempotent — a second pass does not nest marks', () => {
    const root = html('<p>Murphy and Murphy.</p>')
    markMatchesInDom(root, ['murphy'])
    markMatchesInDom(root, ['murphy'])
    expect(root.querySelectorAll('mark').length).toBe(2)
    expect(root.querySelector('mark mark')).toBeNull()
    expect(root.textContent).toBe('Murphy and Murphy.')
  })

  it('does nothing at all with no terms, no root, or no match', () => {
    const root = html('<p>Nothing to see.</p>')
    expect(markMatchesInDom(root, [])).toBe(0)
    expect(markMatchesInDom(null, ['x'])).toBe(0)
    expect(markMatchesInDom(root, ['absent'])).toBe(0)
    expect(root.innerHTML).toBe('<p>Nothing to see.</p>')
  })

  it('finds the first mark, for scrolling to', () => {
    const root = html('<p>one</p><p>Murphy here</p><p>Murphy again</p>')
    markMatchesInDom(root, ['murphy'])
    expect(firstMark(root)?.textContent).toBe('Murphy')
    expect(firstMark(html('<p>nothing</p>'))).toBeNull()
  })
})

describe('splitSnippet', () => {
  it('turns Postgres sentinels into marked runs', () => {
    expect(splitSnippet(`Richard ${SNIPPET_OPEN}Murphy${SNIPPET_CLOSE} said`)).toEqual([
      { text: 'Richard ', hit: false },
      { text: 'Murphy', hit: true },
      { text: ' said', hit: false },
    ])
  })

  it('handles several matches, and one at either end', () => {
    const s = `${SNIPPET_OPEN}a${SNIPPET_CLOSE} b ${SNIPPET_OPEN}c${SNIPPET_CLOSE}`
    expect(splitSnippet(s).filter((p) => p.hit).map((p) => p.text)).toEqual(['a', 'c'])
  })

  it('⚠ returns plain text rather than throwing on a broken marker', () => {
    // A post that genuinely contains the sentinel, or a row from before the
    // migration. A results page that throws is far worse than one unhighlighted.
    expect(plainSnippet(`half ${SNIPPET_OPEN}open`)).toBe('half open')
    expect(splitSnippet('no markers here')).toEqual([{ text: 'no markers here', hit: false }])
    expect(splitSnippet('')).toEqual([])
  })

  it('keeps the sentinels in step with the SQL that writes them', () => {
    // The function cannot import from here, so the pair is pinned by reading it.
    expect(ARCHIVE_SEARCH_SQL).toContain(`StartSel="${SNIPPET_OPEN}"`)
    expect(ARCHIVE_SEARCH_SQL).toContain(`StopSel="${SNIPPET_CLOSE}"`)
  })
})
