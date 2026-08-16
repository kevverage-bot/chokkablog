import { COLORS } from '../constants/colors'
import { TOOLS, type Tool } from '../constants/tools'
import { Container } from '../components/Container'

/**
 * The home page.
 *
 * This is the holding page's content, carried over so the branch never renders
 * less than what is already live at chokkablog.com. The real home page — recent
 * writing, sections, the lot — is specified separately and replaces the body of
 * this file; the tools grid below is expected to survive into it.
 */
export function HomePage() {
  return (
    <Container className="py-12 sm:py-16">
      {/* Stays until there is writing to read. The tools below are live and
          worth visiting today, so this says "the blog is coming", not "the site
          is empty" — remove it when /insights has posts on it. */}
      <span
        className="inline-block text-[11px] font-semibold uppercase text-white rounded mb-8"
        style={{ background: COLORS.accent, letterSpacing: '4px', padding: '8px 24px' }}
      >
        Coming soon
      </span>

      <p
        className="text-lg sm:text-xl leading-relaxed max-w-lg"
        style={{ color: COLORS.muted }}
      >
        Data-driven analysis of Scotland&rsquo;s economy and the case being made
        for Scottish independence.
      </p>

      <section className="mt-14">
        <h2
          className="text-[11px] font-semibold uppercase mb-4"
          style={{ color: COLORS.accent, letterSpacing: '2px' }}
        >
          Tools
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((tool) => <ToolCard key={tool.name} tool={tool} />)}
        </div>
      </section>
    </Container>
  )
}

function ToolCard({ tool }: { tool: Tool }) {
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
      {tool.wip ? (
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
