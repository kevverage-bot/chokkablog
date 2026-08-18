#!/usr/bin/env node
/**
 * Prerender the content pages after `vite build`, and write the sitemap, the
 * feed and robots.txt.
 *
 * WHY THIS EXISTS
 * The app is a client-rendered SPA, so the served HTML is an empty shell: a
 * title and a <div id="root">. Google renders JavaScript, but in a deferred
 * second pass. Bing renders it poorly. Social scrapers (X, Facebook, LinkedIn,
 * WhatsApp, Slack) and LLM retrieval crawlers run none at all — they read the
 * shell, find nothing, and leave. Every shared link previews as a bare URL, and
 * a blog whose whole point is being read is invisible to everything that finds
 * things. This is the phase the rest of the site was built to make possible.
 *
 * WHAT IT DOES
 * For each route it writes dist/<route>/index.html: the same bundle and the same
 * shell, plus a real <title>, description, canonical, Open Graph / Twitter card,
 * JSON-LD, and a semantic snapshot of that page's prose inside #root. React
 * discards and replaces #root on hydration, so a browser sees the live app
 * exactly as before; only a client that runs no JS ever sees the snapshot. It is
 * the same content either way, served to everyone, with no user-agent sniffing —
 * so this is prerendering, not cloaking.
 *
 * FRESHNESS
 * The snapshot is fixed at build time. A post published or edited in Admin is
 * live for people immediately (the SPA reads the database) and reaches the
 * snapshot on the next deploy. That staleness is the accepted cost of having no
 * server, and it is why the catch-all rewrite in vercel.json still has to answer
 * 200 for a slug this build has never heard of.
 *
 * FAILURE
 * If the content fetch fails this exits non-zero and takes the deploy with it.
 * That is deliberate: Vercel keeps the previous deployment live, so a failed
 * build is a no-op, whereas quietly shipping the empty shell would silently undo
 * everything above with nothing to notice it by.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { markdownToHtml, stripMarkdown, clamp, escapeHtml } from './lib/markdown.mjs'
import {
  ORIGIN, SITE, AUTHOR, TWITTER, HOME_TITLE, BLOG_TITLE, SEARCH_TITLE,
  plainTitle, postTitle, postDescription,
} from './lib/seo.mjs'

const DIST = 'dist'

/** The share card. Not committed yet — rasterising text needs a font engine the
 *  Node build hasn't got, so this is a file to be drawn once and dropped into
 *  public/img/. Until it exists the OG tags leave the image out entirely rather
 *  than pointing at a 404, which some scrapers cache as "no card, ever". */
const OG_IMAGE_PATH = '/img/og-default.png'

// ── Environment ─────────────────────────────────────────────────────────────
function loadEnv() {
  let url = process.env.VITE_SUPABASE_URL
  let key = process.env.VITE_SUPABASE_ANON_KEY
  if ((!url || !key) && existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const v = m[2].replace(/^['"]|['"]$/g, '')
      if (m[1] === 'VITE_SUPABASE_URL') url ??= v
      else key ??= v
    }
  }
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are required to prerender.')
  }
  return { url, key }
}

/**
 * Read a table with the ANON key — the same key the browser uses, so RLS applies
 * exactly as it does for a visitor.
 *
 * That is the safety property that matters here: unpublished posts are filtered
 * by the database, not by this script, so there is no way for a draft to be
 * prerendered into a public file by an oversight in the code below.
 */
async function fetchTable(env, table, query = 'select=*') {
  const res = await fetch(`${env.url}/rest/v1/${table}?${query}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
  })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  const rows = await res.json()
  if (!Array.isArray(rows)) {
    throw new Error(`${table}: expected rows, got ${JSON.stringify(rows).slice(0, 200)}`)
  }
  return rows
}

// ── Head ────────────────────────────────────────────────────────────────────
/**
 * @param {{path:string,title:string,description:string,type?:string,
 *          published?:string,modified?:string,noindex?:boolean,
 *          jsonLd?:object[]}} p
 */
function head(p, hasCard) {
  const url = `${ORIGIN}${p.path}`
  const tags = [
    `<title>${escapeHtml(p.title)}</title>`,
    `<meta name="description" content="${escapeHtml(p.description)}" />`,
    p.noindex
      ? '<meta name="robots" content="noindex,follow" />'
      : '<meta name="robots" content="index,follow,max-image-preview:large" />',
    // The reader's `?q=` search term (Phase 5) makes an unbounded number of URLs
    // for the same page; the canonical collapses them to one.
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="${p.type ?? 'website'}" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:locale" content="en_GB" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(p.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(p.description)}" />`,
    `<meta name="twitter:card" content="${hasCard ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:site" content="${TWITTER}" />`,
    `<meta name="twitter:title" content="${escapeHtml(p.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(p.description)}" />`,
  ]
  if (hasCard) {
    tags.push(`<meta property="og:image" content="${ORIGIN}${OG_IMAGE_PATH}" />`)
    // The card is the same on every page and carries the wordmark and the
    // tagline as type, so this is what it says — not "logo".
    tags.push(`<meta property="og:image:alt" content="${escapeHtml(HOME_TITLE)}" />`)
    tags.push(`<meta name="twitter:image" content="${ORIGIN}${OG_IMAGE_PATH}" />`)
  }
  if (p.type === 'article') {
    if (p.published) tags.push(`<meta property="article:published_time" content="${escapeHtml(p.published)}" />`)
    if (p.modified) tags.push(`<meta property="article:modified_time" content="${escapeHtml(p.modified)}" />`)
    tags.push(`<meta property="article:author" content="${escapeHtml(AUTHOR)}" />`)
  }

  // The snapshot is briefly visible: main.tsx awaits the SSO handoff before
  // createRoot() clears #root. Tailwind's preflight has already stripped the
  // default margins by then, so without this it flashes as a wall of jammed
  // text. Styling it (rather than hiding it) also keeps it plainly indexable —
  // display:none content is discounted. Colours are the palette in
  // src/constants/colors.ts.
  tags.push('<style>'
    + '#root>main{max-width:46rem;margin:0 auto;padding:2rem 1.25rem;'
    + 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a1a;line-height:1.7}'
    + '#root>main h1{font-size:1.9rem;line-height:1.2;letter-spacing:-1px;margin:0 0 .5rem}'
    + '#root>main h2{font-size:1.3rem;margin:1.75rem 0 .5rem}'
    + '#root>main h3{font-size:1.05rem;margin:1.5rem 0 .25rem}'
    + '#root>main p{margin:0 0 .9rem}'
    + '#root>main ul,#root>main ol{margin:0 0 .9rem;padding-left:1.25rem}'
    + '#root>main blockquote{margin:0 0 .9rem;padding-left:.9rem;border-left:2px solid #e8e8e8;color:#666}'
    + '#root>main figure{margin:1.5rem 0}'
    + '#root>main img{max-width:100%;height:auto}'
    + '#root>main figcaption{font-size:.85rem;color:#666;margin-top:.4rem}'
    + '#root>main a{color:#D85A30}'
    + '#root>main time{font-size:.8rem;color:#999}'
    + '</style>')

  for (const ld of p.jsonLd ?? []) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`)
  }
  return tags.join('\n    ')
}

// ── Page writer ─────────────────────────────────────────────────────────────
const SEO_START = '<!--seo:start-->'
const SEO_END = '<!--seo:end-->'
const SHELL_TITLE = `<title>${SITE}</title>`

/**
 * Return the pristine shell, whether or not `html` has already been prerendered.
 *
 * Without this the script is only correct on a freshly built dist: run it twice
 * and it reads its own output as the template, `<div id="root"></div>` no longer
 * matches, and every page silently keeps the first page's body while still
 * getting its own title. Idempotence is cheaper than remembering not to.
 *
 * The `<div id="root">` match is non-greedy to the first `</div>`, which is only
 * safe because a snapshot never contains a div — asserted on write.
 */
function normaliseShell(html) {
  return html
    .replace(new RegExp(`${SEO_START}[\\s\\S]*?${SEO_END}`), SHELL_TITLE)
    .replace(/<div id="root">[\s\S]*?<\/div>/, '<div id="root"></div>')
}

function makeWriter(template, hasCard) {
  const written = []
  return {
    written,
    write(p, bodyHtml) {
      const body = bodyHtml ?? ''
      // normaliseShell's root regex stops at the first </div>, so a snapshot
      // containing one would leave debris behind on a re-run.
      if (body.includes('<div')) {
        throw new Error(`prerender: ${p.path} snapshot contains a <div>; snapshots must not`)
      }
      const html = template
        .replace(/<title>[^<]*<\/title>/, `${SEO_START}${head(p, hasCard)}${SEO_END}`)
        .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
      if (!html.includes(SEO_START)) {
        throw new Error('prerender: no <title> in the built shell to anchor the head tags to')
      }
      if (!html.includes(`<div id="root">${body}</div>`)) {
        throw new Error('prerender: #root not found in the built shell')
      }
      const file = p.path === '/' ? join(DIST, 'index.html') : join(DIST, p.path, 'index.html')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, html)
      written.push(p)
    },
  }
}

/** The snapshot body: a heading, then the prose. Deliberately plain — this is
 *  read, not looked at, and it is replaced the moment React mounts. */
function snapshot({ h1, meta, intro, sections = [] }) {
  const parts = [`<h1>${escapeHtml(h1)}</h1>`]
  if (meta) parts.push(meta)
  if (intro) parts.push(`<p>${escapeHtml(intro)}</p>`)
  for (const s of sections) {
    if (s?.heading) parts.push(`<h2>${escapeHtml(s.heading)}</h2>`)
    if (s?.html) parts.push(s.html)
  }
  return `<main>${parts.join('\n')}</main>`
}

/** RFC 822, which is what RSS requires — not ISO 8601. */
function rfc822(iso) {
  return new Date(iso).toUTCString()
}

/** "17 Aug 2026". Twin of formatPostDate() in src/lib/dates.ts, and fixed to
 *  en-GB for the reason given there: the date is part of the page's text, so the
 *  snapshot and the app have to render it identically. */
const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** The `<time>` element for a post's date, or '' for one that has none. */
function timeTag(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `<p><time datetime="${iso.slice(0, 10)}">${escapeHtml(DATE_FORMAT.format(d))}</time></p>`
}

// ── Build ───────────────────────────────────────────────────────────────────
async function main() {
  const env = loadEnv()
  const templatePath = join(DIST, 'index.html')
  if (!existsSync(templatePath)) throw new Error(`${templatePath} not found — run vite build first.`)
  const template = normaliseShell(readFileSync(templatePath, 'utf8'))
  const hasCard = existsSync(join(DIST, OG_IMAGE_PATH.replace(/^\//, '')))

  // `insights` is the table; the section it feeds is the blog. See the note at
  // the top of src/hooks/usePosts.ts for why the name stayed behind.
  const [postRows, homeRows, toolRows] = await Promise.all([
    fetchTable(env, 'insights', 'select=*&order=published_at.desc.nullslast'),
    fetchTable(env, 'home_content', 'select=badge,intro,tools_heading'),
    fetchTable(env, 'tools', 'select=name,description,url,wip&order=sort_order.asc'),
  ])

  // The anon key means RLS has already excluded drafts, so everything here is
  // public by construction. The slug filter is about pages, not privacy: a draft
  // an admin has published without an address cannot have a URL to write.
  const posts = postRows.filter((p) => p.slug && p.published)
  const home = homeRows[0] ?? { badge: '', intro: '', tools_heading: 'Tools' }
  const w = makeWriter(template, hasCard)

  const publisher = {
    '@type': 'Organization',
    name: SITE,
    url: ORIGIN,
  }
  const author = { '@type': 'Person', name: AUTHOR }

  // ── Home ──
  const toolList = toolRows.length
    ? `<ul>${toolRows.map((t) => {
        const label = escapeHtml(t.name)
        const desc = t.description ? ` — ${escapeHtml(t.description)}` : ''
        return t.wip || !t.url
          ? `<li>${label}${desc} (work in progress)</li>`
          : `<li><a href="${escapeHtml(t.url)}">${label}</a>${desc}</li>`
      }).join('\n')}</ul>`
    : ''

  w.write({
    path: '/',
    title: HOME_TITLE,
    description: clamp(home.intro) || `Data-driven analysis of Scotland's economy, by ${AUTHOR}.`,
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: ORIGIN, publisher },
      // A blog's home page is the blog. Declaring it makes the posts below it
      // legible as one body of work rather than a set of unrelated pages.
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: SITE,
        url: ORIGIN,
        description: clamp(home.intro),
        author,
        publisher,
        blogPost: posts.slice(0, 20).map((p) => ({
          '@type': 'BlogPosting',
          headline: plainTitle(p.headline),
          url: `${ORIGIN}/blog/${p.slug}`,
          datePublished: p.published_at,
        })),
      },
    ],
  }, snapshot({
    h1: HOME_TITLE,
    intro: stripMarkdown(home.intro),
    sections: [
      { html: `<p><a href="/blog">Read the blog</a></p>` },
      toolList ? { heading: home.tools_heading || 'Tools', html: toolList } : null,
    ].filter(Boolean),
  }))

  // ── The blog hub ──
  const hubList = posts.length
    ? posts.map((p) => {
        const date = timeTag(p.published_at)
        return `<h2><a href="/blog/${p.slug}">${escapeHtml(plainTitle(p.headline))}</a></h2>\n${date}<p>${escapeHtml(clamp(p.summary || p.body, 220))}</p>`
      }).join('\n')
    : '<p>Nothing published yet.</p>'

  w.write({
    path: '/blog',
    title: BLOG_TITLE,
    description: clamp(`Analysis of Scotland's economy, and of the arguments made about it — ${posts.length} post${posts.length === 1 ? '' : 's'} by ${AUTHOR}.`),
    jsonLd: [{
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: `Blog | ${SITE}`,
      url: `${ORIGIN}/blog`,
      author,
      publisher,
      blogPost: posts.map((p) => ({
        '@type': 'BlogPosting',
        headline: plainTitle(p.headline),
        url: `${ORIGIN}/blog/${p.slug}`,
        datePublished: p.published_at,
      })),
    }],
  }, snapshot({
    h1: 'Blog',
    intro: "Analysis of Scotland's economy, and of the arguments made about it.",
    sections: [{ html: hubList }],
  }))

  // ── Search ──
  // Written for the same reason as any other page — a title, a description and
  // something in #root instead of an empty shell — but NOINDEX, deliberately.
  // A results page is one thin page per query: an unbounded set of URLs whose
  // content is a rearrangement of pages that are already indexed on their own.
  // Google asks not to be given them, and `noindex` also keeps this out of the
  // sitemap below, which is generated from the indexable pages only.
  //
  // The snapshot carries no results, and could not: the search runs in the
  // browser over the posts it loads (see src/lib/postSearch.ts). `follow` is
  // kept so the link out of here still counts.
  w.write({
    path: '/search',
    title: SEARCH_TITLE,
    description: `Search every post on ${SITE} by keyword.`,
    noindex: true,
  }, snapshot({
    h1: 'Search',
    intro: 'Every post, by keyword. Put "quotation marks" around words to match them as a phrase.',
    sections: [{ html: '<p><a href="/blog">All posts</a></p>' }],
  }))

  // ── One page per post ──
  for (const p of posts) {
    const headline = plainTitle(p.headline)
    const description = postDescription(p) || headline
    const url = `${ORIGIN}/blog/${p.slug}`
    w.write({
      path: `/blog/${p.slug}`,
      title: postTitle(p.headline, p.short_title),
      description,
      type: 'article',
      published: p.published_at ?? undefined,
      modified: p.updated_at ?? undefined,
      jsonLd: [{
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline,
        description,
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        datePublished: p.published_at,
        dateModified: p.updated_at,
        author,
        publisher,
        isPartOf: { '@type': 'Blog', name: SITE, url: `${ORIGIN}/blog` },
      }],
    }, snapshot({
      h1: headline,
      meta: timeTag(p.published_at),
      sections: [
        { html: markdownToHtml(p.body) },
        p.footer ? { html: markdownToHtml(p.footer) } : null,
        { html: '<p><a href="/blog">All posts</a></p>' },
      ].filter(Boolean),
    }))
  }

  // ── sitemap ──
  // Generated from what was actually written, so it cannot drift from the routes
  // that exist. `lastmod` comes from the row, not from the build clock: a
  // rebuild that changed nothing must not tell a crawler everything is new.
  const lastmodOf = new Map(posts.map((p) => [`/blog/${p.slug}`, (p.updated_at ?? p.published_at ?? '').slice(0, 10)]))
  const newest = posts[0]?.updated_at?.slice(0, 10)
  const indexable = w.written.filter((p) => !p.noindex)
  const urls = indexable.map((p) => {
    const lastmod = lastmodOf.get(p.path) ?? newest
    return `  <url><loc>${ORIGIN}${p.path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`
  }).join('\n')
  writeFileSync(join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)

  // ── RSS ──
  // A blog without a feed is a blog nobody can follow. Full text goes in
  // content:encoded (the same HTML as the snapshot) so a reader app shows the
  // post rather than a teaser and a click-through.
  const items = posts.map((p) => {
    const url = `${ORIGIN}/blog/${p.slug}`
    const body = markdownToHtml(p.body) + (p.footer ? `\n${markdownToHtml(p.footer)}` : '')
    return [
      '    <item>',
      `      <title>${escapeHtml(plainTitle(p.headline))}</title>`,
      `      <link>${url}</link>`,
      // isPermaLink is the default, but saying it makes the guid's stability
      // explicit: it is the slug, which is frozen once published.
      `      <guid isPermaLink="true">${url}</guid>`,
      p.published_at ? `      <pubDate>${rfc822(p.published_at)}</pubDate>` : '',
      `      <description>${escapeHtml(postDescription(p) || plainTitle(p.headline))}</description>`,
      `      <content:encoded><![CDATA[${body.replace(/]]>/g, ']]&gt;')}]]></content:encoded>`,
      '    </item>',
    ].filter(Boolean).join('\n')
  }).join('\n')

  writeFileSync(join(DIST, 'rss.xml'), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    `    <title>${SITE}</title>`,
    `    <link>${ORIGIN}/blog</link>`,
    `    <description>${escapeHtml(clamp(home.intro) || `Data-driven analysis of Scotland's economy, by ${AUTHOR}.`)}</description>`,
    '    <language>en-GB</language>',
    `    <atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml" />`,
    // The newest post's timestamp, not now(): a rebuild is not a publication.
    posts[0]?.published_at ? `    <lastBuildDate>${rfc822(posts[0].published_at)}</lastBuildDate>` : '',
    items,
    '  </channel>',
    '</rss>',
    '',
  ].filter(Boolean).join('\n'))

  // ── robots ──
  // Written here rather than kept in public/, so the Sitemap line cannot name a
  // file this script did not write.
  writeFileSync(join(DIST, 'robots.txt'), [
    'User-agent: *',
    'Allow: /',
    '',
    '# Nothing here is secret — the admin gate and RLS do the actual work. These',
    '# are simply not pages anyone should arrive at from a search result.',
    'Disallow: /admin',
    'Disallow: /login',
    '# The old holding page, kept so the branch never rendered less than what was',
    '# live. Reachable, but not a page to be found by.',
    'Disallow: /coming-soon.html',
    '',
    `Sitemap: ${ORIGIN}/sitemap.xml`,
    '',
  ].join('\n'))

  if (!hasCard) {
    console.warn(
      `\n  No share card at public${OG_IMAGE_PATH} — link previews will be text-only.`
      + '\n  Add a 1200×630 PNG there and every page picks it up on the next build.\n',
    )
  }
  if (posts.length === 0) {
    console.warn('\n  No published posts with slugs — the hub, sitemap and feed are empty.\n')
  }

  console.log(
    `prerendered ${w.written.length} pages — ${posts.length} post${posts.length === 1 ? '' : 's'}, `
    + `sitemap lists ${indexable.length}, rss.xml has ${posts.length}`,
  )
}

main().catch((err) => {
  console.error('\nPrerender failed — the deploy is being stopped on purpose.')
  console.error("Shipping the empty shell would silently undo the site's entire search presence.\n")
  console.error(err)
  process.exit(1)
})
