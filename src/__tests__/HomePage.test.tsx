import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HomePage } from '../pages/HomePage'
import { FALLBACK_HOME_CONTENT, FALLBACK_TOOLS } from '../constants/home'
import { newestPublished } from '../components/LatestPost'
import type { Post } from '../hooks/usePosts'

/**
 * The home page reads its words from the database, which leaves it with two
 * failure modes that look identical on screen and mean opposite things:
 *
 *   the read FAILED  — the migration has not been run yet, so show the wording
 *                      compiled into the bundle rather than a blank front page;
 *   the read WORKED and came back empty — someone emptied it in Admin, so show
 *                      nothing, and do not helpfully restore the old text.
 *
 * Getting those the wrong way round means either a blank home page on deploy or
 * a "Coming soon" badge that will not come off. Hence this file.
 */

/** Both queries the page makes are chains ending in either `.maybeSingle()` or
 *  an await, so the fake has to be both callable and thenable. */
function fakeTable(result: { data: unknown; error: { message: string } | null } | undefined) {
  // A table this file has not seeded behaves as "not there yet", which is what
  // every component on the page is built to survive. Without this, adding a new
  // read anywhere under HomePage breaks these tests with a destructuring error
  // that says nothing about what actually changed.
  result ??= { data: null, error: { message: 'relation does not exist' } }
  const chain = {
    select: () => chain,
    order: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  }
  return chain
}

const noop = () => {}

const results: Record<string, { data: unknown; error: { message: string } | null }> = {}

vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => fakeTable(results[table]) },
}))

const ERROR = { data: null, error: { message: 'relation "public.home_content" does not exist' } }

beforeEach(() => {
  results.home_content = ERROR
  results.tools = ERROR
  // The sign-up box reads its wording too, and falls back when it cannot.
  results.subscribe_content = ERROR
  results.insights = { data: [], error: null }
})

/** Only the fields the front page reads; the rest of Post is irrelevant here. */
const post = (over: Partial<Post>): Post => ({
  id: 'p', slug: 'a-post', headline: 'A post', short_title: '', summary: 'What it says.',
  body: '', footer: '', published: true, published_at: '2026-08-01T00:00:00Z',
  created_at: '2026-08-01T00:00:00Z', ...over,
} as Post)

describe('HomePage', () => {
  it('falls back to the built-in wording when the tables are not there yet', async () => {
    render(<HomePage onSelect={noop} onNavigate={noop} />)

    expect(await screen.findByText(FALLBACK_HOME_CONTENT.badge)).toBeTruthy()
    expect(screen.getByText(FALLBACK_HOME_CONTENT.intro)).toBeTruthy()
    for (const tool of FALLBACK_TOOLS) {
      expect(screen.getByText(tool.name)).toBeTruthy()
    }
  })

  it('renders what the database says, not what the bundle says', async () => {
    results.home_content = {
      data: { badge: '', intro: 'Now with actual writing.', tools_heading: 'The tools' },
      error: null,
    }
    results.tools = {
      data: [{ id: '1', name: 'CfD Mapping', description: 'Contracts', url: 'https://x.test', wip: false, sort_order: 0 }],
      error: null,
    }

    render(<HomePage onSelect={noop} onNavigate={noop} />)

    expect(await screen.findByText('Now with actual writing.')).toBeTruthy()
    expect(screen.getByText('The tools')).toBeTruthy()
    expect(screen.getByText('CfD Mapping')).toBeTruthy()
    // The badge was emptied deliberately. It must not come back.
    expect(screen.queryByText(FALLBACK_HOME_CONTENT.badge)).toBeNull()
    // Nor may a tool that was removed.
    expect(screen.queryByText('GERS Explorer')).toBeNull()
  })

  it('hides the tools grid entirely when the table is empty on purpose', async () => {
    results.home_content = {
      data: { badge: '', intro: 'Just the words.', tools_heading: 'Tools' },
      error: null,
    }
    results.tools = { data: [], error: null }

    render(<HomePage onSelect={noop} onNavigate={noop} />)

    await waitFor(() => expect(screen.getByText('Just the words.')).toBeTruthy())
    expect(screen.queryByText('Tools')).toBeNull()
    expect(screen.queryByText(FALLBACK_TOOLS[0].name)).toBeNull()
  })

  it('shows a tool with no link as text rather than a dead end', async () => {
    results.home_content = { data: { badge: '', intro: '', tools_heading: '' }, error: null }
    results.tools = {
      data: [{ id: '1', name: 'Half-built', description: '', url: '', wip: true, sort_order: 0 }],
      error: null,
    }

    render(<HomePage onSelect={noop} onNavigate={noop} />)

    expect(await screen.findByText('Work in progress')).toBeTruthy()
    // Scoped to the tools grid. The sign-up box below carries a link to the
    // privacy notice, which is not a dead end and not what this is about.
    const card = screen.getByText('Half-built').closest('div')!
    expect(card.querySelector('a')).toBeNull()
  })
})


/**
 * The latest-post block.
 *
 * ⚠ The trap it exists to avoid: RLS returns UNPUBLISHED rows to an admin, so on
 * Kevin's own browser the newest row is often a half-written draft. Announcing
 * one as "the latest post" on the front page would look right to him and wrong
 * to everybody else — the worst shape a bug can have.
 */
describe('newestPublished', () => {
  it('ignores drafts, however recent', () => {
    const latest = newestPublished([
      post({ id: 'draft', headline: 'Half-written', published: false, published_at: null }),
      post({ id: 'live', headline: 'Published', published_at: '2026-07-01T00:00:00Z' }),
    ])
    expect(latest?.id).toBe('live')
  })

  it('ignores a published post with no address to link to', () => {
    expect(newestPublished([post({ slug: null })])).toBeNull()
  })

  it('sorts by when it was published, not by the order it was given', () => {
    // The hub's order is an editorial arrangement; a post published today after
    // being drafted last month is still the latest.
    const latest = newestPublished([
      post({ id: 'older', published_at: '2026-01-01T00:00:00Z' }),
      post({ id: 'newer', published_at: '2026-08-18T00:00:00Z' }),
      post({ id: 'middle', published_at: '2026-04-01T00:00:00Z' }),
    ])
    expect(latest?.id).toBe('newer')
  })

  it('is null when nothing has been published yet', () => {
    expect(newestPublished([])).toBeNull()
    expect(newestPublished([post({ published: false })])).toBeNull()
  })
})

describe('HomePage latest post', () => {
  it('links the newest published post, and never a draft', async () => {
    results.insights = {
      data: [
        post({ id: 'd', slug: 'secret', headline: 'Unfinished thought', published: false, published_at: null }),
        post({ id: 'l', slug: 'gers-2026', headline: 'GERS 2026', published_at: '2026-08-18T00:00:00Z' }),
      ],
      error: null,
    }

    render(<HomePage onSelect={noop} onNavigate={noop} />)

    const link = await screen.findByRole('link', { name: 'GERS 2026' })
    expect(link.getAttribute('href')).toBe('/blog/gers-2026')
    expect(screen.queryByText('Unfinished thought')).toBeNull()
  })

  it('shows nothing at all before there is a post', async () => {
    render(<HomePage onSelect={noop} onNavigate={noop} />)

    // The badge proves the page rendered; the absent heading proves the block
    // stayed away rather than announcing an empty section.
    expect(await screen.findByText(FALLBACK_HOME_CONTENT.badge)).toBeTruthy()
    expect(screen.queryByText('Latest post')).toBeNull()
  })
})
