import type { Post } from '../hooks/usePosts'
import { matchable, snippet } from './search'
import { stripMarkdown } from './markdownText'

/**
 * Searching the posts.
 *
 * The whole corpus is already in the browser: `usePosts` selects every column of
 * every row a reader is allowed to see, because the hub needs the bodies for its
 * excerpts anyway. So search is a pass over an array — no index to build, no
 * endpoint to call, and, crucially, NOTHING GENERATED AT BUILD TIME. A prebuilt
 * index would have gone stale the moment a post was published, exactly as the
 * prerendered snapshot does (see the freshness note in scripts/prerender.mjs),
 * and would have needed the rebuild trigger from Phase 4.5 to catch up. Search
 * finds a post the instant it is published instead.
 *
 * It also means drafts are searchable by their author and by nobody else,
 * without a line of code here to arrange it: RLS decided what was in the array.
 *
 * ── The matching rule ──
 * EVERY token must appear somewhere in the post (AND), though not adjacently
 * unless it was quoted as a phrase. Adding a word narrows the results, which is
 * what a reader expects from every search box they have ever used; OR would
 * widen them, so a second word would make the list longer and the good hit
 * harder to find. On a site with tens of posts rather than thousands, precision
 * costs nothing — the recall an OR would buy is a list of the whole blog.
 *
 * (GERS Explorer's /search uses OR, because there a query is matched against
 * chart labels and table rows as well as prose, where a partial match is often
 * the useful one. A blog is only prose.)
 */

/** Where a token was found, and what that is worth. A headline hit is the
 *  strongest signal a short document can give — it is the post's own claim about
 *  what it is about — and a body hit the weakest, because a long post mentions a
 *  lot of things in passing. */
const TITLE_WEIGHT = 4
const SUMMARY_WEIGHT = 2
const BODY_WEIGHT = 1

export interface PostHit {
  post: Post
  /** Summed field weights over every token. Comparable only within one query. */
  score: number
  /** Plain-prose preview centred on the match, already Markdown-stripped. */
  snippet: string
}

interface Prepared {
  /** Headline and short title, folded for matching. */
  title: string
  summary: string
  /** Body and footer, folded for matching. */
  body: string
  /** The prose a snippet is cut from, in the author's own punctuation. */
  prose: string
}

/**
 * Stripping Markdown from every body on every keystroke is a dozen regexes per
 * post, so the prepared form is cached against the row object. A WeakMap rather
 * than a keyed cache: `usePosts` replaces the whole array after a save, and the
 * old entries then go with it instead of being kept alive by their own cache.
 */
const cache = new WeakMap<Post, Prepared>()

function prepare(post: Post): Prepared {
  const hit = cache.get(post)
  if (hit) return hit

  // Markdown is stripped BEFORE matching, not only before display. A headline
  // written "A **bold** claim" contains the characters `**` between the words,
  // so a search for "bold claim" as a phrase would otherwise miss the one post
  // whose headline says exactly that.
  const summaryProse = stripMarkdown(post.summary)
  const bodyProse = [stripMarkdown(post.body), stripMarkdown(post.footer)]
    .filter(Boolean)
    .join('  ·  ')

  const prepared: Prepared = {
    title: matchable(stripMarkdown(`${post.headline} ${post.short_title}`)),
    summary: matchable(summaryProse),
    body: matchable(bodyProse),
    // The summary leads: it is the sentence written to introduce the post, so a
    // headline-only match reads better opening with it than with the body's
    // first line.
    prose: [summaryProse, bodyProse].filter(Boolean).join('  ·  '),
  }
  cache.set(post, prepared)
  return prepared
}

/** Score one post, or null when a token is missing from it entirely. */
function scorePost(post: Post, tokens: string[]): PostHit | null {
  const p = prepare(post)
  let score = 0
  for (const token of tokens) {
    let field = 0
    if (p.title.includes(token)) field += TITLE_WEIGHT
    if (p.summary.includes(token)) field += SUMMARY_WEIGHT
    if (p.body.includes(token)) field += BODY_WEIGHT
    if (field === 0) return null
    score += field
  }
  return { post, score, snippet: snippet(p.prose, tokens) }
}

/**
 * The posts matching `tokens`, best first.
 *
 * `posts` is expected in the site's own order (newest first, as `usePosts`
 * returns it). The sort below is stable, so posts of equal score keep it —
 * two posts that mention a term equally prominently are ranked by recency, which
 * on a blog is the tie-break a reader wants.
 */
export function searchPosts(posts: Post[], tokens: string[]): PostHit[] {
  if (tokens.length === 0) return []
  const hits: PostHit[] = []
  for (const post of posts) {
    const hit = scorePost(post, tokens)
    if (hit) hits.push(hit)
  }
  return hits.sort((a, b) => b.score - a.score)
}
