import { describe, it, expect } from 'vitest'
import {
  PAGE_PATHS, SEARCH_PARAM, parseRoute, pathForPage, pathForPost, pathForSearch, searchTermFromUrl,
} from '../lib/routes'
import APP from '../App.tsx?raw'
import NAVBAR from '../components/NavBar.tsx?raw'
import PRERENDER from '../../scripts/prerender.mjs?raw'
import vercel from '../../vercel.json'

/**
 * Adding a section to this site means four separate edits, in four files, and
 * three of the four failures are silent: a PageId with no case in App renders an
 * empty <main>; a path with no prerenderer route exists for readers and not for
 * search; a page nothing links to is a page nobody finds. lib/routes.ts states
 * the rule at the top of the file — this is what enforces it.
 */

describe('/search is wired up in all four places', () => {
  it('has a path', () => {
    expect(PAGE_PATHS.search).toBe('/search')
  })

  it('resolves to its own page, not to the 404 or the home page', () => {
    expect(parseRoute('/search')).toMatchObject({ page: 'search', notFound: false })
    // Trailing slashes are equivalent everywhere else, so they are here too.
    expect(parseRoute('/search/')).toMatchObject({ page: 'search', notFound: false })
  })

  it('has a case in App’s renderer', () => {
    expect(APP).toMatch(/case 'search':/)
    expect(APP).toMatch(/<SearchPage/)
  })

  it('is linked from the nav, so it can be found without knowing the URL', () => {
    expect(NAVBAR).toMatch(/id: 'search'/)
  })

  it('is prerendered — and noindex, because a results page is one page per query', () => {
    // Prerendered for its title, description and a non-empty #root; noindex
    // because /search?q=… is an unbounded set of thin URLs whose content is a
    // rearrangement of pages that are already indexed on their own. The
    // prerenderer builds the sitemap from the indexable pages only, so this
    // keeps it out of there too.
    expect(PRERENDER).toMatch(/path: '\/search',[\s\S]{0,200}noindex: true/)
  })

  it('does not collide with a redirect, which would shadow the page', () => {
    const sources = vercel.redirects.map((r) => r.source)
    expect(sources).not.toContain('/search')
  })

  it('is caught by the SPA rewrite, so a cold load works before the next build', () => {
    const re = new RegExp(`^${vercel.rewrites[0].source}$`)
    expect(re.test('/search')).toBe(true)
  })
})

describe('the search term in the URL', () => {
  it('is `q` — what a reader recognises in an address bar', () => {
    expect(SEARCH_PARAM).toBe('q')
    expect(pathForSearch('north sea')).toBe('/search?q=north%20sea')
  })

  it('is left off entirely when there is no term', () => {
    // Otherwise the nav's link and the page's own replaceState disagree about
    // what the empty state's URL is, and one of them is always wrong.
    expect(pathForSearch()).toBe('/search')
    expect(pathForSearch('   ')).toBe('/search')
    expect(pathForPage('search')).toBe('/search')
  })

  it('encodes what a reader may plausibly type, including quotes and ampersands', () => {
    expect(pathForSearch('"north sea" & tax')).toBe('/search?q=%22north%20sea%22%20%26%20tax')
    expect(searchTermFromUrl('?q=%22north%20sea%22%20%26%20tax')).toBe('"north sea" & tax')
  })

  it('reads back as an empty string when absent, empty or blank', () => {
    expect(searchTermFromUrl('')).toBe('')
    expect(searchTermFromUrl('?q=')).toBe('')
    expect(searchTermFromUrl('?q=%20%20')).toBe('')
    expect(searchTermFromUrl('?other=1')).toBe('')
  })
})

describe('a post’s permalink', () => {
  it('is the bare path by default', () => {
    expect(pathForPost('the-deficit')).toBe('/blog/the-deficit')
    expect(pathForPost('the-deficit', '   ')).toBe('/blog/the-deficit')
  })

  it('carries a search term when the reader arrived from a result', () => {
    expect(pathForPost('the-deficit', 'north sea')).toBe('/blog/the-deficit?q=north%20sea')
  })

  it('still routes to the post — the term is view state, not part of the address', () => {
    // parseRoute takes a pathname, so a query string cannot affect routing. This
    // is what lets ?q= ride along without a case for it anywhere.
    expect(parseRoute('/blog/the-deficit')).toMatchObject({ page: 'blog', postSlug: 'the-deficit' })
  })
})
