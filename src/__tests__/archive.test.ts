import { describe, it, expect } from 'vitest'
import { PAGE_PATHS, parseRoute, pathForArchive } from '../lib/routes'
import { ARCHIVE_TITLE, STATIC_PAGE_TITLES, archiveTitle } from '../lib/pageTitle'
import * as build from '../../scripts/lib/seo.mjs'
import APP from '../App.tsx?raw'
import NAVBAR from '../components/NavBar.tsx?raw'
import PRERENDER from '../../scripts/prerender.mjs?raw'
import SCHEMA from '../../supabase/008_archive.sql?raw'
import IMPORTER from '../../scripts/import-archive.py?raw'
import vercel from '../../vercel.json'

/**
 * The archive is a migration as much as a section: 229 posts that have been on
 * the open web since 2010, most of what this site ranks for, moving address.
 * The failures worth engineering against are the quiet ones — an old URL that
 * lands on a 404, a page Google is told not to index, a date reset to today, or
 * an import that overwrites the note explaining where a post went.
 */

const OLD = '/2015/03/gers-2015-what-it-shows.html'

describe('the archive is wired up in all four places', () => {
  it('has a path', () => {
    expect(PAGE_PATHS.archive).toBe('/archive')
  })

  it('resolves both the index and one post', () => {
    expect(parseRoute('/archive')).toMatchObject({ page: 'archive', archivePath: null, notFound: false })
    expect(parseRoute('/archive/2015/03/gers-2015')).toMatchObject({
      page: 'archive', archivePath: '2015/03/gers-2015', notFound: false,
    })
  })

  it('accepts the .html form the Blogger redirect will send', () => {
    // The theme can only concatenate, so the extension arrives. vercel.json 308s
    // it away in production; this is what makes the same URL work in dev and if
    // the redirect is ever mistyped.
    expect(parseRoute('/archive/2015/03/gers-2015.html')).toMatchObject({
      page: 'archive', archivePath: '2015/03/gers-2015',
    })
  })

  it('refuses a path that is not Blogger-shaped, rather than querying for it', () => {
    for (const path of ['/archive/gers-2015', '/archive/2015/gers', '/archive/20xx/03/x']) {
      expect(parseRoute(path)).toMatchObject({ page: 'archive', notFound: true })
    }
  })

  it('builds a permalink from the Blogger path', () => {
    expect(pathForArchive('2015/03/gers-2015')).toBe('/archive/2015/03/gers-2015')
  })

  it('has a case in App’s renderer and a link in the nav', () => {
    expect(APP).toMatch(/case 'archive':/)
    expect(APP).toMatch(/<ArchivePostPage/)
    expect(NAVBAR).toMatch(/id: 'archive'/)
  })

  it('is prerendered — index and one page per post', () => {
    expect(PRERENDER).toMatch(/path: '\/archive',/)
    expect(PRERENDER).toMatch(/path: `\/archive\/\$\{a\.path\}`/)
  })
})

describe('every old blogspot address has somewhere to land', () => {
  /** Vercel matches a redirect source against the whole path. */
  const matcher = (source: string) => new RegExp(`^${source}$`)
  const rules = vercel.redirects.map((r) => ({ ...r, re: matcher(r.source) }))
  const firstMatch = (path: string) => rules.find((r) => !r.has && r.re.test(path))

  it('sends a Blogger path on this domain into the archive', () => {
    const hit = firstMatch(OLD)
    expect(hit?.destination).toBe('/archive/$1/$2/$3')
    expect(hit?.permanent).toBe(true)
  })

  it('matches the .html rule before the bare one — order is the behaviour', () => {
    // Both patterns match a path ending .html. If the bare rule came first the
    // extension would survive into the destination and the reader would land on
    // /archive/2015/03/slug.html, which is a different URL from the canonical.
    const html = rules.findIndex((r) => r.source.includes('(.*)\\.html') && r.source.startsWith('/(\\d'))
    const bare = rules.findIndex((r) => r.source === '/(\\d{4})/(\\d{2})/(.*)')
    expect(html).toBeGreaterThan(-1)
    expect(html).toBeLessThan(bare)
  })

  it('takes .html off an /archive URL', () => {
    const hit = firstMatch('/archive/2015/03/gers-2015.html')
    expect(hit?.destination).toBe('/archive/$1')
  })

  it('leaves the rest of the site alone', () => {
    for (const path of ['/blog', '/blog/a-post', '/search', '/archive', '/admin', '/']) {
      const hit = firstMatch(path)
      expect(hit?.destination ?? '').not.toContain('/archive/$')
    }
  })
})

describe('the titles are produced identically on both sides', () => {
  it('agrees on the archive index', () => {
    expect(build.ARCHIVE_TITLE).toBe(ARCHIVE_TITLE)
    expect(build.ARCHIVE_TITLE).toBe(STATIC_PAGE_TITLES.archive)
  })

  for (const title of ['GERS 2015: what it shows', 'Oil & the deficit', 'A "quoted" headline']) {
    it(`agrees on ${JSON.stringify(title)}`, () => {
      expect(build.archiveTitle(title)).toBe(archiveTitle(title))
    })
  }
})

describe('the things a migration silently gets wrong', () => {
  it('keeps the original publication date in the structured data', () => {
    // Republishing 229 posts as if they were written today is the fastest way to
    // lose what they rank for.
    expect(PRERENDER).toMatch(/datePublished: a\.published_at/)
  })

  it('indexes the archive — it is the reason the section exists', () => {
    const block = PRERENDER.slice(PRERENDER.indexOf("path: '/archive',"), PRERENDER.indexOf('// ── sitemap ──'))
    expect(block).not.toMatch(/noindex/)
  })

  it('gives the sitemap a real lastmod per archive post, not the build clock', () => {
    expect(PRERENDER).toMatch(/archive\.map\(\(a\) => \[`\/archive\/\$\{a\.path\}`/)
  })

  it('keeps the archive out of the feed', () => {
    // 229 old posts arriving in a subscriber's reader at once.
    const rss = PRERENDER.slice(PRERENDER.indexOf('// ── RSS ──'), PRERENDER.indexOf('// ── robots ──'))
    expect(rss).not.toMatch(/archive/)
  })

  it('survives the migration not having been run yet', () => {
    // The SQL is applied by hand and the code lands on a push; whichever is
    // second must not take the deploy with it.
    expect(PRERENDER).toMatch(/fetchOptionalTable\(\s*env,\s*'archive_posts'/)
  })

  it('never lets a re-import overwrite the note', () => {
    // The note is the only part of an archive post anyone writes. The importer's
    // ON CONFLICT clause lists every column it may overwrite; `note` must not be
    // among them, in either the generator or the schema's own warning.
    const conflict = IMPORTER.slice(IMPORTER.indexOf('on conflict (blogger_id) do update set'))
    const columns = conflict.slice(0, conflict.indexOf('";'))
    expect(columns).toContain('title = excluded.title')
    expect(columns).not.toContain('note = excluded')
    expect(SCHEMA).toMatch(/note/)
  })

  it('keeps the full-text column to expressions Postgres will actually accept', () => {
    // A generated column may only use IMMUTABLE expressions.
    // `array_to_string(labels, ' ')` is STABLE, and Postgres rejects the whole
    // migration with "generation expression is not immutable" — found by running
    // it. Putting labels back into the index would fail the same way, so this is
    // here to make that fail in a second rather than in the SQL editor.
    const generated = SCHEMA.slice(SCHEMA.indexOf('add column fts'), SCHEMA.indexOf('stored;'))
    expect(generated).not.toMatch(/array_to_string|labels/)
    expect(generated).toMatch(/to_tsvector\('english'/)
  })

  it('reads the archive without the bodies wherever it is a list', () => {
    // A select('*') on a list would put 3.2MB of old HTML on the wire for a page
    // that shows titles.
    expect(SCHEMA).toMatch(/excerpt/)
    expect(PRERENDER).toMatch(/select=path,title,html,excerpt,note,labels,published_at,original_url/)
  })
})
