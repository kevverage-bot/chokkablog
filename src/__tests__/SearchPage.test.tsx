import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchPage } from '../pages/SearchPage'

/**
 * The results page, from the reader's side.
 *
 * Two of these are about links rather than matching, and they are the ones worth
 * having: a result has to be a real anchor carrying the search term, because that
 * is what makes the words light up on the post that comes back, and it is what
 * lets a result be opened in a new tab like any other link. The rest of the
 * matching is covered in postSearch.test.ts, against the function.
 */

const POSTS = [
  {
    id: 'a', slug: 'the-deficit', headline: 'The deficit, explained', short_title: '',
    summary: 'What it measures.', body: 'It measures borrowing, not debt.', footer: '',
    published: true, published_at: '2026-08-02T00:00:00Z',
    created_at: '2026-08-02T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
  },
  {
    id: 'b', slug: 'north-sea', headline: 'North Sea revenue', short_title: '',
    summary: '', body: 'Oil and gas, and what is left of it.', footer: '',
    published: true, published_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  },
]

/** usePosts' one query is a chain ending in an await, so the fake is thenable. */
vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.order = () => chain
  chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve({ data: POSTS, error: null }).then(ok, err)
  return { supabase: { from: () => chain } }
})

const noop = () => {}

/** jest-dom's matchers are not wired up in this project, so the input's value is
 *  read off the element rather than asserted with toHaveValue. */
const box = () => screen.getByLabelText('Search the blog') as HTMLInputElement

beforeEach(() => {
  window.history.replaceState(null, '', '/search')
})

describe('SearchPage', () => {
  it('invites a search rather than listing everything', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} />)

    expect(await screen.findByText(/Type a word or two/)).toBeTruthy()
    expect(screen.queryByText('The deficit, explained')).toBeNull()
  })

  it('searches as the reader types, and says how many matched', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'oil')

    expect(await screen.findByText('North Sea revenue')).toBeTruthy()
    expect(screen.queryByText('The deficit, explained')).toBeNull()
    expect(screen.getByText(/1 post matching/)).toBeTruthy()
  })

  it('marks the matched words in the snippet, so the hit is visible', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'borrowing')

    const mark = await waitFor(() => {
      const el = document.querySelector('mark')
      if (!el) throw new Error('nothing highlighted')
      return el
    })
    expect(mark.textContent).toBe('borrowing')
  })

  it('links each result to its permalink, carrying the term', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'oil')

    const link = await screen.findByRole('link', { name: /North Sea revenue/ })
    // The term rides along in ?q= so the post can mark the words that matched.
    expect(link.getAttribute('href')).toBe('/blog/north-sea?q=oil')
  })

  it('routes a plain click in-app, and leaves a modified one to the browser', async () => {
    const onSelect = vi.fn()
    render(<SearchPage onNavigate={noop} onSelect={onSelect} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'oil')
    const link = await screen.findByRole('link', { name: /North Sea revenue/ })

    // fireEvent rather than userEvent: the modifier has to be on the click event
    // itself, which is what plainClick() reads.
    fireEvent.click(link, { ctrlKey: true })
    expect(onSelect).not.toHaveBeenCalled()

    await userEvent.click(link)
    expect(onSelect).toHaveBeenCalledWith('north-sea', 'oil')
  })

  it('says so, once, when nothing matches', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'unicorns')

    expect(await screen.findByText(/Nothing matches/)).toBeTruthy()
    expect(screen.queryByText(/posts matching/)).toBeNull()
  })

  it('runs the search already when arriving from a shared /search?q= link', async () => {
    window.history.replaceState(null, '', '/search?q=oil')
    render(<SearchPage onNavigate={noop} onSelect={noop} />)

    expect(await screen.findByText('North Sea revenue')).toBeTruthy()
    expect(box().value).toBe('oil')
  })

  it('puts the term in the URL, so a search can be shared or bookmarked', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'north sea')

    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe('/search?q=north%20sea')
    })
  })

  it('clears the box and the URL together', async () => {
    window.history.replaceState(null, '', '/search?q=oil')
    render(<SearchPage onNavigate={noop} onSelect={noop} />)
    await screen.findByText('North Sea revenue')

    await userEvent.click(screen.getByLabelText('Clear search'))

    expect(box().value).toBe('')
    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe('/search')
    })
  })
})
