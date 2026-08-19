/**
 * URL routing.
 *
 * The *page* lives in the path (from Phase 1, `/blog/<slug>`);
 * any view state belongs in the query string. There is no `?p=`-style page param
 * and there never was — this site starts with real paths, which is what lets each
 * post be prerendered at its own URL. The one piece of view state the site has is
 * the search term, and it lives in `?q=` — see SEARCH_PARAM below.
 *
 * ⚠ Adding a section means all four of: a `PageId`, a `PAGE_PATHS` entry, a case
 * in App's renderer, and — if it should be found — a route in the prerenderer.
 * Anything less and the page either renders nothing or exists for readers but
 * not for search. Nothing is listed here before its page exists, which is why
 * `about` is still absent.
 *
 * The blog was `/insights` until August 2026. Those paths are redirected 308 by
 * vercel.json, so nothing here needs to know about them — but a route added
 * below must not collide with one, or the redirect will shadow it.
 */

export type PageId =
  | 'home'
  | 'blog'
  | 'archive'
  | 'search'
  | 'admin'
  | 'login'

/** The canonical path each page is served at. */
export const PAGE_PATHS: Record<PageId, string> = {
  home: '/',
  blog: '/blog',
  archive: '/archive',
  search: '/search',
  admin: '/admin',
  login: '/login',
}

const POST_PREFIX = PAGE_PATHS.blog + '/'
const ARCHIVE_PREFIX = PAGE_PATHS.archive + '/'

/**
 * An archive post's address is Blogger's own: `YYYY/MM/slug`.
 *
 * ⚠ THE DATE IS PART OF THE PATH ON PURPOSE. It is what makes every old
 * blogspot URL map to its replacement by concatenation — `/2015/03/x.html`
 * becomes `/archive/2015/03/x` — with no lookup table on the Blogger side,
 * which is all a theme template can do. It also avoids a collision: two slugs
 * ('in-other-news', 'playing-long-game') were reused across years.
 */
const ARCHIVE_PATH = /^\d{4}\/\d{2}\/[a-z0-9\-_.]+$/

/** Longest path first, so a nested route is matched before `/`. */
const PATH_TO_PAGE: [string, PageId][] = (Object.entries(PAGE_PATHS) as [PageId, string][])
  .map(([page, path]) => [path, page] as [string, PageId])
  .sort((a, b) => b[0].length - a[0].length)

export interface RouteState {
  page: PageId
  /** The post's slug on `/blog/<slug>`, else null. */
  postSlug: string | null
  /** The archive post's `YYYY/MM/slug` on `/archive/<path>`, else null. */
  archivePath: string | null
  /**
   * True when the path matched nothing. Vercel's catch-all rewrite answers 200
   * for every path (so a post published since the last prerender still works),
   * which means a mistyped URL would otherwise become another indexable copy of
   * the home page. The page marks itself noindex instead.
   */
  notFound: boolean
}

/** Trailing slashes are equivalent: `/admin/` === `/admin`. */
function trimPath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/** Resolve a pathname to the page it renders. */
export function parseRoute(pathname: string): RouteState {
  const path = trimPath(pathname)
  const base: RouteState = { page: 'home', postSlug: null, archivePath: null, notFound: false }

  if (path.startsWith(ARCHIVE_PREFIX)) {
    // `.html` is accepted and dropped rather than 404'd. Blogger's theme can
    // only concatenate strings, so the redirect it emits keeps the extension;
    // vercel.json 308s that form to the clean one, and this is what makes the
    // same URL work in dev, in tests, and if the redirect is ever mis-typed.
    const rest = path.slice(ARCHIVE_PREFIX.length).replace(/\.html$/, '')
    if (ARCHIVE_PATH.test(rest)) return { ...base, page: 'archive', archivePath: rest }
    return { ...base, page: 'archive', notFound: true }
  }

  if (path.startsWith(POST_PREFIX)) {
    const slug = path.slice(POST_PREFIX.length)
    // A nested segment (`/blog/a/b`) is not a post, so it falls through to
    // notFound rather than looking one up under a slug that cannot exist.
    if (slug && !slug.includes('/')) return { ...base, page: 'blog', postSlug: slug }
    return { ...base, page: 'blog', notFound: true }
  }

  for (const [p, page] of PATH_TO_PAGE) if (p === path) return { ...base, page }
  return { ...base, notFound: true }
}

/**
 * The permalink for one post.
 *
 * `term` carries the words a reader searched for through to the post, so the
 * page can mark them (see PostPage) and it is obvious why this result came back.
 * It is view state, not part of the address: the prerendered `<link rel=canonical>`
 * points at the bare permalink, and PostPage strips the parameter once it has
 * read it, so a reader who copies the URL out of the address bar shares the post
 * rather than their own search.
 */
export function pathForPost(slug: string, term?: string): string {
  const path = POST_PREFIX + slug
  const q = (term ?? '').trim()
  return q ? `${path}?${SEARCH_PARAM}=${encodeURIComponent(q)}` : path
}

// ── The search term ─────────────────────────────────────────────────────────
// One name for the parameter, used by the results page, by the links out of it,
// and by the prerenderer's canonical note. `q` because that is what a reader
// recognises in an address bar, and what an external link to a search is likely
// to have been written with by hand.

export const SEARCH_PARAM = 'q'

/** The search results page, with a term where there is one. */
export function pathForSearch(term?: string): string {
  const q = (term ?? '').trim()
  return q ? `${PAGE_PATHS.search}?${SEARCH_PARAM}=${encodeURIComponent(q)}` : PAGE_PATHS.search
}

/**
 * The search term in a query string (`window.location.search`), or ''.
 *
 * Used on arrival at both `/search` and a post: a shared link to a search has to
 * come back with the search already run, and Back out of a post has to land on
 * the results the reader left rather than an empty box.
 */
export function searchTermFromUrl(search: string): string {
  return new URLSearchParams(search).get(SEARCH_PARAM)?.trim() ?? ''
}

/** The permalink for one archive post, from its `YYYY/MM/slug`. */
export function pathForArchive(path: string): string {
  return ARCHIVE_PREFIX + path
}

/** The canonical path for a page. */
export function pathForPage(page: PageId): string {
  return PAGE_PATHS[page]
}

/** The current route, read from the browser. */
export function parseUrlState(): RouteState {
  return parseRoute(window.location.pathname)
}

/**
 * True for a click the app should handle itself. Any modified click — new tab,
 * new window, download — belongs to the browser, which is why every internal
 * link is a real `<a href>` with this guarding the handler rather than a `<div>`
 * with an onClick.
 */
export function plainClick(e: {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  button: number
}): boolean {
  return !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0
}
