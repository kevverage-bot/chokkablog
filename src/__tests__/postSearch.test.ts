import { describe, it, expect } from 'vitest'
import { searchPosts } from '../lib/postSearch'
import { tokenize } from '../lib/search'
import type { Post } from '../hooks/usePosts'

/**
 * What the search box promises a reader, in the two ways it can quietly break:
 *
 *   the RULE   — every word has to match, so a second word narrows the list. Flip
 *                this to OR and a two-word query returns most of the blog, with
 *                the good hit somewhere in the middle of it;
 *   the ORDER  — a post whose HEADLINE says the thing outranks one that mentions
 *                it once in passing. Lose the weighting and the ranking silently
 *                becomes "whatever order the rows arrived in".
 *
 * Both look like a working search from the outside, which is why they are pinned
 * here rather than left to a glance at the page.
 */

let n = 0
function post(fields: Partial<Post>): Post {
  n += 1
  return {
    id: `id-${n}`,
    slug: `post-${n}`,
    headline: '',
    short_title: '',
    summary: '',
    body: '',
    footer: '',
    published: true,
    published_at: `2026-08-0${n}T00:00:00Z`,
    created_at: `2026-08-0${n}T00:00:00Z`,
    updated_at: `2026-08-0${n}T00:00:00Z`,
    ...fields,
  }
}

const find = (posts: Post[], q: string) =>
  searchPosts(posts, tokenize(q)).map((h) => h.post.slug)

describe('the matching rule', () => {
  const posts = [
    post({ slug: 'deficit', headline: 'The deficit', body: 'Revenue and spending.' }),
    post({ slug: 'north-sea', headline: 'North Sea revenue', body: 'Oil and gas.' }),
  ]

  it('finds a post by a word in its body as well as its headline', () => {
    expect(find(posts, 'oil')).toEqual(['north-sea'])
    expect(find(posts, 'spending')).toEqual(['deficit'])
  })

  it('narrows as words are added, rather than widening', () => {
    // Both posts contain "revenue". Only one contains "gas" as well.
    expect(find(posts, 'revenue')).toHaveLength(2)
    expect(find(posts, 'revenue gas')).toEqual(['north-sea'])
  })

  it('returns nothing when one of the words is absent everywhere', () => {
    expect(find(posts, 'revenue unicorns')).toEqual([])
  })

  it('returns nothing for an empty query rather than everything', () => {
    // The page relies on this: an empty box must not render the whole blog as
    // "results".
    expect(searchPosts(posts, tokenize('   '))).toEqual([])
  })

  it('matches a quoted phrase only where the words are adjacent', () => {
    const list = [
      post({ slug: 'adjacent', body: 'The north sea produces less each year.' }),
      post({ slug: 'apart', body: 'The north of the country, and the sea beyond it.' }),
    ]
    expect(find(list, '"north sea"')).toEqual(['adjacent'])
    // Unquoted, both match — the words are simply present in each.
    expect(find(list, 'north sea').sort()).toEqual(['adjacent', 'apart'])
  })

  it('is insensitive to which apostrophe either side used', () => {
    // A phone types the curly one. The post was written with the ASCII one.
    const list = [post({ slug: 'scotland', headline: "Scotland's deficit" })]
    expect(find(list, 'Scotland’s')).toEqual(['scotland'])
  })

  it('sees through the Markdown a headline carries', () => {
    // "A **bold** claim" has ** between the words, so an unstripped haystack
    // fails on the phrase a reader can plainly see on the page.
    const list = [post({ slug: 'bold', headline: 'A **bold** claim about spending' })]
    expect(find(list, '"bold claim"')).toEqual(['bold'])
  })

  it('searches the footer too — sources and caveats are content', () => {
    const list = [post({ slug: 'sourced', footer: 'Source: GERS 2024-25, table 3.' })]
    expect(find(list, 'GERS')).toEqual(['sourced'])
  })
})

describe('the order results come back in', () => {
  it('puts a headline match above a summary match above a body mention', () => {
    const posts = [
      post({ slug: 'body', body: 'A passing mention of the deficit.' }),
      post({ slug: 'summary', summary: 'What the deficit actually measures.' }),
      post({ slug: 'headline', headline: 'The deficit, explained' }),
    ]
    expect(find(posts, 'deficit')).toEqual(['headline', 'summary', 'body'])
  })

  it('breaks a tie by keeping the order it was given — newest first', () => {
    // usePosts returns newest first, and the sort is stable, so two posts that
    // match equally strongly come back in date order.
    const posts = [
      post({ slug: 'newer', headline: 'The deficit' }),
      post({ slug: 'older', headline: 'The deficit' }),
    ]
    expect(find(posts, 'deficit')).toEqual(['newer', 'older'])
  })
})

describe('the snippet under each result', () => {
  it('is centred on the match, in the author’s own punctuation', () => {
    const long = `${'padding words '.repeat(20)}the north sea produces less each year${' more padding'.repeat(20)}`
    const [hit] = searchPosts([post({ body: long })], tokenize('north sea'))
    expect(hit.snippet).toContain('north sea')
    expect(hit.snippet.startsWith('…')).toBe(true)
    expect(hit.snippet.endsWith('…')).toBe(true)
  })

  it('shows no Markdown syntax', () => {
    const [hit] = searchPosts(
      [post({ body: 'A [linked](https://x.test) claim about **spending**.' })],
      tokenize('claim'),
    )
    expect(hit.snippet).toBe('A linked claim about spending.')
  })

  it('falls back to the opening prose when the match was in the headline alone', () => {
    // A result with nothing under it reads as a rendering fault.
    const [hit] = searchPosts(
      [post({ headline: 'The deficit, explained', body: 'It measures borrowing, not debt.' })],
      tokenize('deficit'),
    )
    expect(hit.snippet).toBe('It measures borrowing, not debt.')
  })

  it('leads with the written summary where there is one', () => {
    const [hit] = searchPosts(
      [post({ headline: 'The deficit', summary: 'The short version.', body: 'The long version.' })],
      tokenize('deficit'),
    )
    expect(hit.snippet.startsWith('The short version.')).toBe(true)
  })
})

describe('drafts', () => {
  it('are searched like anything else in the list', () => {
    // Nothing filters them here on purpose: RLS decided what came back from the
    // database, so a draft is in the array only when the reader is its author.
    // Filtering by `published` in this file would hide the author's own drafts
    // from the author, and duplicate a decision the database already made.
    const list = [post({ slug: 'draft', headline: 'An unfinished thought', published: false, published_at: null })]
    expect(find(list, 'unfinished')).toEqual(['draft'])
  })
})
