/**
 * URL routing.
 *
 * The *page* lives in the path (from Phase 1, `/insights/<slug>`);
 * any view state belongs in the query string. There is no `?p=`-style page param
 * and there never was — this site starts with real paths, which is what lets each
 * post be prerendered at its own URL.
 *
 * ⚠ Adding a section means all four of: a `PageId`, a `PAGE_PATHS` entry, a case
 * in App's renderer, and — if it should be found — a route in the prerenderer.
 * Anything less and the page either renders nothing or exists for readers but
 * not for search. Nothing is listed here before its page exists, which is why
 * `about` and `search` are still absent.
 */

export type PageId =
  | 'home'
  | 'insights'
  | 'admin'
  | 'login'

/** The canonical path each page is served at. */
export const PAGE_PATHS: Record<PageId, string> = {
  home: '/',
  insights: '/insights',
  admin: '/admin',
  login: '/login',
}

const INSIGHT_PREFIX = PAGE_PATHS.insights + '/'

/** Longest path first, so a nested route is matched before `/`. */
const PATH_TO_PAGE: [string, PageId][] = (Object.entries(PAGE_PATHS) as [PageId, string][])
  .map(([page, path]) => [path, page] as [string, PageId])
  .sort((a, b) => b[0].length - a[0].length)

export interface RouteState {
  page: PageId
  /** The post's slug on `/insights/<slug>`, else null. */
  insightSlug: string | null
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
  const base: RouteState = { page: 'home', insightSlug: null, notFound: false }

  if (path.startsWith(INSIGHT_PREFIX)) {
    const slug = path.slice(INSIGHT_PREFIX.length)
    // A nested segment (`/insights/a/b`) is not a post, so it falls through to
    // notFound rather than looking one up under a slug that cannot exist.
    if (slug && !slug.includes('/')) return { ...base, page: 'insights', insightSlug: slug }
    return { ...base, page: 'insights', notFound: true }
  }

  for (const [p, page] of PATH_TO_PAGE) if (p === path) return { ...base, page }
  return { ...base, notFound: true }
}

/** The permalink for one post. */
export function pathForInsight(slug: string): string {
  return INSIGHT_PREFIX + slug
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
