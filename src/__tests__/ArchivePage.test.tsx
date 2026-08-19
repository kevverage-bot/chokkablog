import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArchivePage } from '../pages/ArchivePage'

/**
 * The archive index, and the one thing about it that is not obvious.
 *
 * The list arrives ordered by `published_at` and is grouped into years as it is
 * walked, so the grouping key MUST be the field it was ordered by. Grouping by
 * the year in the URL instead — which is what shipped, briefly — puts the
 * headings out of order the moment the two disagree. They disagree on three of
 * the 229 real posts, because Blogger fixes a post's path when it is first
 * published and the date was edited afterwards.
 */

const POSTS = [
  { path: '2022/11/renewables', title: 'Renewables', excerpt: '', published_at: '2022-11-03T17:19:00Z', labels: [], comment_count: 4 },
  // The live example: a /2019/ URL, published in 2022.
  { path: '2019/02/independence-by-gaslight', title: 'Independence by Gaslight', excerpt: '', published_at: '2022-02-12T22:26:00Z', labels: [], comment_count: 17 },
  { path: '2021/12/dwp-functions', title: 'DWP functions', excerpt: '', published_at: '2021-12-19T22:09:00Z', labels: [], comment_count: 0 },
]

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.order = () => chain
  chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve({ data: POSTS, error: null }).then(ok, err)
  return { supabase: { from: () => chain } }
})

const noop = () => {}

describe('ArchivePage', () => {
  it('groups by the year it publishes, in order, whatever the URL says', async () => {
    render(<ArchivePage onNavigate={noop} onSelect={noop} />)
    await screen.findByRole('heading', { name: '2022' })

    const years = [...document.querySelectorAll('section[id] h2')].map((h) => h.textContent)
    expect(years).toEqual(['2022', '2021'])

    // The /2019/ post belongs under 2022, where its date puts it and where the
    // date printed beside it says it is.
    const section = document.getElementById('2022')!
    expect(section.textContent).toContain('Independence by Gaslight')
    expect(section.textContent).toContain('12 Feb 2022')
  })

  it('links each post to its permalink, which keeps the URL’s own year', async () => {
    render(<ArchivePage onNavigate={noop} onSelect={noop} />)

    const link = await screen.findByRole('link', { name: /Independence by Gaslight/ })
    // The address is Blogger's, untouched — that is what makes the old links map.
    expect(link.getAttribute('href')).toBe('/archive/2019/02/independence-by-gaslight')
  })

  it('offers a jump link per year, counted', async () => {
    render(<ArchivePage onNavigate={noop} onSelect={noop} />)

    const jump = await screen.findByRole('link', { name: /^2022/ })
    expect(jump.getAttribute('href')).toBe('#2022')
    expect(jump.textContent).toContain('(2)')
  })
})
