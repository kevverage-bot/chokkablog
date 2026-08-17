import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { HomePage } from '../pages/HomePage'
import { FALLBACK_HOME_CONTENT, FALLBACK_TOOLS } from '../constants/home'

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
function fakeTable(result: { data: unknown; error: { message: string } | null }) {
  const chain = {
    select: () => chain,
    order: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  }
  return chain
}

const results: Record<string, { data: unknown; error: { message: string } | null }> = {}

vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => fakeTable(results[table]) },
}))

const ERROR = { data: null, error: { message: 'relation "public.home_content" does not exist' } }

beforeEach(() => {
  results.home_content = ERROR
  results.tools = ERROR
})

describe('HomePage', () => {
  it('falls back to the built-in wording when the tables are not there yet', async () => {
    render(<HomePage />)

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

    render(<HomePage />)

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

    render(<HomePage />)

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

    render(<HomePage />)

    expect(await screen.findByText('Work in progress')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
