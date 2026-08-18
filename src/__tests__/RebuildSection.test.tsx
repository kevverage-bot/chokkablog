import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RebuildSection } from '../components/admin/RebuildSection'
import type { Post } from '../hooks/usePosts'

/**
 * The section exists to answer one question — "is anything published but not yet
 * visible to Google?" — so the thing worth testing is which posts it counts.
 *
 * Getting it wrong in either direction is bad in a quiet way: counting drafts
 * cries wolf until the number is ignored, and missing a published edit means the
 * page says "up to date" while the sitemap is stale.
 */

const posts: Post[] = []

vi.mock('../hooks/usePosts', () => ({
  usePosts: () => ({ posts, loading: false }),
}))
vi.mock('../hooks/useRebuild', () => ({
  useRebuild: () => ({ state: 'idle', error: null, rebuild: vi.fn() }),
}))

/** __BUILD_TIME__ is injected by vite.config.ts; vitest reads the same config,
 *  so it is the moment this run started. Posts are dated either side of it. */
const BUILD = new Date(__BUILD_TIME__).getTime()
const before = new Date(BUILD - 60_000).toISOString()
const after = new Date(BUILD + 60_000).toISOString()

const post = (over: Partial<Post>): Post => ({
  id: Math.random().toString(), slug: 's', headline: 'A post', short_title: '',
  summary: '', body: '', footer: '', published: true, published_at: before,
  created_at: before, updated_at: before, ...over,
})

beforeEach(() => { posts.length = 0 })

describe('RebuildSection', () => {
  it('says nothing is waiting when the build is newer than every post', () => {
    posts.push(post({ updated_at: before }))
    render(<RebuildSection />)
    expect(screen.getByText(/up to date/)).toBeTruthy()
  })

  it('counts a published post edited since the build', () => {
    posts.push(post({ headline: 'Edited after the build', updated_at: after }))
    render(<RebuildSection />)
    expect(screen.getByText(/1 change not published yet/)).toBeTruthy()
  })

  it('ignores a DRAFT edited since the build', () => {
    // A draft is not in the sitemap and is not meant to be, so editing one
    // changes nothing a crawler could see. Counting it would cry wolf.
    posts.push(post({ published: false, updated_at: after }))
    render(<RebuildSection />)
    expect(screen.getByText(/up to date/)).toBeTruthy()
  })

  it('names what is waiting, so it is obvious what a rebuild would publish', () => {
    posts.push(post({ headline: 'The stale one', updated_at: after }))
    posts.push(post({ headline: 'The fresh one', updated_at: before }))
    render(<RebuildSection />)
    expect(screen.getByText(/2 changes? not published yet|1 change not published yet/)).toBeTruthy()
    expect(screen.getByText(/The stale one/)).toBeTruthy()
    expect(screen.queryByText(/· The fresh one/)).toBeNull()
  })
})
