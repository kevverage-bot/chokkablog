import { useEffect } from 'react'
import type { PageId } from './routes'

/**
 * The browser tab's title.
 *
 * ⚠ From Phase 3 these strings MUST match the ones the prerenderer writes for
 * the same route. They are one title arriving by two paths: prerendered HTML on
 * a cold load, this module on every in-app navigation. If they disagree, the
 * title visibly changes when a reader refreshes. On GERS Explorer that drift is
 * held shut by a test that reads the prerender script; add the same one here as
 * soon as the prerenderer lands.
 */

export const SITE = 'chokkablog'

/**
 * The home page's title AND its h1.
 *
 * The design gives the home page no visible heading — the wordmark in the nav
 * does that job — which left the document with no h1 at all. HomePage renders
 * this as a visually-hidden one, so the page a crawler reads and the page a
 * reader lands on are named the same thing. Twin of HOME_TITLE in
 * scripts/lib/seo.mjs — held together by src/__tests__/prerender.seo.test.ts.
 */
export const HOME_TITLE = `${SITE} — data-driven analysis of Scotland's economy`

/**
 * Who writes here.
 *
 * Used as the byline on an author's reply to a comment, and by the prerenderer as
 * an Article's `author` in JSON-LD. Twin of AUTHOR in scripts/lib/seo.mjs: a
 * reply signed with one name while the structured data claims another is a small
 * thing that reads as a fake.
 */
export const AUTHOR = 'Kevin Hague'

/**
 * Titles this module can produce with no loaded data.
 *
 * Deliberately incomplete. A page whose title depends on content that arrives
 * asynchronously — a post's headline — is absent, and sets its own title once it
 * has it. App passes `null` for those rather than an interim string: on a cold
 * load the prerendered title is ALREADY correct, so writing a placeholder first
 * makes the tab flick from the right title to a generic one and back.
 */
export const STATIC_PAGE_TITLES: Partial<Record<PageId, string>> = {
  home: HOME_TITLE,
  blog: `Blog | ${SITE}`,
  // Not prerendered (tools, not published pages), so there is nothing for these
  // to match. Naming them still beats leaving the previous page's title in the tab.
  admin: `Admin | ${SITE}`,
  login: `Sign in | ${SITE}`,
}

/** The 404. Not in STATIC_PAGE_TITLES because it is not a page you can navigate
 *  to — it is a state any path can be in. */
export const NOT_FOUND_TITLE = `Not found | ${SITE}`

/**
 * Strip the inline Markdown a headline may carry, so it reads as plain text in a
 * tab. Mirrors the `markdownToText` the prerenderer will use, for the subset a
 * headline can contain.
 */
export function plainTitle(md: string): string {
  return String(md ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\*\*|__/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One post, at /blog/<slug>.
 *
 * `short_title` wins when set. Headlines are written to be read on the page and
 * run long; a tab truncates them and Google cuts around 60 characters. Blank
 * falls back to the headline, so this changes nothing until the box is filled in.
 *
 * ⚠ MUST match what the prerenderer writes for the same route, or the tab title
 * changes when a reader refreshes.
 */
export function postTitle(headline: string, shortTitle?: string): string {
  return `${plainTitle(shortTitle?.trim() || headline)} | ${SITE}`
}

/**
 * Set the tab title, or leave it alone when passed `null`.
 *
 * `null` means "not mine to set" — see STATIC_PAGE_TITLES above.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title && document.title !== title) document.title = title
  }, [title])
}
