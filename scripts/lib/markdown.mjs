/**
 * Markdown → HTML and → plain text for the prerendered snapshot.
 *
 * This is NOT a port of src/components/RichText.tsx and does not try to be. The
 * snapshot exists so a client that runs no JavaScript — a social scraper, an LLM
 * retrieval crawler, Bing — reads the same words a person does. It needs correct
 * semantic structure (headings, paragraphs, lists, links, figures) and the right
 * text; it does not need RichText's hover previews, click-to-reveal notes or
 * search highlighting, none of which mean anything without JS. React replaces
 * the whole of #root on hydration, so no browser that got that far ever sees
 * this output.
 *
 * ⚠ `stripMarkdown` here is a TWIN of src/lib/markdownText.ts, and must stay
 * character-identical in behaviour: the same function decides the meta
 * description at build time and the hub excerpt at runtime, and a description
 * that disagrees with the page is worse than either. They are held together by
 * src/__tests__/prerender.markdown.test.ts, which runs both over the same
 * corpus. GERS Explorer grew two copies of this that silently drifted; the test
 * is the thing that stops it happening again here.
 *
 * Kept in plain .mjs so the build script can import it with no compile step.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escape for HTML text content and attribute values alike. */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])
}

/**
 * Markdown → plain text. TWIN OF src/lib/markdownText.ts — see the warning
 * above. Any change here is a change there.
 */
export function stripMarkdown(md) {
  return String(md ?? '')
    // Reveal notes ^[ … ] and traditional markers [^1], with their definitions.
    .replace(/\^\[(?:[^[\]]|\[[^\]]*\])*\]/g, '')
    .replace(/\[\^[^\]]+\]:[^\n]*/g, '')
    .replace(/\[\^[^\]]+\]/g, '')
    // An embed alone on a line is a chart, not prose.
    .replace(/^[ \t]*@\[[^\]]*\]\([^)]*\)[ \t]*$/gm, '')
    .replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1')
    // An image contributes its CAPTION, not its alt.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, text) => {
      const pipe = String(text).indexOf('|')
      return pipe < 0 ? ' ' : ` ${String(text).slice(0, pipe)} `
    })
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    // ⚠ A thematic break is a beat, not words — drop the whole line. Without
    // this `---` survives into an excerpt and a meta description as three
    // hyphens, and it has to come BEFORE the list-bullet rule below: a spaced
    // `- - -` would otherwise be eaten one bullet at a time.
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ' ')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Trim to `max` characters on a word boundary. Search results cut a description
 *  around 160 characters, so overrunning wastes the tail rather than showing it. */
export function clamp(text, max = 155) {
  const t = stripMarkdown(text)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '')}…`
}

/** Only http(s) and site-relative targets are ever emitted. A prerendered page
 *  must not carry a `javascript:` URL into the served HTML, and the author's
 *  Markdown is the one place such a thing could come from. */
const SAFE_HREF = /^(https?:\/\/|\/|#)/i

/** The `#WxH` fragment the uploader appends — see src/lib/postImage.ts. Reading
 *  it back lets the snapshot set width and height, which is what stops a picture
 *  shoving the text below it down the page while it loads. */
function splitImageUrl(raw) {
  const m = String(raw).match(/^(.*)#(\d+)x(\d+)$/)
  return m ? { src: m[1], width: m[2], height: m[3] } : { src: String(raw) }
}

/** `caption|alt` — the visible part leads. Mirrors splitImageText() in
 *  src/lib/postImage.ts. */
function splitImageText(text) {
  const pipe = text.indexOf('|')
  if (pipe < 0) return { caption: null, alt: text }
  const caption = text.slice(0, pipe).trim()
  const alt = text.slice(pipe + 1).trim()
  return { caption: caption || null, alt: alt || caption }
}

function imgTag(text, url) {
  const { src, width, height } = splitImageUrl(url)
  if (!SAFE_HREF.test(src)) return ''
  const { alt } = splitImageText(text)
  const size = width && height ? ` width="${width}" height="${height}"` : ''
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${size} />`
}

/**
 * Inline markup within one line.
 *
 * The input is escaped FIRST, so any HTML in the author's text is inert by the
 * time tags are introduced below. Nothing here can emit markup that came from
 * the source.
 *
 * Notes are handled the way a reader experiences them: a `[^1]` marker becomes a
 * plain superscript (its definition is rendered as a list by markdownToHtml),
 * and a `^[anchor|note]` reveal keeps its visible ANCHOR and drops the note —
 * the note's text is not in the page until someone clicks, so putting it in the
 * snapshot would be indexing something a reader cannot see.
 */
function inline(text) {
  let s = escapeHtml(text)
  // Reveal notes: keep the anchor half, drop a note that has no anchor.
  s = s.replace(/\^\[(?:[^[\]]|\[[^\]]*\])*\]/g, (m) => {
    const body = m.slice(2, -1)
    const pipe = body.indexOf('|')
    return pipe < 0 ? '' : body.slice(0, pipe)
  })
  s = s.replace(/\[\^([^\]]+)\]/g, (_m, label) => `<sup>${label}</sup>`)
  // Underline is the one raw tag our authors write; it survived escaping as text.
  s = s.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>')
  // Pictures. Mid-sentence, RichText renders a plain inline <img>; so does this.
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) => imgTag(alt, url))
  // A chart embedded mid-sentence cannot be an iframe there, so RichText
  // degrades it to a link to the chart. Same here — and for a crawler an iframe
  // was never going to be anything else.
  s = s.replace(/@\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, label, url) =>
    SAFE_HREF.test(url) ? `<a href="${escapeHtml(url)}">${label || 'Chart'}</a>` : label)
  s = s.replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_m, label, href) =>
    SAFE_HREF.test(href) ? `<a href="${escapeHtml(href)}">${label}</a>` : label)
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  return s
}

/** A picture or a chart alone on a line is a block, exactly as in RichText. */
const BLOCK_IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/
const BLOCK_EMBED = /^@\[([^\]]*)\]\(([^)\s]+)\)$/
/** "[^1]: the note text" — a footnote's definition. */
const FOOTNOTE_DEF = /^\s*\[\^([^\]]+)\]:\s*(.*)$/

/**
 * Render the Markdown subset our authors write: #-headings, >-quotations,
 * -/1. lists (one level of nesting, by two-space indent), paragraphs, pictures,
 * chart embeds, footnotes, and the inline marks above.
 *
 * @param {string} md
 * @param {{ headingLevel?: number }} [opts] the level a top-level `#` becomes,
 *   so prose nested under a page's h1 does not emit a competing one.
 */
export function markdownToHtml(md, opts = {}) {
  const base = opts.headingLevel ?? 2
  const src = String(md ?? '').replace(/\r\n?/g, '\n')
  if (!src.trim()) return ''

  const out = []
  const notes = []
  let list = null          // 'ul' | 'ol' | null
  let para = []
  let quote = []

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] }
  }
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null } }
  const flushQuote = () => {
    if (quote.length) { out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`); quote = [] }
  }
  const flushAll = () => { flushPara(); flushList(); flushQuote() }

  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+$/, '')

    if (!line.trim()) { flushAll(); continue }

    const note = line.match(FOOTNOTE_DEF)
    if (note) { flushAll(); notes.push(note[2]); continue }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushAll()
      const level = Math.min(6, base + heading[1].length - 1)
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    const trimmed = line.trim()

    const pic = trimmed.match(BLOCK_IMAGE)
    if (pic) {
      flushAll()
      const img = imgTag(pic[1], pic[2])
      if (img) {
        const { caption } = splitImageText(pic[1])
        out.push(caption
          ? `<figure>${img}<figcaption>${inline(caption)}</figcaption></figure>`
          : `<figure>${img}</figure>`)
      }
      continue
    }

    const chart = trimmed.match(BLOCK_EMBED)
    if (chart) {
      flushAll()
      // The iframe is useless without JS, so the snapshot offers the link the
      // reader would have wanted from it: the chart, on the tool site.
      if (SAFE_HREF.test(chart[2])) {
        out.push(`<p><a href="${escapeHtml(chart[2])}">${inline(chart[1]) || 'Chart'}</a></p>`)
      }
      continue
    }

    // A thematic break. ⚠ Before the list rule, or a spaced `* * *` is read as
    // a bullet; and before `inline()` ever sees it, or `***` is bold-italic.
    // Twin of THEMATIC_BREAK_RE in src/components/RichText.tsx.
    if (/^(?:\s*[-*_]){3,}\s*$/.test(line)) {
      flushPara(); flushList(); flushQuote()
      out.push('<hr />')
      continue
    }

    const bq = line.match(/^\s*>\s?(.*)$/)
    if (bq) { flushPara(); flushList(); quote.push(bq[1]); continue }
    flushQuote()

    const item = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/)
    if (item) {
      flushPara()
      const ordered = /^\s*\d+\./.test(line)
      const want = ordered ? 'ol' : 'ul'
      if (list && list !== want) flushList()
      if (!list) { out.push(`<${want}>`); list = want }
      // Sub-points are flattened rather than nested. A crawler reads the words
      // either way, and one level of <ul> inside an <li> is the only structure
      // this would add.
      out.push(`<li>${inline(item[2])}</li>`)
      continue
    }
    flushList()

    para.push(line.trim())
  }
  flushAll()

  // The definitions ARE prose a reader sees — RichText renders them as a
  // numbered list at the foot of the post — so unlike the reveal notes above
  // they belong in the snapshot.
  if (notes.length) {
    out.push(`<ol>${notes.map((n) => `<li>${inline(n)}</li>`).join('')}</ol>`)
  }
  return out.join('\n')
}
