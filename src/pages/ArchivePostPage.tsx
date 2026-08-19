import { useEffect, useMemo, useRef } from 'react'
import { COLORS } from '../constants/colors'
import { Container } from '../components/Container'
import { PageLoading } from '../components/PageLoading'
import { RichText, InlineText } from '../components/RichText'
import { ArchiveComments } from '../components/ArchiveComments'
import { SubscribeBox } from '../components/SubscribeBox'
import { useArchivePost } from '../hooks/useArchive'
import { formatPostDate, isoDate, yearOf } from '../lib/dates'
import { pathForPage, plainClick, searchTermFromUrl } from '../lib/routes'
import { archiveTitle, useDocumentTitle } from '../lib/pageTitle'
import { tokenize } from '../lib/search'
import { firstMark, markMatchesInDom } from '../lib/markDom'

/**
 * One post from the old Blogger site, at /archive/YYYY/MM/slug.
 *
 * The body is rendered as HTML rather than through RichText: it was written in
 * HTML, over ten years, and converting it would lose the layout it was written
 * with. It is sanitised ONCE, at import (scripts/import-archive.py) — scripts,
 * event handlers and javascript: URLs are gone before the row is written, so
 * what is stored is what is safe to render.
 *
 * Two things sit above the body, and they are the reason this section exists at
 * all rather than being a set of redirects to nowhere:
 *
 *   the DATED banner — every visitor arriving from a 2015 search result is told,
 *     before they read a word, that it is from 2015;
 *   the NOTE — Kevin's, in Markdown, pointing at whatever now supersedes it.
 *     Empty on almost every post, and the whole point on the ones that rank.
 */
export function ArchivePostPage({ path, onNavigate }: {
  path: string
  onNavigate: (page: 'archive' | 'blog') => void
}) {
  const { post, loading } = useArchivePost(path)

  /**
   * One-shot search term, exactly as PostPage reads it — arriving from a search
   * result, the words that matched are marked so it is obvious why this page
   * came back. Read at render rather than in an effect, because the post loads
   * asynchronously and the term is stripped from the URL below.
   *
   * ⚠ Archive posts had NO highlighting at all until this, which made them the
   * worst case rather than an edge case: they are 229 of the site's 235 pages
   * and where most search results land. Searching for "Murphy" put a reader
   * 21,911 characters into a GERS post with nothing to show why.
   */
  const highlight = useMemo(() => {
    const t = tokenize(searchTermFromUrl(window.location.search))
    return t.length > 0 ? t : undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  /** The injected body, so the marks can be put into it after render. */
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { window.scrollTo({ top: 0 }) }, [path])
  useDocumentTitle(post ? archiveTitle(post.title) : null)

  /**
   * Take the term back off the URL once read — same reasoning as PostPage: a
   * reader who copies the address bar should not share this post with a
   * stranger's search terms attached. replaceState, so Back still returns to the
   * results.
   */
  useEffect(() => {
    if (!searchTermFromUrl(window.location.search)) return
    window.history.replaceState(null, '', window.location.pathname)
  }, [path])

  /**
   * Mark the matches in the injected HTML.
   *
   * ⚠ AFTER the body exists, and keyed on the post as well as the terms: React
   * writes that subtree with dangerouslySetInnerHTML, so on the first render the
   * ref is attached but empty. `post?.html` in the deps is what makes this run
   * once the content is actually there.
   */
  useEffect(() => {
    if (!highlight || !post) return
    const count = markMatchesInDom(bodyRef.current, highlight)
    // Scroll to the first one. Without this a reader lands at the top of a
    // 25,000-character post and has to hunt for the yellow, which is most of the
    // work the highlighting was meant to save.
    if (count > 0) {
      firstMark(bodyRef.current)?.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
  }, [highlight, post])

  if (loading) return <PageLoading />
  if (!post) return <NotFound onNavigate={onNavigate} />

  // From the date, not the URL — otherwise the banner can claim a year the page
  // does not show, and "More from 2019" links to an anchor that is not there.
  const year = yearOf(post.published_at)

  return (
    <Container className="py-10 sm:py-14">
      <nav className="text-sm mb-6">
        <a
          href={pathForPage('archive')}
          onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('archive') } }}
          className="no-underline hover:underline"
          style={{ color: COLORS.accent }}
        >
          &larr; Archive
        </a>
      </nav>

      <article>
        <header className="mb-6">
          <h1
            className="text-3xl sm:text-4xl font-extrabold leading-tight m-0"
            style={{ color: COLORS.ink, letterSpacing: '-1px' }}
          >
            <InlineText text={post.title} highlight={highlight} id={post.id} />
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs" style={{ color: COLORS.faint }}>
            <time dateTime={isoDate(post.published_at)} className="num">
              {formatPostDate(post.published_at)}
            </time>
            {/* Where it first appeared. A republication that hides where it came
                from is the kind of thing that makes an archive look like a copy. */}
            <a
              href={post.original_url}
              rel="nofollow noopener"
              target="_blank"
              className="no-underline hover:underline"
              style={{ color: 'inherit' }}
            >
              Originally published on Blogger
            </a>
          </div>
        </header>

        <Dated year={year} />
        {post.note.trim() && <Note markdown={post.note} id={post.id} />}

        {/* Sanitised at import, never in the browser — see the note above. */}
        <div
          ref={bodyRef}
          className="archive-html"
          style={{ color: COLORS.ink }}
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        {post.labels.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-8">
            {post.labels.map((label) => (
              <span
                key={label}
                className="text-xs px-2 py-1 rounded"
                style={{ background: COLORS.tint, color: COLORS.muted }}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </article>

      {/* ⚠ ON THE ARCHIVE TOO, and this is where it earns most. 229 old posts
          against a handful of new ones: an archive page is where a search
          result lands, so this is the first thing most readers ever see of the
          site. The box under a 2015 post is doing more work than the one under
          this week's. */}
      <SubscribeBox />

      <ArchiveComments comments={post.comments ?? []} />

      <nav className="mt-12 pt-6 border-t text-sm flex flex-wrap gap-x-6 gap-y-2" style={{ borderColor: COLORS.border }}>
        {/* Left to the browser rather than routed in-app: the value of this
            link is the #year anchor, and an in-app navigation would arrive at
            the top of a 229-row page having dropped the only useful part. */}
        <a
          href={`${pathForPage('archive')}#${year}`}
          className="font-semibold no-underline hover:underline"
          style={{ color: COLORS.accent }}
        >
          More from {year}
        </a>
        <a
          href={pathForPage('blog')}
          onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('blog') } }}
          className="font-semibold no-underline hover:underline"
          style={{ color: COLORS.accent }}
        >
          What I&rsquo;m writing now &rarr;
        </a>
      </nav>
    </Container>
  )
}

/** The standing banner. On every archive post, whether or not it has a note —
 *  an old post with no warning on it is the thing this section is for avoiding. */
function Dated({ year }: { year: string }) {
  return (
    <p
      className="text-sm rounded-lg px-4 py-3 mb-6"
      style={{ background: COLORS.tint, color: COLORS.muted }}
    >
      From the archive. This was published in <span className="num">{year}</span> on the
      original Chokkablog, and is kept here as it was written — the figures and
      links in it are of their time.
    </p>
  )
}

/** Kevin's note, in the site's own Markdown, so it can link straight at whatever
 *  replaced this post. Accented rather than tinted: it is the one part of the
 *  page written today, and a reader who arrived from a search result should see
 *  it before the ten-year-old prose. */
function Note({ markdown, id }: { markdown: string; id: string }) {
  return (
    <div
      className="text-[15px] leading-relaxed rounded-lg px-4 py-3 mb-8 border-l-4"
      style={{ background: COLORS.accentSoft, borderColor: COLORS.accent, color: COLORS.ink }}
    >
      <RichText text={markdown} id={`note-${id}`} />
    </div>
  )
}

function NotFound({ onNavigate }: { onNavigate: (page: 'archive') => void }) {
  // As everywhere else: the server answers 200 for every path, so a mistyped
  // archive URL would otherwise be an indexable duplicate.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,follow'
    document.head.appendChild(meta)
    return () => { meta.remove() }
  }, [])

  return (
    <Container className="py-16">
      <h1 className="text-xl font-bold mb-2" style={{ color: COLORS.ink }}>Not in the archive</h1>
      <p className="text-sm mb-4" style={{ color: COLORS.muted }}>
        There&rsquo;s no post at this address. It may never have existed, or it was
        one of the drafts that was never published.
      </p>
      <a
        href={pathForPage('archive')}
        onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('archive') } }}
        className="text-sm font-semibold no-underline hover:underline"
        style={{ color: COLORS.accent }}
      >
        &larr; All archive posts
      </a>
    </Container>
  )
}
