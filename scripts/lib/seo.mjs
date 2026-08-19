/**
 * The strings a page is known by, in one place.
 *
 * ⚠ WHY THIS FILE EXISTS. Every title here is produced TWICE: once into the
 * prerendered HTML at build time, and once by src/lib/pageTitle.ts when the app
 * navigates in the browser. If the two disagree, the tab title visibly changes
 * the moment a reader refreshes, and the title Google indexed is not the title
 * the reader sees. The app cannot import this file (it is .mjs, and the build
 * script cannot import the app's TypeScript), so the two are held together by
 * src/__tests__/prerender.seo.test.ts, which runs both implementations over the
 * same inputs and fails if a single character differs.
 *
 * Change a title here and that test will tell you which app file to change with
 * it. That is the whole arrangement.
 */
import { clamp } from './markdown.mjs'

/** The canonical origin. The apex, not www — vercel.json redirects www here, and
 *  every canonical, sitemap entry and feed link below has to name the same one
 *  or they compete with each other. */
export const ORIGIN = 'https://chokkablog.com'

export const SITE = 'chokkablog'

/** The author, for JSON-LD and the feed. A blog is written by a person, and
 *  saying so is what makes an Article's `author` mean anything. */
export const AUTHOR = 'Kevin Hague'

export const TWITTER = '@kevverage'

/** The home page's title AND its h1 — one string, so the page a crawler reads
 *  and the page a reader lands on are named the same thing. HomePage renders it
 *  as a visually-hidden h1 (the design puts the wordmark where a heading would
 *  go, which leaves the document with no h1 at all otherwise). */
export const HOME_TITLE = `${SITE} — data-driven analysis of Scotland's economy`

export const BLOG_TITLE = `Blog | ${SITE}`

/** The search page (Phase 5). Prerendered for its title and description only —
 *  the page itself is `noindex`, because a results page is a different thin page
 *  per query. Twin of SEARCH_TITLE in src/lib/pageTitle.ts. */
export const SEARCH_TITLE = `Search | ${SITE}`

/** The privacy notice. Twin of PRIVACY_TITLE in src/lib/pageTitle.ts. */
export const PRIVACY_TITLE = `Privacy | ${SITE}`

/** The archive index — the old Blogger site, rehosted. Twin of ARCHIVE_TITLE in
 *  src/lib/pageTitle.ts. */
export const ARCHIVE_TITLE = `Archive | ${SITE}`

/** One archive post. Twin of archiveTitle() in src/lib/pageTitle.ts. */
export function archiveTitle(title) {
  return `${plainTitle(title)} | ${SITE}`
}

/** Twin of plainTitle() in src/lib/pageTitle.ts. A headline may carry inline
 *  Markdown for emphasis on the page; a tab and a search result want the words. */
export function plainTitle(md) {
  return String(md ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\*\*|__/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Twin of postTitle() in src/lib/pageTitle.ts. `short_title` wins where set,
 *  because headlines run long and both a tab and a search result cut them. */
export function postTitle(headline, shortTitle) {
  return `${plainTitle(String(shortTitle ?? '').trim() || headline)} | ${SITE}`
}

/**
 * The meta description for a post: the written summary, else the opening of the
 * body — the same precedence as the hub excerpt (src/lib/postExcerpt.ts).
 *
 * The LENGTH deliberately differs from the hub's. A description is cut around
 * 160 characters in a search result, while the hub has room for 220 and clips on
 * a sentence boundary. Same source text, two jobs; only the precedence has to
 * agree, and that is what the test checks.
 */
export function postDescription(post) {
  return clamp(post.summary || post.body || '')
}
