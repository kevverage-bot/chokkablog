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

const ARCHIVE = [
  {
    path: '2015/03/oil-and-the-deficit', title: 'Oil and the deficit',
    // ⚠ The excerpt deliberately does NOT contain the word the tests search for.
    // That is the bug this whole path exists to fix: the stored excerpt is a
    // fixed opening extract, so a match deep in the post had nothing to show.
    excerpt: 'What the 2015 numbers actually showed.',
    body: 'A long way down the page, Richard Murphy said something about oil.',
    published_at: '2015-03-04T09:00:00Z', labels: ['GERS'], comment_count: 12,
  },
]

/**
 * Both queries are chains ending in an await, so the fake is thenable — and it
 * answers per TABLE, because this page now searches two of them: the blog in the
 * browser, and the archive in Postgres.
 */
vi.mock('../lib/supabase', () => {
  const make = (rows: unknown[]) => {
    let result = rows
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'eq', 'limit']) chain[method] = () => chain
    // Stands in for Postgres full-text search: naive, but term-aware, which is
    // the part the page's behaviour depends on.
    chain.textSearch = (_column: string, query: string) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean)
      result = rows.filter((row) => {
        const hay = JSON.stringify(row).toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      return chain
    }
    chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve({ data: result, error: null }).then(ok, err)
    return chain
  }
  return {
    supabase: {
      from: (table: string) => make(table === 'archive_posts' ? ARCHIVE : POSTS),
      /**
       * Stands in for public.search_archive (supabase/011_archive_search.sql).
       * Two things about the real one that the page's behaviour depends on, and
       * which this therefore reproduces: it returns a snippet cut around the
       * MATCH rather than the stored opening excerpt, and it marks the matched
       * words with sentinels for the browser to turn into <mark> elements.
       */
      rpc: (name: string, args: { q: string; lim?: number }) => {
        if (name !== 'search_archive') throw new Error(`unexpected rpc: ${name}`)
        const words = args.q.toLowerCase().split(/\s+/).filter(Boolean)
        const hits = ARCHIVE
          .filter((row) => {
            const hay = JSON.stringify(row).toLowerCase()
            return words.every((w) => hay.includes(w))
          })
          .map((row) => ({
            ...row,
            excerpt: words.reduce(
              (text, w) => text.replace(new RegExp(`(${w})`, 'gi'), '[hl]$1[/hl]'),
              row.body ?? row.excerpt,
            ),
          }))
        return Promise.resolve({ data: hits, error: null })
      },
    },
  }
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
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)

    expect(await screen.findByText(/Type a word or two/)).toBeTruthy()
    expect(screen.queryByText('The deficit, explained')).toBeNull()
  })

  it('searches as the reader types, and groups what it found', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'gas')

    expect(await screen.findByText('North Sea revenue')).toBeTruthy()
    expect(screen.queryByText('The deficit, explained')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Blog' })).toBeTruthy()
    // Nothing in the archive matched, so the reader is not shown an empty one.
    expect(screen.queryByRole('heading', { name: 'Archive' })).toBeNull()
  })

  it('searches the archive too, under its own heading', async () => {
    // The archive cannot be searched in the browser — 3.2MB of old posts — so
    // it comes back from Postgres a beat later, and the two are kept apart
    // because a 2015 answer and a 2026 answer are different answers.
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'oil')

    // By role, not by text: "Oil" is highlighted, which splits the title across
    // a <mark> and two text nodes.
    const link = await screen.findByRole('link', { name: /Oil and the deficit/ })
    expect(link.getAttribute('href')).toBe('/archive/2015/03/oil-and-the-deficit')
    expect(screen.getByRole('heading', { name: 'Archive' })).toBeTruthy()
  })

  it('opens an archive result in-app', async () => {
    const onSelectArchive = vi.fn()
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={onSelectArchive} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'oil')

    await userEvent.click(await screen.findByRole('link', { name: /Oil and the deficit/ }))
    expect(onSelectArchive).toHaveBeenCalledWith('2015/03/oil-and-the-deficit')
  })

  it('marks the matched words in the snippet, so the hit is visible', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'borrowing')

    const mark = await waitFor(() => {
      const el = document.querySelector('mark')
      if (!el) throw new Error('nothing highlighted')
      return el
    })
    expect(mark.textContent).toBe('borrowing')
  })

  it('links each result to its permalink, carrying the term', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'oil')

    const link = await screen.findByRole('link', { name: /North Sea revenue/ })
    // The term rides along in ?q= so the post can mark the words that matched.
    expect(link.getAttribute('href')).toBe('/blog/north-sea?q=oil')
  })

  it('routes a plain click in-app, and leaves a modified one to the browser', async () => {
    const onSelect = vi.fn()
    render(<SearchPage onNavigate={noop} onSelect={onSelect} onSelectArchive={noop} />)
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
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'unicorns')

    expect(await screen.findByText(/Nothing matches/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Blog' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Archive' })).toBeNull()
  })

  it('runs the search already when arriving from a shared /search?q= link', async () => {
    window.history.replaceState(null, '', '/search?q=oil')
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)

    expect(await screen.findByText('North Sea revenue')).toBeTruthy()
    expect(box().value).toBe('oil')
  })

  it('puts the term in the URL, so a search can be shared or bookmarked', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await userEvent.type(screen.getByLabelText('Search the blog'), 'north sea')

    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe('/search?q=north%20sea')
    })
  })

  it('clears the box and the URL together', async () => {
    window.history.replaceState(null, '', '/search?q=oil')
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await screen.findByText('North Sea revenue')

    await userEvent.click(screen.getByLabelText('Clear search'))

    expect(box().value).toBe('')
    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe('/search')
    })
  })
})


/**
 * THE SNIPPET.
 *
 * Searching the archive for "Murphy" returned "GERS 2021 - So What?" — correctly
 * — and showed the reader its opening paragraph about the Chief Statistician,
 * with nothing marked. The match was 21,911 characters into a 25,814 character
 * post, and the list only ever fetched the stored 240-character excerpt. These
 * pin the fix: the snippet comes from the match, and the marks come from
 * Postgres rather than from the reader's literal words.
 */
describe('archive snippets show why the post matched', () => {
  it('shows the text around the match, not the post\'s opening lines', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await userEvent.type(box(), 'Murphy')

    expect(await screen.findByText(/Richard/)).toBeTruthy()
    // The stored excerpt, which contains no "Murphy", must not be what is shown.
    expect(screen.queryByText(/the 2015 numbers actually showed/)).toBeNull()
  })

  it('marks the matched words, and marks nothing else', async () => {
    render(<SearchPage onNavigate={noop} onSelect={noop} onSelectArchive={noop} />)
    await userEvent.type(box(), 'Murphy')

    const marks = await screen.findAllByText('Murphy', { selector: 'mark' })
    expect(marks.length).toBeGreaterThan(0)
    // The sentinels are an implementation detail of the wire format. If one
    // reaches the page as literal text, the split failed and the reader sees
    // "[hl]" in their results.
    expect(document.body.textContent).not.toContain('[hl]')
    expect(document.body.textContent).not.toContain('[/hl]')
  })
})
