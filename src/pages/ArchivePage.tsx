import { useMemo } from 'react'
import { COLORS } from '../constants/colors'
import { Container } from '../components/Container'
import { PageLoading } from '../components/PageLoading'
import { useArchiveIndex, type ArchiveSummary } from '../hooks/useArchive'
import { formatPostDate, isoDate } from '../lib/dates'
import { pathForArchive, pathForPage, plainClick } from '../lib/routes'

/**
 * The archive index: everything from the old Blogger site, by year.
 *
 * Titles and dates only. 229 rows with an excerpt each is a page nobody scrolls,
 * and the excerpt has two better homes already — the search result, and the post
 * itself. What this page is for is finding a piece you half-remember, and for
 * giving a crawler a link to every one of them from one place.
 */
export function ArchivePage({ onNavigate, onSelect }: {
  onNavigate: (page: 'blog' | 'search') => void
  onSelect: (path: string) => void
}) {
  const { posts, loading } = useArchiveIndex()

  // Newest year first, matching the list. `published_at` is the original date,
  // so the 2000 entry (a backdated post) genuinely does belong at the bottom.
  const years = useMemo(() => {
    const byYear = new Map<string, ArchiveSummary[]>()
    for (const post of posts) {
      const year = post.path.slice(0, 4)
      const list = byYear.get(year)
      if (list) list.push(post)
      else byYear.set(year, [post])
    }
    return [...byYear.entries()]
  }, [posts])

  return (
    <Container className="py-10 sm:py-14">
      <h1
        className="text-3xl sm:text-4xl font-extrabold mb-2"
        style={{ color: COLORS.ink, letterSpacing: '-1px' }}
      >
        Archive
      </h1>
      <p className="text-base mb-4 max-w-2xl" style={{ color: COLORS.muted }}>
        Everything published on the original Chokkablog between 2010 and 2022,
        rehosted here with its original dates. The writing stands as it was — the
        figures in it are of their time.
      </p>
      <p className="text-sm mb-10" style={{ color: COLORS.faint }}>
        Looking for something in particular?{' '}
        <a
          href={pathForPage('search')}
          onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('search') } }}
          className="font-semibold no-underline hover:underline"
          style={{ color: COLORS.accent }}
        >
          Search the whole site
        </a>{' '}
        — it looks through every one of these.
      </p>

      {loading ? <PageLoading /> : (
        <>
          {/* A jump strip rather than a filter: with 13 years and no state, a
              link to an anchor survives Back, sharing and JavaScript being off. */}
          <nav className="flex flex-wrap gap-x-3 gap-y-2 mb-10 pb-6 border-b" style={{ borderColor: COLORS.border }}>
            {years.map(([year, list]) => (
              <a
                key={year}
                href={`#${year}`}
                className="text-sm font-semibold no-underline hover:underline num"
                style={{ color: COLORS.accent }}
              >
                {year}
                <span className="font-normal" style={{ color: COLORS.faint }}> ({list.length})</span>
              </a>
            ))}
          </nav>

          {years.map(([year, list]) => (
            <section key={year} id={year} className="mb-12 scroll-mt-6">
              <h2
                className="text-2xl font-extrabold mb-4 num"
                style={{ color: COLORS.ink, letterSpacing: '-0.5px' }}
              >
                {year}
              </h2>
              <ul className="m-0 p-0 list-none">
                {list.map((post) => <Row key={post.path} post={post} onSelect={onSelect} />)}
              </ul>
            </section>
          ))}
        </>
      )}
    </Container>
  )
}

function Row({ post, onSelect }: { post: ArchiveSummary; onSelect: (path: string) => void }) {
  const href = pathForArchive(post.path)
  return (
    <li className="border-b last:border-b-0" style={{ borderColor: COLORS.border }}>
      <a
        href={href}
        onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onSelect(post.path) } }}
        className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 no-underline group"
      >
        <time
          className="text-xs shrink-0 sm:w-24 num"
          style={{ color: COLORS.faint }}
          dateTime={isoDate(post.published_at)}
        >
          {formatPostDate(post.published_at)}
        </time>
        <span
          className="text-[15px] leading-snug font-semibold group-hover:underline underline-offset-4"
          style={{ color: COLORS.ink }}
        >
          {post.title || 'Untitled'}
        </span>
        {post.comment_count > 0 && (
          <span className="text-xs shrink-0 sm:ml-auto num" style={{ color: COLORS.faint }}>
            {post.comment_count} {post.comment_count === 1 ? 'comment' : 'comments'}
          </span>
        )}
      </a>
    </li>
  )
}
