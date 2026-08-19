import type { Post } from '../hooks/usePosts'

/**
 * The most recently published post, or null.
 *
 * Sorted by `published_at` rather than trusting the order the hub wants: that
 * order is the hub's editorial arrangement, and a post published today after
 * being drafted last month must be the latest whatever position it holds there.
 * A published post always has the stamp — the database refuses otherwise — so a
 * missing one sorts last rather than crashing the front page.
 */
export function newestPublished(posts: Post[]): Post | null {
  const live = posts.filter((p) => p.published && p.slug)
  if (live.length === 0) return null
  return live.reduce((newest, p) =>
    (p.published_at ?? '') > (newest.published_at ?? '') ? p : newest)
}
