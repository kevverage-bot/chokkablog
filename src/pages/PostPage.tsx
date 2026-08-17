import { useEffect, useMemo, useState } from 'react'
import { COLORS, PREVIEW_OUTLINE } from '../constants/colors'
import { Container } from '../components/Container'
import { PageLoading } from '../components/PageLoading'
import { RichText, RichTextFootnotes, InlineText } from '../components/RichText'
import { PreviewBadge } from '../components/AdminPreview'
import { usePosts, type Post } from '../hooks/usePosts'
import { formatPostDate, isoDate } from '../lib/dates'
import { pathForPost, pathForPage, plainClick } from '../lib/routes'
import { postTitle, useDocumentTitle } from '../lib/pageTitle'
import { tokenize } from '../lib/search'

/**
 * One post at its own URL (/posts/<slug>).
 *
 * The hub shows only a headline and an excerpt, so this is the only place a
 * post's full text is rendered — no two URLs carry the same prose, and each
 * permalink owns its content outright.
 */
export function PostPage({ slug, onNavigate, onSelect }: {
  slug: string
  onNavigate: (page: 'blog') => void
  onSelect: (slug: string) => void
}) {
  const { posts, loading } = usePosts()

  // One-shot search term: arriving from a search result (Phase 5), the words
  // that matched are highlighted so it is obvious why this page came back. Read
  // at render rather than in an effect — posts load asynchronously, and the term
  // is stripped from the URL once the page settles, so an effect could miss it.
  const highlight = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get('q') ?? ''
    const t = tokenize(q)
    return t.length > 0 ? t : undefined
  }, [])

  const idx = posts.findIndex((i) => i.slug === slug)
  const post = idx >= 0 ? posts[idx] : undefined
  // The list is newest-first, so the NEXT index is the older post.
  const newer = idx > 0 ? posts[idx - 1] : null
  const older = idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null

  useEffect(() => { window.scrollTo({ top: 0 }) }, [slug])

  // Null until the post is found: on a cold load the prerendered title is
  // already this exact string, so writing anything interim would flick the tab.
  useDocumentTitle(post ? postTitle(post.headline, post.short_title) : null)

  if (loading) return <PageLoading />

  // An unpublished post is filtered out by RLS for everyone but an admin, so for
  // most visitors a draft URL is simply not found — the same as a bad slug, and
  // deliberately indistinguishable from one.
  if (!post) return <NotFound onNavigate={onNavigate} />

  const date = formatPostDate(post.published_at)

  return (
    <Container className="py-10 sm:py-14">
      <nav className="text-sm mb-6">
        <a
          href={pathForPage('blog')}
          onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('blog') } }}
          className="no-underline hover:underline"
          style={{ color: COLORS.accent }}
        >
          &larr; Blog
        </a>
      </nav>

      <article style={post.published ? undefined : PREVIEW_OUTLINE}>
        <header className="mb-6">
          <div className="flex items-start gap-2">
            {/* The headline is this page's h1 — it is what the page is about,
                and it reads as a natural-language search query. */}
            <h1
              className="text-3xl sm:text-4xl font-extrabold leading-tight m-0 flex-1"
              style={{ color: COLORS.ink, letterSpacing: '-1px' }}
            >
              <InlineText text={post.headline} highlight={highlight} id={post.id} />
            </h1>
            {!post.published && <span className="shrink-0 mt-2"><PreviewBadge /></span>}
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs" style={{ color: COLORS.faint }}>
            {date
              ? <time dateTime={isoDate(post.published_at)}>{date}</time>
              : <span>Draft — not published</span>}
            <ShareButton slug={post.slug} />
          </div>
        </header>

        <div className="text-[17px] leading-[1.7]" style={{ color: COLORS.ink }}>
          {/* Footnotes are held back and rendered below the footer, so the
              numbered list sits at the very foot of the page rather than in the
              middle of it. The shared `id` is what keeps the ref/definition
              links connected across that gap. */}
          <RichText text={post.body} id={post.id} hideFootnotes highlight={highlight} />
        </div>

        {post.footer && (
          <div
            className="text-sm leading-relaxed mt-8 pt-4 border-t"
            style={{ color: COLORS.muted, borderColor: COLORS.border }}
          >
            <RichText text={post.footer} id={`${post.id}-footer`} highlight={highlight} />
          </div>
        )}

        <RichTextFootnotes text={post.body} id={post.id} highlight={highlight} />
      </article>

      {/* Real links between posts: reader flow, and the internal link graph a
          crawler needs to reach every post from any one of them. */}
      {(newer || older) && (
        <nav className="flex items-stretch gap-3 text-sm mt-12">
          <Adjacent post={older} direction="older" onSelect={onSelect} />
          <Adjacent post={newer} direction="newer" onSelect={onSelect} />
        </nav>
      )}
    </Container>
  )
}

function ShareButton({ slug }: { slug: string | null }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = slug ? `${window.location.origin}${pathForPost(slug)}` : window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked — no-op rather than an error the reader can't act on */ }
  }
  return (
    <button
      type="button"
      onClick={share}
      title="Copy a link to this post"
      className="cursor-pointer bg-transparent border-none p-0 text-xs underline"
      style={{ color: 'inherit', font: 'inherit' }}
    >
      {copied ? 'Link copied' : 'Share'}
    </button>
  )
}

function Adjacent({ post, direction, onSelect }: {
  post: Post | null
  direction: 'older' | 'newer'
  onSelect: (slug: string) => void
}) {
  const isNewer = direction === 'newer'
  if (!post?.slug) return <span className="flex-1" />
  const slug = post.slug
  return (
    <a
      href={pathForPost(slug)}
      onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onSelect(slug) } }}
      className={`flex-1 rounded-lg border px-4 py-3 no-underline transition-colors hover:bg-gray-50 ${isNewer ? 'text-right' : ''}`}
      style={{ borderColor: COLORS.border }}
    >
      <span className="block text-[11px] uppercase mb-1" style={{ color: COLORS.accent, letterSpacing: '1.5px' }}>
        {isNewer ? 'Newer' : 'Older'}
      </span>
      <span className="block leading-snug font-semibold" style={{ color: COLORS.ink }}>
        <InlineText text={post.headline} id={`adj-${post.id}`} />
      </span>
    </a>
  )
}

function NotFound({ onNavigate }: { onNavigate: (page: 'blog') => void }) {
  // Same reasoning as NotFoundPage: the server answers 200 for every path, so
  // without this a stale or mistyped post URL becomes an indexable near-duplicate.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,follow'
    document.head.appendChild(meta)
    return () => { meta.remove() }
  }, [])

  return (
    <Container className="py-16">
      <h1 className="text-xl font-bold mb-2" style={{ color: COLORS.ink }}>Post not found</h1>
      <p className="text-sm mb-4" style={{ color: COLORS.muted }}>
        This post may have been renamed, or isn&rsquo;t published yet.
      </p>
      <a
        href={pathForPage('blog')}
        onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('blog') } }}
        className="text-sm font-semibold no-underline hover:underline"
        style={{ color: COLORS.accent }}
      >
        &larr; All posts
      </a>
    </Container>
  )
}
