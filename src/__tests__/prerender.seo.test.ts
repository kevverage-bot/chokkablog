import { describe, it, expect } from 'vitest'
import {
  SITE, HOME_TITLE, AUTHOR, STATIC_PAGE_TITLES, plainTitle, postTitle,
} from '../lib/pageTitle'
import { postExcerpt } from '../lib/postExcerpt'
import * as build from '../../scripts/lib/seo.mjs'
// The real deploy config, imported rather than re-typed: a test that asserts
// against its own copy of the redirects proves nothing about the ones Vercel
// reads.
import vercel from '../../vercel.json'

/**
 * Every title on this site is produced twice: once by the prerenderer into the
 * served HTML, once by src/lib/pageTitle.ts when the app navigates in the
 * browser. This file is what stops the two from drifting.
 *
 * When they drift, the symptom is small and awful: the tab title changes the
 * moment a reader refreshes, and the title Google indexed is not the title the
 * page shows. Both files carry a warning pointing here; this is the thing that
 * enforces it.
 */

const HEADLINES: [string, string?][] = [
  ['What the GERS figures actually show about the deficit', undefined],
  ['A **bold** claim about *spending*', undefined],
  ['A long headline that would be cut in a tab', 'Short one'],
  ['Headline with a [link](https://x.test) in it', ''],
  ['Chokkablog 2.0', '   '],
  ['<u>Underlined</u> headline', undefined],
]

describe('the prerenderer and the app name pages identically', () => {
  it('agrees on the site name', () => {
    expect(build.SITE).toBe(SITE)
  })

  it('agrees on the home page title, which is also its h1', () => {
    expect(build.HOME_TITLE).toBe(HOME_TITLE)
  })

  it('agrees on the blog hub title', () => {
    expect(build.BLOG_TITLE).toBe(STATIC_PAGE_TITLES.blog)
  })

  it('agrees on who writes here', () => {
    // The app signs an author's reply to a comment with this name; the
    // prerenderer publishes it as the Article's author. A reply signed with one
    // name while the structured data claims another reads as a fake.
    expect(build.AUTHOR).toBe(AUTHOR)
  })

  for (const [headline, short] of HEADLINES) {
    it(`agrees on the title for ${JSON.stringify(headline.slice(0, 40))}`, () => {
      expect(build.postTitle(headline, short)).toBe(postTitle(headline, short))
    })
  }

  for (const [headline] of HEADLINES) {
    it(`agrees on plain text for ${JSON.stringify(headline.slice(0, 40))}`, () => {
      expect(build.plainTitle(headline)).toBe(plainTitle(headline))
    })
  }
})

describe('descriptions come from the same field the hub excerpt does', () => {
  // The LENGTHS differ on purpose — a search result cuts around 160 characters,
  // the hub has room for 220 — so this checks the precedence rather than the
  // string: a written summary wins, and the body is the fallback.
  it('prefers a written summary', () => {
    const post = { summary: 'The written summary.', body: 'The opening of the body.' }
    expect(build.postDescription(post)).toContain('The written summary')
    expect(postExcerpt(post)).toContain('The written summary')
  })

  it('falls back to the body when there is no summary', () => {
    const post = { summary: '', body: 'The opening of the body.' }
    expect(build.postDescription(post)).toContain('the body')
    expect(postExcerpt(post)).toContain('the body')
  })

  it('is empty for a post with neither', () => {
    expect(build.postDescription({ summary: '', body: '' })).toBe('')
  })
})

describe('the canonical origin', () => {
  it('is the apex, and vercel.json redirects www to it', () => {
    // Both hosts served 200 before this redirect existed, which is two indexable
    // copies of every page. The canonical tag alone does not fix that; the
    // redirect does, and it has to name the same host this constant does.
    expect(build.ORIGIN).toBe('https://chokkablog.com')
    const wwwRule = vercel.redirects.find((r) => r.has?.some(
      (h) => h.type === 'host' && h.value.startsWith('www.'),
    ))
    expect(wwwRule).toBeTruthy()
    expect(wwwRule?.destination).toContain(build.ORIGIN)
    expect(wwwRule?.permanent).toBe(true)
  })

  it('still redirects the old /insights paths', () => {
    // The section moved to /blog with one post already published. If these ever
    // come out, that post's shared links break.
    const sources = vercel.redirects.map((r) => r.source)
    expect(sources).toContain('/insights')
    expect(sources).toContain('/insights/:slug')
  })
})
