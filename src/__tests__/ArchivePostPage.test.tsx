import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchivePostPage } from '../pages/ArchivePostPage'

/**
 * One rehosted Blogger post.
 *
 * The body is inserted as HTML, which is the whole design of this section and
 * also the thing that has to be got right exactly once: it is sanitised at
 * import (scripts/import-archive.py), never here. What this file pins is what a
 * reader arriving from a 2015 search result actually sees — that the page says
 * how old it is, that Kevin's note comes before the old prose rather than after
 * it, and that the discussion underneath is presented as finished.
 */

const POST = {
  id: 'a1',
  path: '2015/03/gers-2015',
  title: 'GERS 2015: what it shows',
  html: '<p>The <b>deficit</b> was larger than expected.</p><div class="separator"><img src="https://blogger.googleusercontent.com/x.png" alt="chart"></div>',
  excerpt: 'The deficit was larger than expected.',
  note: 'The current figures are in [GERS 2026](/blog/gers-2026).',
  labels: ['GERS', 'deficit'],
  published_at: '2015-03-11T09:00:00Z',
  original_url: 'https://chokkablog.blogspot.com/2015/03/gers-2015.html',
  comment_count: 3,
  comments: [
    {
      id: 'c1', blogger_id: 'b1', reply_to_blogger_id: null, author_name: 'Drew',
      author_uri: null, html: '<p>Where does the oil figure come from?</p>',
      published_at: '2015-03-11T10:00:00Z',
    },
    {
      id: 'c2', blogger_id: 'b2', reply_to_blogger_id: 'b1', author_name: 'Kevin Hague',
      author_uri: null, html: '<p>Table 3.1.</p>', published_at: '2015-03-11T11:00:00Z',
    },
    {
      id: 'c3', blogger_id: 'b3', reply_to_blogger_id: null, author_name: '',
      author_uri: null, html: '<p>Thanks for writing this.</p>',
      published_at: '2015-03-12T09:00:00Z',
    },
  ],
}

let result: { data: unknown; error: null } = { data: POST, error: null }

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order']) chain[method] = () => chain
  chain.maybeSingle = () => Promise.resolve(result)
  return { supabase: { from: () => chain } }
})

const noop = () => {}
beforeEach(() => { result = { data: POST, error: null } })

describe('ArchivePostPage', () => {
  it('renders the post as the HTML it was written in', async () => {
    render(<ArchivePostPage path={POST.path} onNavigate={noop} />)

    expect(await screen.findByRole('heading', { name: 'GERS 2015: what it shows' })).toBeTruthy()
    // The markup survives — a converted-to-Markdown archive would have lost it.
    expect(document.querySelector('.archive-html b')?.textContent).toBe('deficit')
    expect(document.querySelector('.archive-html img')?.getAttribute('src'))
      .toBe('https://blogger.googleusercontent.com/x.png')
    // Blogger's own centring wrapper is kept, because the CSS depends on it.
    expect(document.querySelector('.archive-html .separator')).toBeTruthy()
  })

  it('says how old it is, before a word of the post', async () => {
    render(<ArchivePostPage path={POST.path} onNavigate={noop} />)

    const banner = await screen.findByText(/From the archive/)
    expect(banner.textContent).toContain('2015')
    // Order matters: the warning has to come before the prose it applies to.
    expect(banner.compareDocumentPosition(document.querySelector('.archive-html')!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('shows the note as Markdown, linking to what replaced it', async () => {
    render(<ArchivePostPage path={POST.path} onNavigate={noop} />)

    const link = await screen.findByRole('link', { name: 'GERS 2026' })
    expect(link.getAttribute('href')).toBe('/blog/gers-2026')
  })

  it('keeps the original date, and credits where it was published', async () => {
    render(<ArchivePostPage path={POST.path} onNavigate={noop} />)

    // Scoped to the header: the comments below carry dates of their own.
    await screen.findByRole('heading', { name: POST.title })
    const stamp = document.querySelector('header time')
    expect(stamp?.textContent).toBe('11 Mar 2015')
    expect(stamp?.getAttribute('datetime')).toBe('2015-03-11')
    expect(screen.getByRole('link', { name: /Originally published on Blogger/ })
      .getAttribute('href')).toBe(POST.original_url)
  })

  it('republishes the discussion, closed, with the author badged', async () => {
    render(<ArchivePostPage path={POST.path} onNavigate={noop} />)

    expect(await screen.findByRole('heading', { name: '3 comments' })).toBeTruthy()
    expect(screen.getByText(/This discussion is closed/)).toBeTruthy()
    expect(screen.getByText('Author')).toBeTruthy()
    // 1,241 of the imported comments were left unsigned.
    expect(screen.getByText('Anonymous')).toBeTruthy()
    // There is no way to add another: the archive carries no form.
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('tells a reader when there is no such post, and keeps it out of the index', async () => {
    result = { data: null, error: null }
    render(<ArchivePostPage path="2015/03/never-existed" onNavigate={noop} />)

    expect(await screen.findByText(/Not in the archive/)).toBeTruthy()
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content'))
      .toBe('noindex,follow')
  })
})
