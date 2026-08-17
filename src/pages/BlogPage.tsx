import { COLORS } from '../constants/colors'
import { Container } from '../components/Container'
import { PageLoading } from '../components/PageLoading'
import { InlineText } from '../components/RichText'
import { PreviewBadge } from '../components/AdminPreview'
import { PREVIEW_OUTLINE } from '../constants/colors'
import { usePosts, type Post } from '../hooks/usePosts'
import { postExcerpt } from '../lib/postExcerpt'
import { formatPostDate, isoDate } from '../lib/dates'
import { pathForPost, plainClick } from '../lib/routes'

/**
 * The hub: every post, newest first.
 *
 * Reverse chronological rather than a curated order — a blog's organising
 * principle is time. (GERS Explorer orders its insights by argument instead, and
 * drags section separators in among them, because there the pieces build on each
 * other. That does not apply here.)
 *
 * Drafts appear for an admin only, outlined and badged, because RLS returns them
 * to no one else. They sort to the top, which is where the author is working.
 */
export function BlogPage({ onSelect }: { onSelect: (slug: string) => void }) {
  const { posts, loading } = usePosts()

  if (loading) return <PageLoading />

  return (
    <Container className="py-10 sm:py-14">
      <h1
        className="text-3xl sm:text-4xl font-extrabold mb-2"
        style={{ color: COLORS.ink, letterSpacing: '-1px' }}
      >
        Blog
      </h1>
      <p className="text-base mb-10 max-w-xl" style={{ color: COLORS.muted }}>
        Analysis of Scotland&rsquo;s economy, and of the arguments made about it.
      </p>

      {posts.length === 0 ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>
          Nothing published yet.
        </p>
      ) : (
        <div className="space-y-8">
          {posts.map((post) => <PostCard key={post.id} post={post} onSelect={onSelect} />)}
        </div>
      )}
    </Container>
  )
}

function PostCard({ post, onSelect }: { post: Post; onSelect: (slug: string) => void }) {
  const excerpt = postExcerpt(post)
  const date = formatPostDate(post.published_at)
  const draft = !post.published

  // A draft with no slug has no page to link to yet. Render it as plain text
  // rather than a link that would 404 on the author's own hub.
  const href = post.slug ? pathForPost(post.slug) : null

  const heading = (
    <span className="text-xl sm:text-2xl font-bold leading-snug" style={{ color: COLORS.ink, letterSpacing: '-0.4px' }}>
      <InlineText text={post.headline || 'Untitled'} id={post.id} />
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
              onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onSelect(post.slug!) } }}
              className="no-underline hover:underline underline-offset-4"
            >
              {heading}
            </a>
          ) : heading}
        </h2>
        {draft && <span className="shrink-0 mt-1"><PreviewBadge /></span>}
      </div>

      {excerpt && (
        <p className="text-[15px] leading-relaxed mb-3 max-w-2xl" style={{ color: COLORS.muted }}>
          {excerpt}
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
