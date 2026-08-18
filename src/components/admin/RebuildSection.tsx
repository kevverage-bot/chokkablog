import { COLORS } from '../../constants/colors'
import { TopSection } from '../TopSection'
import { usePosts } from '../../hooks/usePosts'
import { useRebuild } from '../../hooks/useRebuild'

/**
 * What the site's search engines and feed readers can see, and how to make it
 * match what its readers can see.
 *
 * ⚠ THE THING THIS SECTION EXISTS TO MAKE VISIBLE: publishing a post does not
 * put it in the sitemap, the RSS feed, or the prerendered HTML that link
 * previews read. All three are written by scripts/prerender.mjs during a BUILD.
 * A post is live for readers the moment it is published, and invisible to
 * everything else until the site is rebuilt — and nothing about the site's
 * appearance would ever tell you that. Hence a section whose whole job is to
 * count what is waiting and offer the one button that clears it.
 */
export function RebuildSection() {
  const { posts, loading } = usePosts()
  const { state, error, rebuild } = useRebuild()

  const builtAt = new Date(__BUILD_TIME__)
  // Published posts only. A draft is not in the sitemap and is not meant to be,
  // so editing one changes nothing a crawler could see.
  const stale = posts.filter((p) => p.published && new Date(p.updated_at) > builtAt)

  return (
    <TopSection
      title="Search & feeds"
      subtitle={stale.length > 0 ? `${stale.length} change${stale.length === 1 ? '' : 's'} not published yet` : 'up to date'}
      defaultOpen={stale.length > 0}
    >
      <p className="text-sm mt-0 mb-3" style={{ color: COLORS.muted }}>
        The sitemap, the RSS feed and each post&rsquo;s share preview are written
        when the site is <em>built</em>, not when a post is published. Readers see
        a new post immediately; Google, feed readers and link previews see it
        after the next build.
      </p>

      <dl className="text-sm mb-4">
        <div className="flex gap-3 py-1">
          <dt className="w-32 shrink-0" style={{ color: COLORS.muted }}>Last built</dt>
          <dd className="m-0" style={{ color: COLORS.ink }}>
            {formatBuilt(builtAt)}
          </dd>
        </div>
        <div className="flex gap-3 py-1">
          <dt className="w-32 shrink-0" style={{ color: COLORS.muted }}>Since then</dt>
          <dd className="m-0" style={{ color: stale.length > 0 ? COLORS.negative : COLORS.positive }}>
            {loading
              ? '…'
              : stale.length === 0
                ? 'Nothing has changed.'
                : `${stale.length} published post${stale.length === 1 ? '' : 's'} changed — not yet in the sitemap or the feed.`}
          </dd>
        </div>
      </dl>

      {stale.length > 0 && (
        <ul className="text-xs list-none p-0 m-0 mb-4 space-y-1" style={{ color: COLORS.muted }}>
          {stale.map((p) => (
            <li key={p.id}>· {p.headline.trim() || 'Untitled'}</li>
          ))}
        </ul>
      )}

      {state === 'queued' ? (
        <p className="text-sm m-0" style={{ color: COLORS.positive }}>
          Build started. It takes a minute or two; reload this page afterwards to
          see the figures above update.
        </p>
      ) : (
        <button
          type="button"
          onClick={rebuild}
          disabled={state === 'working'}
          className="px-4 py-1.5 text-xs font-semibold rounded text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: COLORS.ink }}
        >
          {state === 'working' ? 'Starting…' : 'Rebuild now'}
        </button>
      )}

      {error && (
        <p className="text-sm mt-3 mb-0" style={{ color: COLORS.negative }} role="alert">
          {error}
        </p>
      )}

      <p className="text-[11px] mt-4 mb-0" style={{ color: COLORS.faint }}>
        The site also rebuilds itself every night, so a forgotten click costs a
        day rather than forever. Editing the home page needs a rebuild too — it is
        not counted above.
      </p>
    </TopSection>
  )
}

/** "17 Aug 2026, 14:32 (2 hours ago)". The absolute time answers "which build?";
 *  the relative one answers the question actually being asked. */
function formatBuilt(d: Date): string {
  const absolute = d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 2) return `${absolute} (just now)`
  if (mins < 60) return `${absolute} (${mins} minutes ago)`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${absolute} (${hours} hour${hours === 1 ? '' : 's'} ago)`
  return `${absolute} (${Math.round(hours / 24)} days ago)`
}
