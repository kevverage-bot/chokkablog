import { useEffect, useMemo, useRef, useState } from 'react'
import { COLORS, PREVIEW_OUTLINE } from '../constants/colors'
import { Container } from '../components/Container'
import { InlineText } from '../components/RichText'
import { PreviewBadge } from '../components/AdminPreview'
import { highlightText } from '../lib/highlight'
import { usePosts } from '../hooks/usePosts'
import { searchPosts, type PostHit } from '../lib/postSearch'
import { tokenize } from '../lib/search'
import { formatPostDate, isoDate } from '../lib/dates'
import { pathForPage, pathForPost, pathForSearch, plainClick, searchTermFromUrl } from '../lib/routes'

/**
 * Site search, at /search.
 *
 * Searching happens as the reader types, against the posts already in the
 * browser — there is no request to wait for, so there is no submit button and no
 * "Searching…" spinner once the posts have loaded. The rules it applies (which
 * fields count for how much, and why every word has to match) are in
 * lib/postSearch; the tokenising, quoting and punctuation-folding are in
 * lib/search, shared with the highlighting a post does on arrival.
 *
 * ⚠ The page is prerendered `noindex`. A search results page is thin, infinitely
 * variable content — one URL per query — and Google asks not to be given it.
 * Every result here links to a real permalink that IS indexed, which is the page
 * that should come back from a search engine anyway.
 */
export function SearchPage({ onNavigate, onSelect }: {
  onNavigate: (page: 'blog') => void
  onSelect: (slug: string, term?: string) => void
}) {
  const { posts, loading } = usePosts()

  // Seeded from the URL, so a shared /search?q=… link arrives with the search
  // already run, and Back out of a post lands on the results the reader left.
  const [term, setTerm] = useState(() => searchTermFromUrl(window.location.search))
  const inputRef = useRef<HTMLInputElement>(null)

  const tokens = useMemo(() => tokenize(term), [term])
  const hits = useMemo(() => searchPosts(posts, tokens), [posts, tokens])
  const searching = tokens.length > 0

  useEffect(() => { inputRef.current?.focus() }, [])

  /**
   * Keep `?q=` in step with the box.
   *
   * replaceState, not pushState: a history entry per keystroke would turn Back
   * into a way of un-typing, and the reader's actual previous page would be
   * twenty presses away. Debounced because Safari rate-limits history writes and
   * a fast typist can hit the ceiling, at which point it starts throwing.
   */
  useEffect(() => {
    const id = setTimeout(() => {
      const next = pathForSearch(term)
      if (next !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, '', next)
      }
    }, 300)
    return () => clearTimeout(id)
  }, [term])

  return (
    <Container className="py-10 sm:py-14">
      <h1
        className="text-3xl sm:text-4xl font-extrabold mb-2"
        style={{ color: COLORS.ink, letterSpacing: '-1px' }}
      >
        Search
      </h1>
      <p className="text-base mb-6 max-w-xl" style={{ color: COLORS.muted }}>
        Every post, by keyword. Put <span style={{ color: COLORS.ink }}>&ldquo;quotation marks&rdquo;</span> around
        words to match them as a phrase.
      </p>

      {/* A real form, so a phone's keyboard offers Search and closes on submit.
          There is nothing to submit to — the results are already on screen. */}
      <form role="search" onSubmit={(e) => { e.preventDefault(); inputRef.current?.blur() }} className="relative mb-8">
        <span
          className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: COLORS.faint }}
        >
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search the blog…"
          aria-label="Search the blog"
          autoComplete="off"
          className="w-full rounded-lg border pl-11 pr-10 py-3 text-base focus:outline-none focus:ring-2 [&::-webkit-search-cancel-button]:appearance-none"
          style={{ borderColor: COLORS.border, color: COLORS.ink }}
        />
        {term && (
          <button
            type="button"
            onClick={() => { setTerm(''); inputRef.current?.focus() }}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer bg-transparent border-none"
            style={{ color: COLORS.faint }}
          >
            &#10005;
          </button>
        )}
      </form>

      {!searching ? (
        <Hint onNavigate={onNavigate} />
      ) : loading ? (
        // The only wait on this page, and only on a cold load straight to
        // /search?q=… — everywhere else the posts are already here.
        <p className="text-sm" style={{ color: COLORS.faint }}>Searching…</p>
      ) : hits.length === 0 ? (
        <Nothing term={term} onNavigate={onNavigate} />
      ) : (
        <>
          <p className="text-sm mb-6" style={{ color: COLORS.muted }}>
            {hits.length} {hits.length === 1 ? 'post' : 'posts'} matching{' '}
            <span style={{ color: COLORS.ink }}>{term.trim()}</span>
          </p>
          <div className="space-y-8">
            {hits.map((hit) => (
              <Result key={hit.post.id} hit={hit} tokens={tokens} term={term} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </Container>
  )
}

/** One result: the headline, when it was published, and why it matched. */
function Result({ hit, tokens, term, onSelect }: {
  hit: PostHit
  tokens: string[]
  term: string
  onSelect: (slug: string, term?: string) => void
}) {
  const { post } = hit
  const date = formatPostDate(post.published_at)
  const draft = !post.published
  // Same as the hub: a draft that has not been given an address yet has no page
  // to link to, so it is shown as text rather than as a link that would 404.
  const href = post.slug ? pathForPost(post.slug, term) : null

  const heading = (
    <span
      className="text-xl sm:text-2xl font-bold leading-snug"
      style={{ color: COLORS.ink, letterSpacing: '-0.4px' }}
    >
      <InlineText text={post.headline || 'Untitled'} highlight={tokens} id={`hit-${post.id}`} />
    </span>
  )

  return (
    <article
      className="border-b pb-8 last:border-b-0"
      style={{ borderColor: COLORS.border, ...(draft ? PREVIEW_OUTLINE : {}) }}
    >
      <div className="flex items-start gap-2 mb-2">
        <h2 className="m-0 flex-1">
          {href ? (
            <a
              href={href}
              onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onSelect(post.slug!, term) } }}
              className="no-underline hover:underline underline-offset-4"
            >
              {heading}
            </a>
          ) : heading}
        </h2>
        {draft && <span className="shrink-0 mt-1"><PreviewBadge /></span>}
      </div>

      {hit.snippet && (
        <p className="text-[15px] leading-relaxed mb-3 max-w-2xl" style={{ color: COLORS.muted }}>
          {highlightText(hit.snippet, tokens)}
        </p>
      )}

      <div className="text-xs" style={{ color: COLORS.faint }}>
        {date
          ? <time dateTime={isoDate(post.published_at)}>{date}</time>
          : <span>Draft</span>}
      </div>
    </article>
  )
}

function Hint({ onNavigate }: { onNavigate: (page: 'blog') => void }) {
  return (
    <p className="text-sm" style={{ color: COLORS.faint }}>
      Type a word or two to search every post. Or{' '}
      <BlogLink onNavigate={onNavigate}>read the blog from the beginning</BlogLink>.
    </p>
  )
}

function Nothing({ term, onNavigate }: { term: string; onNavigate: (page: 'blog') => void }) {
  return (
    <div>
      <p className="text-sm mb-2" style={{ color: COLORS.muted }}>
        Nothing matches <span style={{ color: COLORS.ink }}>{term.trim()}</span>.
      </p>
      <p className="text-sm" style={{ color: COLORS.faint }}>
        Every word has to appear in a post, so fewer words find more.{' '}
        <BlogLink onNavigate={onNavigate}>Browse all posts</BlogLink> instead.
      </p>
    </div>
  )
}

/** A link to the hub — a real anchor, routed in-app on a plain click, like every
 *  other internal link on the site. */
function BlogLink({ onNavigate, children }: {
  onNavigate: (page: 'blog') => void
  children: React.ReactNode
}) {
  return (
    <a
      href={pathForPage('blog')}
      onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('blog') } }}
      className="font-semibold no-underline hover:underline"
      style={{ color: COLORS.accent }}
    >
      {children}
    </a>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
