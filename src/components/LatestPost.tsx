import { COLORS } from '../constants/colors'
import { InlineText } from './RichText'
import { usePosts } from '../hooks/usePosts'
import { postExcerpt } from '../lib/postExcerpt'
import { formatPostDate, isoDate } from '../lib/dates'
import { pathForPage, pathForPost, plainClick } from '../lib/routes'
import { newestPublished } from '../lib/latestPost'

/**
 * The newest post, on the front page.
 *
 * ⚠ PUBLISHED ONLY, and that filter is the whole reason this is not a one-line
 * `posts[0]`. RLS returns unpublished rows TO AN ADMIN (see usePosts), so on
 * Kevin's own browser the newest row is frequently a half-written draft. The
 * hub shows those deliberately, badged; the front page must not, because "the
 * latest post" is a claim about what has been published, and the one person who
 * would see the wrong answer is the one person who cannot spot it — it looks
 * right to him and to nobody else.
 *
 * Renders nothing at all until there is something to show: no skeleton, no
 * "coming soon" — the page above it already does that job, and a placeholder for
 * a post that does not exist is worse than the silence.
 *
 * A single post today. `featured` is the obvious next step and is deliberately
 * NOT anticipated here: it needs a column, an Admin control and an editorial
 * decision about what happens when a featured post is older than the newest one.
 * Guessing at that now would cost more than writing it later.
 */
export function LatestPost({ onSelect, onNavigate }: {
  onSelect: (slug: string) => void
  onNavigate: (page: 'blog') => void
}) {
  const { posts, loading } = usePosts()
  if (loading) return null

  const latest = newestPublished(posts)
  if (!latest?.slug) return null

  const excerpt = postExcerpt(latest, 180)
  const date = formatPostDate(latest.published_at)
  const href = pathForPost(latest.slug)

  return (
    <section className="mt-10" aria-labelledby="latest-post">
      <h2
        id="latest-post"
        className="text-[11px] font-semibold uppercase mb-3"
        style={{ color: COLORS.accent, letterSpacing: '2px' }}
      >
        Latest post
      </h2>

      <article
        className="rounded-lg border p-5"
        style={{ borderColor: COLORS.border, background: COLORS.hoverBg }}
      >
        <h3 className="m-0 mb-2">
          <a
            href={href}
            onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onSelect(latest.slug!) } }}
            className="no-underline hover:underline underline-offset-4"
          >
            <span
              className="text-xl sm:text-2xl font-bold leading-snug"
              style={{ color: COLORS.ink, letterSpacing: '-0.4px' }}
            >
              <InlineText text={latest.headline || 'Untitled'} id={latest.id} />
            </span>
          </a>
        </h3>

        {excerpt && (
          <p className="text-[15px] leading-relaxed m-0 mb-3" style={{ color: COLORS.muted }}>
            {excerpt}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs" style={{ color: COLORS.faint }}>
          {date && <time dateTime={isoDate(latest.published_at)}>{date}</time>}
          <a
            href={pathForPage('blog')}
            onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('blog') } }}
            style={{ color: COLORS.accent }}
          >
            All posts &rarr;
          </a>
        </div>
      </article>
    </section>
  )
}
