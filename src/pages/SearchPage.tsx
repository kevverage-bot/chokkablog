import { useEffect, useMemo, useRef, useState } from 'react'
import { COLORS, PREVIEW_OUTLINE } from '../constants/colors'
import { Container } from '../components/Container'
import { InlineText } from '../components/RichText'
import { PreviewBadge } from '../components/AdminPreview'
import { highlightText, MARK_STYLE } from '../lib/highlight'
import { splitSnippet } from '../lib/archiveSnippet'
import { usePosts } from '../hooks/usePosts'
import { useArchiveSearch, type ArchiveSummary } from '../hooks/useArchive'
import { searchPosts, type PostHit } from '../lib/postSearch'
import { tokenize } from '../lib/search'
import { formatPostDate, isoDate } from '../lib/dates'
import {
  pathForArchive, pathForPage, pathForPost, pathForSearch, plainClick, searchTermFromUrl,
} from '../lib/routes'

/**
 * Site search, at /search.
 *
 * TWO CORPORA, SEARCHED TWO WAYS, under one box.
 *
 * The blog is searched as the reader types, against the posts already in the
 * browser — no request to wait for, so no submit button. The archive cannot work
 * that way: 229 old posts are 3.2MB of text that nobody should download to type
 * in a box, so it is searched in Postgres over a full-text index and arrives a
 * moment later (see useArchiveSearch). The reader is told which is which,
 * because a 2015 answer and a 2026 answer to the same question are different
 * answers.
 *
 * The rules the blog side applies (which fields count for how much, and why
 * every word has to match) are in lib/postSearch; the tokenising, quoting and
 * punctuation-folding are in lib/search, shared with the highlighting a post
 * does on arrival.
 *
 * ⚠ The page is prerendered `noindex`. A search results page is thin, infinitely
 * variable content — one URL per query — and Google asks not to be given it.
 * Every result here links to a real permalink that IS indexed, which is the page
 * that should come back from a search engine anyway.
 */
export function SearchPage({ onNavigate, onSelect, onSelectArchive }: {
  onNavigate: (page: 'blog') => void
  onSelect: (slug: string, term?: string) => void
  onSelectArchive: (path: string) => void
}) {
  const { posts, loading } = usePosts()

  // Seeded from the URL, so a shared /search?q=… link arrives with the search
  // already run, and Back out of a post lands on the results the reader left.
  const [term, setTerm] = useState(() => searchTermFromUrl(window.location.search))
  const inputRef = useRef<HTMLInputElement>(null)

  const tokens = useMemo(() => tokenize(term), [term])
  const hits = useMemo(() => searchPosts(posts, tokens), [posts, tokens])
  const searching = tokens.length > 0
  const { hits: archiveHits, searching: archiveSearching } = useArchiveSearch(term)
  const waiting = loading || archiveSearching
  const found = hits.length + archiveHits.length

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
      ) : (
        <>
          {hits.length > 0 && (
            <section className="mb-12">
              <GroupHeading
                title="Blog"
                count={hits.length}
                note="what I'm writing now"
              />
              <div className="space-y-8">
                {hits.map((hit) => (
                  <Result key={hit.post.id} hit={hit} tokens={tokens} term={term} onSelect={onSelect} />
                ))}
              </div>
            </section>
          )}

          {archiveHits.length > 0 && (
            <section className="mb-12">
              <GroupHeading
                title="Archive"
                count={archiveHits.length}
                note="the original Chokkablog, 2010–2022"
              />
              <ul className="m-0 p-0 list-none space-y-6">
                {archiveHits.map((hit) => (
                  <ArchiveResult key={hit.path} hit={hit} tokens={tokens} onSelect={onSelectArchive} />
                ))}
              </ul>
            </section>
          )}

          {/* One line, not two: the archive answers a beat after the blog, and a
              "Searching…" that appears under results already on screen reads as
              a fault rather than as progress. */}
          {waiting && found === 0 && (
            <p className="text-sm" style={{ color: COLORS.faint }}>Searching…</p>
          )}
          {!waiting && found === 0 && <Nothing term={term} onNavigate={onNavigate} />}
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

/** The heading over one corpus's results. Present only when that corpus has
 *  any, so a search that only hits the blog does not advertise an empty
 *  archive — and a search that hits both makes the difference impossible to
 *  miss. */
function GroupHeading({ title, count, note }: { title: string; count: number; note: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-5 pb-2 border-b" style={{ borderColor: COLORS.border }}>
      <h2 className="text-sm font-bold uppercase m-0" style={{ color: COLORS.ink, letterSpacing: '1px' }}>
        {title}
      </h2>
      <span className="text-sm num" style={{ color: COLORS.faint }}>({count})</span>
      <span className="text-xs ml-auto text-right" style={{ color: COLORS.faint }}>{note}</span>
    </div>
  )
}

/** One archive hit. Lighter than a blog result — a date, a title and the stored
 *  excerpt — because that is all the list query fetched. */
function ArchiveResult({ hit, tokens, onSelect }: {
  hit: ArchiveSummary
  tokens: string[]
  onSelect: (path: string) => void
}) {
  const href = pathForArchive(hit.path)
  return (
    <li>
      <a
        href={href}
        onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onSelect(hit.path) } }}
        className="no-underline hover:underline underline-offset-4"
      >
        <span className="text-lg sm:text-xl font-bold leading-snug" style={{ color: COLORS.ink }}>
          {highlightText(hit.title, tokens)}
        </span>
      </a>
      {hit.excerpt && (
        <p className="text-[15px] leading-relaxed mt-1 mb-2 max-w-2xl" style={{ color: COLORS.muted }}>
          {/* ⚠ MARKED BY POSTGRES, NOT BY US, and that is the point. The marks
              come from the same tsquery that matched, so a search for
              "borrowing" highlights "borrow" — which highlighting the reader's
              literal words here never could. They arrive as sentinels and are
              turned into <mark> elements, so nothing is injected as markup.
              See src/lib/archiveSnippet.ts.

              A row with no sentinels renders as plain text: that is the
              pre-migration fallback in useArchiveSearch showing the old stored
              excerpt, not a failure. */}
          {(() => {
            const parts = splitSnippet(hit.excerpt)
            // No sentinels at all means this row came from the pre-migration
            // fallback — the old stored excerpt. Highlight it the old way rather
            // than showing it flat, so the deploy window is no worse than before.
            if (!parts.some((p) => p.hit)) return highlightText(hit.excerpt, tokens)
            return parts.map((part, i) => (
              part.hit
                ? <mark key={i} style={MARK_STYLE}>{part.text}</mark>
                : <span key={i}>{part.text}</span>
            ))
          })()}
        </p>
      )}
      <div className="text-xs num" style={{ color: COLORS.faint }}>
        <time dateTime={isoDate(hit.published_at)}>{formatPostDate(hit.published_at)}</time>
      </div>
    </li>
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
        Nothing matches <span style={{ color: COLORS.ink }}>{term.trim()}</span>, in
        the blog or the archive.
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
