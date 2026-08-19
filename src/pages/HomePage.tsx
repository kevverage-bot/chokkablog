import { COLORS } from '../constants/colors'
import { FALLBACK_HOME_CONTENT, FALLBACK_TOOLS } from '../constants/home'
import { Container } from '../components/Container'
import { SubscribeBox } from '../components/SubscribeBox'
import { LatestPost } from '../components/LatestPost'
import { PageLoading } from '../components/PageLoading'
import { RichText } from '../components/RichText'
import { HOME_TITLE } from '../lib/pageTitle'
import { useHomeContent } from '../hooks/useHomeContent'
import { useTools, type ToolCard as ToolCardData } from '../hooks/useTools'

/**
 * The home page.
 *
 * Every word here is content, not code: the badge, the standfirst and the tools
 * grid are rows in the database, editable in Admin (supabase/005_home.sql). The
 * page's job is to lay them out.
 *
 * If either read fails — the deploy that lands before the migration is run —
 * the page falls back to the wording compiled into the bundle rather than
 * showing an empty front page. A read that *succeeds* and returns nothing is
 * rendered as nothing, because that was somebody's decision in Admin.
 */
export function HomePage({ onSelect, onNavigate }: {
  /** Open a post. Passed down to the latest-post block, which is the only thing
   *  on this page that links to one. */
  onSelect: (slug: string) => void
  onNavigate: (page: 'blog') => void
}) {
  const { content, loading: loadingText, failed: textFailed } = useHomeContent()
  const { tools, loading: loadingTools, failed: toolsFailed } = useTools()

  // Waiting on both, so the page arrives in one piece rather than reflowing as
  // the second query lands.
  if (loadingText || loadingTools) return <PageLoading label="" />

  const { badge, intro, tools_heading } = textFailed || !content
    ? FALLBACK_HOME_CONTENT
    : content
  const cards: ToolCardData[] = toolsFailed ? FALLBACK_TOOLS : tools

  return (
    <Container className="py-12 sm:py-16">
      {/* Visually hidden, and not decoration: the design puts the wordmark where
          a heading would go, which left this page with no h1 for a crawler or a
          screen reader to take its subject from. Same string as the tab title
          and the prerendered snapshot — see HOME_TITLE. */}
      <h1 className="sr-only">{HOME_TITLE}</h1>

      {/* Comes off by being emptied in Admin, not by editing this file — which
          is the point: it says "the blog is coming", and the day that stops
          being true should not need a deploy. */}
      {badge.trim() && (
        <span
          className="inline-block text-[11px] font-semibold uppercase text-white rounded mb-8"
          style={{ background: COLORS.accent, letterSpacing: '4px', padding: '8px 24px' }}
        >
          {badge}
        </span>
      )}

      {intro.trim() && (
        <div
          className="text-lg sm:text-xl leading-relaxed max-w-lg"
          style={{ color: COLORS.muted }}
        >
          <RichText text={intro} id="home-intro" />
        </div>
      )}

      {/* Between the standfirst and the sign-up: what has been written, then the
          offer to be told about the next one. Renders nothing until there is a
          published post, so it costs the front page nothing while the blog is
          still empty. */}
      <LatestPost onSelect={onSelect} onNavigate={onNavigate} />

      {/* ⚠ ABOVE the tools grid, not below it. The grid is four outbound links to
          other sites; anything under it is being offered to a reader who has
          already been given somewhere else to go. `prominent` gives it the
          accent frame, because here it is competing for attention rather than
          sitting at the end of something already read. */}
      <SubscribeBox prominent />

      {cards.length > 0 && (
        <section className="mt-14">
          {tools_heading.trim() && (
            <h2
              className="text-[11px] font-semibold uppercase mb-4"
              style={{ color: COLORS.accent, letterSpacing: '2px' }}
            >
              {tools_heading}
            </h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((tool) => <ToolCard key={tool.name} tool={tool} />)}
          </div>
        </section>
      )}
    </Container>
  )
}

function ToolCard({ tool }: { tool: ToolCardData }) {
  return (
    <div
      className="rounded-lg border p-4 flex flex-col"
      style={{ borderColor: COLORS.border }}
    >
      <div className="font-bold text-[15px]" style={{ color: COLORS.ink }}>
        {tool.name}
      </div>
      <div className="text-[13px] mt-1 mb-3 flex-1" style={{ color: COLORS.muted }}>
        {tool.description}
      </div>
      {tool.wip || !tool.url ? (
        // Text, not a link: a tool that isn't ready shouldn't be a dead end.
        <span className="text-[13px]" style={{ color: COLORS.faint }}>
          Work in progress
        </span>
      ) : (
        <a
          href={tool.url}
          target="_blank"
          rel="noopener"
          className="text-[13px] font-semibold no-underline hover:underline"
          style={{ color: COLORS.accent }}
        >
          Explore &rarr;
        </a>
      )}
    </div>
  )
}
