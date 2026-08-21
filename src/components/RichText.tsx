import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { COLORS } from '../constants/colors'
import { emitHighlighted } from '../lib/highlight'
import { PostImage } from './PostImage'
import { splitImageText } from '../lib/postImage'
import { EmbedFrame } from './EmbedFrame'

/**
 * A very small, dependency-free Markdown renderer for the text written in Admin
 * — a post's body and footer. It supports exactly the formatting the editor
 * toolbar can produce: **bold**, *italic*, ***both***, <u>underline</u>,
 * [links](url), `code`, bulleted/numbered lists (indent a point by two spaces to
 * make it a sub-point), "# " headings, "> " quotations, and two kinds of note:
 *
 *   [^1]            traditional footnote — a superscript number that previews the
 *                   note on hover and, on click, jumps to a numbered list below
 *                   the text; define with a line "[^1]: the note text".
 *   ^[note]         inline click-to-reveal note. Renders a small ⓘ marker; the
 *                   text after an optional "|" is the note, the part before is a
 *                   visible dotted-underline anchor:
 *                   ^[Barnett formula|The mechanism that…]
 *
 * ⚠ THE SECURITY PROPERTY, which any change here must preserve: every token is
 * rendered to a React element, and plain strings are only ever rendered as text.
 * Nothing is injected as HTML — there is no dangerouslySetInnerHTML, and so no
 * XSS surface and no sanitizer dependency. Underline has no Markdown of its own,
 * so <u>…</u> is borrowed for it, and it is matched as a token like any other
 * rather than passed through. Any other tag stays literal text.
 *
 * Plain text is valid Markdown, so text written before any of this existed
 * renders unchanged.
 *
 * Pictures and charts:
 *
 *   ![alt](url)              a picture. Standard Markdown, and behaves as
 *                            standard: alt text, no caption.
 *   ![caption|alt](url)      the same with a visible caption. The visible part
 *                            comes first, matching ^[anchor|note].
 *   @[title](url)            an interactive chart from one of the tool sites,
 *                            embedded in an iframe.
 *
 * And a thematic break — `---`, `***` or `___` alone on a line — which renders
 * as a centred dinkus rather than a rule across the column. See the note where
 * it is rendered for why it is drawn that way.
 *
 * On a line of its own each becomes a block — a <figure>, or a framed embed —
 * with the width of the text. A picture written mid-sentence renders as a plain
 * inline <img> instead, because a <figure> is not valid inside a <p>. An embed
 * written mid-sentence cannot be an iframe there, so it degrades to an ordinary
 * link to the chart — which is what a reader wanted from it anyway.
 */

/**
 * A beat between two parts of an argument — a dinkus, not a rule.
 *
 * ⚠ WHY THREE ASTERISKS RATHER THAN A LINE ACROSS THE COLUMN. A full-width rule
 * reads as "new section", which is what a `#` heading is already for. This is
 * the older book convention for a break WITHIN a piece: the argument turns, but
 * it is still one argument. On a page whose only ornament is a single coral
 * accent, a rule would also be the heaviest thing on it.
 *
 * ⚠ role="separator" on the wrapper, glyph hidden from assistive technology.
 * The element carries the meaning; the asterisks are decoration, and read aloud
 * they are three unexplained asterisks in the middle of a sentence-shaped page.
 *
 * The negative right margin cancels the trailing letter-space. `letter-spacing`
 * adds its gap AFTER the last character too, so without this the run sits
 * fractionally left of centre — the sort of thing nobody names and everybody
 * sees. (`text-indent` would be the other way to do it, but it applies to block
 * containers, not to this span.)
 */
function ThematicBreak() {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className="my-10 text-center select-none"
    >
      <span
        aria-hidden="true"
        style={{ color: COLORS.accent, letterSpacing: '0.75em', marginRight: '-0.75em' }}
      >
        ***
      </span>
    </div>
  )
}

/** One point in a list, with any sub-points hanging off it. The parser only ever
 *  fills one level of `sub` — a post wanting a third level is a post wanting
 *  rewriting — but the shape and the renderer are both recursive, so allowing
 *  more would be a one-line change. */
interface ListItem {
  text: string
  sub?: { ordered: boolean; items: ListItem[] }
}

type Block =
  | { kind: 'p'; text: string }
  /** A section heading within the post. */
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul'; items: ListItem[] }
  | { kind: 'ol'; items: ListItem[] }
  /** A pulled-out quotation; one entry per paragraph inside it. */
  | { kind: 'quote'; paras: string[] }
  /** A picture on a line of its own, with an optional caption below it. */
  | { kind: 'figure'; url: string; alt: string; caption: string | null }
  /** An embedded chart on a line of its own. */
  | { kind: 'embed'; url: string; title: string }
  /** A thematic break — a beat between two parts of an argument. */
  | { kind: 'break' }

interface Parsed {
  blocks: Block[]
  footnotes: { number: number; text: string }[]
  footnoteNumbers: Map<string, number>
  footnoteText: Map<string, string>
}

const FOOTNOTE_DEF_RE = /^\[\^([^\]\s]+)\]:\s?(.*)$/

// A picture or an embed alone on a line. Anchored, so one written mid-sentence
// falls through to the inline handling instead.
const IMAGE_BLOCK_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/
const EMBED_BLOCK_RE = /^@\[([^\]]*)\]\(([^)\s]+)\)$/

/**
 * A thematic break: three or more of `-`, `*` or `_` alone on a line, spaces
 * allowed between them. CommonMark's rule, so `---`, `***`, `___` and `* * *`
 * all work — an author should not have to remember which spelling this renderer
 * happened to pick.
 */
const THEMATIC_BREAK_RE = /^(?:\s*[-*_]){3,}\s*$/


// Source for the inline-token regex. A fresh RegExp is built per render pass
// because renderInline recurses (a link can contain bold, etc.) and a shared
// global regex's lastIndex would be clobbered by the nested call.
const INLINE_SRC =
  '\\^\\[([^\\]]+)\\]' + // 1: reveal note ^[anchor|note]
  '|\\[\\^([^\\]\\s]+)\\]' + // 2: footnote ref [^id]
  // 3 text / 4 url: [text](url). The text may contain balanced [brackets]
  // (valid CommonMark, e.g. "[see [detail]](url)"). The url runs to the first
  // ")" or whitespace, so query strings with &, %2C, _ etc. are preserved.
  '|\\[((?:[^\\[\\]]|\\[[^\\]]*\\])*)\\]\\(([^)\\s]+)\\)' +
  '|\\*\\*([^*]+?)\\*\\*' + // 5: **bold**
  '|__([^_]+?)__' + // 6: __bold__
  '|\\*([^*]+?)\\*' + // 7: *italic*
  // 8: _italic_ — only at word boundaries, so snake_case and URLs like
  // per_capita aren't turned into italics.
  '|(?<![A-Za-z0-9])_([^_]+?)_(?![A-Za-z0-9])' +
  '|`([^`]+?)`' + // 9: `code`
  // Bold AND italic. Listed after the single-emphasis forms only because that
  // keeps the earlier group numbers stable; alternation order doesn't decide it,
  // since every alternative is tried at a position before the engine moves on
  // and only these can match at the first of three markers.
  '|\\*\\*\\*([^*]+?)\\*\\*\\*' + // 10: ***bold italic***
  '|(?<![A-Za-z0-9])___([^_]+?)___(?![A-Za-z0-9])' + // 11: ___bold italic___
  '|<u>([^<]+?)</u>' + // 12: <u>underline</u> — see the note at the top
  // 13 text / 14 url: an inline ![alt](url). Appended rather than inserted so
  // every group number above keeps its meaning. Position in the alternation does
  // not decide precedence — the engine tries every alternative at each position
  // before advancing — so this still wins at the "!" and the link alternative
  // never gets to match the "[…](…)" behind it and leave a stray "!".
  '|!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)' +
  // 15 text / 16 url: an embed written mid-sentence. It cannot become an iframe
  // there, so it degrades to an ordinary link to the chart — which is what a
  // reader wants anyway. Without this alternative the link rule matches the
  // "[…](…)" behind the "@" and leaves the "@" stranded in the prose.
  '|@\\[([^\\]]*)\\]\\(([^)\\s]+)\\)'

/**
 * Allow only schemes that cannot execute. This is what stops a
 * `[click](javascript:…)` in the body from becoming a working script link — the
 * one place an author's Markdown could otherwise reach past the "render to React
 * elements" property above. `data:` is excluded too: a data: URL can carry an
 * HTML document.
 */
function isSafeUrl(u: string): boolean {
  return /^(https?:|mailto:|\/|#)/i.test(u)
}

function parse(src: string): Parsed {
  const lines = (src || '').replace(/\r\n?/g, '\n').split('\n')

  // Pull out footnote definitions; keep the rest as the body.
  const defs = new Map<string, string>()
  const body: string[] = []
  for (const line of lines) {
    const m = line.match(FOOTNOTE_DEF_RE)
    if (m) defs.set(m[1], m[2])
    else body.push(line)
  }

  // Group body lines into paragraph / list / quote blocks.
  const blocks: Block[] = []
  let para: string[] = []
  let list: ListItem[] | null = null
  let listOrdered = false
  /** The indent of the list's top-level points, whatever it happens to be. */
  let listIndent = 0
  let quote: string[] | null = null

  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  const flushList = () => {
    if (list && list.length) blocks.push({ kind: listOrdered ? 'ol' : 'ul', items: list })
    list = null
  }
  // A "> " run is one quote; a bare ">" inside it starts a new paragraph within
  // the quote, and anything else ends it.
  const flushQuote = () => {
    if (quote) {
      const paras: string[] = []
      let cur: string[] = []
      for (const l of quote) {
        if (l.trim()) cur.push(l.trim())
        else if (cur.length) { paras.push(cur.join(' ')); cur = [] }
      }
      if (cur.length) paras.push(cur.join(' '))
      if (paras.length) blocks.push({ kind: 'quote', paras })
    }
    quote = null
  }

  for (const line of body) {
    if (!line.trim()) {
      flushPara(); flushList(); flushQuote()
      continue
    }
    // A picture or an embed alone on a line becomes a block of its own. Checked
    // before everything else because the trimmed line has to match end to end.
    const trimmed = line.trim()
    const imgBlock = trimmed.match(IMAGE_BLOCK_RE)
    if (imgBlock && isSafeUrl(imgBlock[2])) {
      flushPara(); flushList(); flushQuote()
      const { caption, alt } = splitImageText(imgBlock[1])
      blocks.push({ kind: 'figure', url: imgBlock[2], alt, caption })
      continue
    }
    const embedBlock = trimmed.match(EMBED_BLOCK_RE)
    if (embedBlock && isSafeUrl(embedBlock[2])) {
      flushPara(); flushList(); flushQuote()
      blocks.push({ kind: 'embed', url: embedBlock[2], title: embedBlock[1].trim() || 'Embedded chart' })
      continue
    }

    // A thematic break. All three of Markdown's spellings, because they are all
    // standard and an author should not have to remember which one this
    // renderer chose — `***` in particular is what somebody reaches for who has
    // been centring asterisks by hand in another editor.
    //
    // ⚠ Checked BEFORE the inline pass ever sees the line: `***` is also the
    // bold-italic marker, and a bare one would otherwise sit in a paragraph as
    // three literal asterisks.
    if (THEMATIC_BREAK_RE.test(trimmed)) {
      flushPara(); flushList(); flushQuote()
      blocks.push({ kind: 'break' })
      continue
    }

    // "# " needs the space, so "#1" or "#GERS" stays ordinary text.
    const head = line.match(/^(#{1,3})\s+(.*\S)\s*$/)
    if (head) {
      flushPara(); flushList(); flushQuote()
      blocks.push({ kind: 'h', level: head[1].length, text: head[2] })
      continue
    }
    const bq = line.match(/^\s*>\s?(.*)$/)
    if (bq) {
      flushPara(); flushList()
      if (!quote) quote = []
      quote.push(bq[1])
      continue
    }
    flushQuote()
    // The leading whitespace is captured, not skipped: an indented point is a
    // sub-point of the one above it.
    const ul = line.match(/^([ \t]*)[-*]\s+(.*)$/)
    const ol = line.match(/^([ \t]*)\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const [, lead, text] = (ul ?? ol)!
      const ordered = !!ol && !ul
      // Indent is judged against the list's own left edge, not against zero, so
      // a list that is indented as a whole doesn't read as one point with every
      // other point hanging under it.
      const indent = lead.replace(/\t/g, '  ').length
      const parent = list?.[list.length - 1]
      if (indent >= listIndent + 2 && parent) {
        // Sub-points take their marker style from the first one written, so a
        // numbered sub-list under a bulleted point reads as intended.
        if (!parent.sub) parent.sub = { ordered, items: [] }
        parent.sub.items.push({ text })
      } else {
        if (list && listOrdered !== ordered) flushList()
        if (!list) {
          list = []
          listOrdered = ordered
          listIndent = indent
        }
        list.push({ text })
      }
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara(); flushList(); flushQuote()

  // Number footnotes by the order their references first appear, defined ones
  // only — a reference with no definition stays literal text rather than
  // becoming a superscript pointing nowhere.
  const footnoteNumbers = new Map<string, number>()
  const footnotes: { number: number; text: string }[] = []
  const refRe = /\[\^([^\]\s]+)\]/g
  const joined = body.join('\n')
  let mm: RegExpExecArray | null
  while ((mm = refRe.exec(joined))) {
    const id = mm[1]
    if (!defs.has(id) || footnoteNumbers.has(id)) continue
    const n = footnoteNumbers.size + 1
    footnoteNumbers.set(id, n)
    footnotes.push({ number: n, text: defs.get(id)! })
  }

  return { blocks, footnotes, footnoteNumbers, footnoteText: defs }
}

interface Ctx {
  footnoteNumbers: Map<string, number>
  footnoteText: Map<string, string>
  id: string
  /** Lower-cased search terms to <mark>-highlight in the rendered text. */
  highlight?: string[]
}

/** Render one line of text with inline Markdown plus search highlighting — for
 *  short single-line strings such as a post's headline, where block elements and
 *  footnotes don't apply. */
export function InlineText({ text, highlight, id = 'inline' }: {
  text: string
  highlight?: string[]
  id?: string
}) {
  const ctx: Ctx = { footnoteNumbers: new Map(), footnoteText: new Map(), id, highlight }
  return <>{renderInline(text, ctx, id)}</>
}

function renderInline(text: string, ctx: Ctx, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = new RegExp(INLINE_SRC, 'g')
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) emitHighlighted(out, text.slice(last, m.index), ctx.highlight, `${keyBase}-p${m.index}`)
    const key = `${keyBase}-${i++}`
    if (m[1] !== undefined) {
      const inner = m[1]
      const pipe = inner.indexOf('|')
      const anchor = pipe >= 0 ? inner.slice(0, pipe) : null
      const note = pipe >= 0 ? inner.slice(pipe + 1) : inner
      out.push(
        <RevealNote
          key={key}
          note={renderInline(note, ctx, `${key}n`)}
          anchor={anchor ? renderInline(anchor, ctx, `${key}a`) : null}
        />,
      )
    } else if (m[2] !== undefined) {
      const n = ctx.footnoteNumbers.get(m[2])
      if (n === undefined) out.push(m[0])
      else out.push(<FootnoteRef key={key} n={n} note={ctx.footnoteText.get(m[2]) ?? ''} id={ctx.id} ctx={ctx} />)
    } else if (m[3] !== undefined) {
      const url = m[4]
      if (isSafeUrl(url)) {
        // Only an off-site link opens a new tab. An internal one (/blog/…)
        // should navigate in place, or the reader ends up with a tab per post.
        const external = /^https?:/i.test(url)
        out.push(
          <a
            key={key}
            href={url}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="underline underline-offset-2 font-medium"
            style={{ color: COLORS.accent }}
          >
            {renderInline(m[3], ctx, key)}
          </a>,
        )
      } else out.push(m[0])
    } else if (m[5] !== undefined || m[6] !== undefined) {
      const inner = (m[5] ?? m[6])!
      out.push(<strong key={key}>{renderInline(inner, ctx, key)}</strong>)
    } else if (m[7] !== undefined || m[8] !== undefined) {
      const inner = (m[7] ?? m[8])!
      out.push(<em key={key}>{renderInline(inner, ctx, key)}</em>)
    } else if (m[10] !== undefined || m[11] !== undefined) {
      const inner = (m[10] ?? m[11])!
      out.push(<strong key={key}><em>{renderInline(inner, ctx, key)}</em></strong>)
    } else if (m[12] !== undefined) {
      out.push(<u key={key}>{renderInline(m[12], ctx, key)}</u>)
    } else if (m[15] !== undefined) {
      const url = m[16]
      if (isSafeUrl(url)) {
        out.push(
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 font-medium"
            style={{ color: COLORS.accent }}
          >
            {renderInline(m[15], ctx, key)}
          </a>,
        )
      } else out.push(m[0])
    } else if (m[13] !== undefined) {
      // Inline, so no <figure> and no caption — see the note at the top.
      const url = m[14]
      if (isSafeUrl(url)) {
        const { alt } = splitImageText(m[13])
        out.push(<PostImage key={key} url={url} alt={alt} />)
      } else out.push(m[0])
    } else if (m[9] !== undefined) {
      out.push(
        <code
          key={key}
          className="px-1 py-0.5 rounded text-[0.85em]"
          style={{ background: COLORS.tint, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        >
          {m[9]}
        </code>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) emitHighlighted(out, text.slice(last), ctx.highlight, `${keyBase}-tail`)
  return out
}

/** Where a popover should sit relative to its trigger, clamped to the viewport. */
function anchorPosition(el: HTMLElement, width: number): { top: number; left: number } {
  const r = el.getBoundingClientRect()
  let left = r.left
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
  if (left < 8) left = 8
  return { top: r.bottom + 4, left }
}

/** Flip a popover above its trigger if it would overflow the viewport bottom. */
function useFlipAbove(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  popRef: React.RefObject<HTMLDivElement | null>,
  setPos: React.Dispatch<React.SetStateAction<{ top: number; left: number }>>,
) {
  useEffect(() => {
    if (!open || !popRef.current || !triggerRef.current) return
    const p = popRef.current.getBoundingClientRect()
    if (p.bottom > window.innerHeight - 8) {
      const r = triggerRef.current.getBoundingClientRect()
      setPos((prev) => ({ ...prev, top: r.top - p.height - 4 }))
    }
  }, [open, popRef, triggerRef, setPos])
}

const POPOVER_CLS = 'fixed bg-white border rounded-md shadow-lg px-3 py-2 text-sm font-normal whitespace-normal'
const popoverWidth = () => (typeof window !== 'undefined' ? Math.min(300, window.innerWidth - 16) : 300)

/** Traditional footnote reference: hover previews the note, click jumps to it. */
function FootnoteRef({ n, note, id, ctx }: { n: number; note: string; id: string; ctx: Ctx }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const width = popoverWidth()

  const show = () => {
    if (ref.current) setPos(anchorPosition(ref.current, width))
    setOpen(true)
  }
  const hide = () => setOpen(false)

  useFlipAbove(open, ref, popRef, setPos)

  return (
    <sup ref={ref} className="text-[0.7em] font-medium" onMouseEnter={show} onMouseLeave={hide}>
      {/* A real anchor, so the number works without JavaScript and with a
          keyboard: the hover preview is a convenience over a link that already
          goes somewhere. */}
      <a
        id={`fnref-${id}-${n}`}
        href={`#fn-${id}-${n}`}
        className="no-underline"
        style={{ color: COLORS.accent }}
        onFocus={show}
        onBlur={hide}
      >
        {n}
      </a>
      {open && note &&
        ReactDOM.createPortal(
          <div
            ref={popRef}
            className={POPOVER_CLS}
            style={{ borderColor: COLORS.border, width, color: COLORS.muted, top: pos.top, left: pos.left, zIndex: 9999 }}
          >
            {renderInline(note, ctx, `fnprev-${id}-${n}`)}
          </div>,
          document.body,
        )}
    </sup>
  )
}

/** Inline click-to-reveal note. Portal-rendered so it escapes any clipping or
 *  stacking context the prose happens to sit in. */
function RevealNote({ note, anchor }: { note: React.ReactNode; anchor: React.ReactNode | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const width = popoverWidth()

  // Capture phase, so a click anywhere closes this even when the thing clicked
  // stops propagation on its own handler.
  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        popRef.current && !popRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('click', handle, true)
    return () => document.removeEventListener('click', handle, true)
  }, [open])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && ref.current) setPos(anchorPosition(ref.current, width))
    setOpen((o) => !o)
  }

  useFlipAbove(open, ref, popRef, setPos)

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="cursor-help bg-transparent border-0 p-0 align-baseline"
        style={{ color: anchor ? 'inherit' : COLORS.accent }}
        aria-label={anchor ? undefined : 'Show note'}
        aria-expanded={open}
      >
        {anchor ? (
          <span className="border-b border-dotted" style={{ borderColor: COLORS.muted }}>
            {anchor}
          </span>
        ) : (
          <sup className="text-[0.7em]">&#9432;</sup>
        )}
      </button>
      {open &&
        ReactDOM.createPortal(
          <div
            ref={popRef}
            className={POPOVER_CLS}
            style={{ borderColor: COLORS.border, width, color: COLORS.muted, top: pos.top, left: pos.left, zIndex: 9999 }}
          >
            {note}
          </div>,
          document.body,
        )}
    </span>
  )
}

/** The numbered footnote list, shared by RichText and RichTextFootnotes. */
function FootnoteList({ footnotes, ctx, id }: {
  footnotes: { number: number; text: string }[]
  ctx: Ctx
  id: string
}) {
  if (footnotes.length === 0) return null
  return (
    <ol
      className="mt-4 pt-3 border-t text-xs space-y-1 list-none pl-0"
      style={{ borderColor: COLORS.border, color: COLORS.muted }}
    >
      {footnotes.map((f) => (
        <li key={f.number} id={`fn-${id}-${f.number}`} className="flex gap-1.5">
          <span className="font-semibold shrink-0" style={{ color: COLORS.accent }}>
            {f.number}.
          </span>
          <span>
            {renderInline(f.text, ctx, `fn${f.number}`)}{' '}
            <a
              href={`#fnref-${id}-${f.number}`}
              className="no-underline"
              style={{ color: COLORS.accent }}
              aria-label="Back to reference"
            >
              &#8617;
            </a>
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * A list and its sub-lists.
 *
 * Each item is a flex row: a fixed-width marker column plus the text in its own
 * block, so wrapped lines hang consistently under the first line rather than
 * sliding back under the marker. Sub-points render inside that text block, so
 * they line up under the words of their parent point rather than under its
 * bullet, and need no indent of their own.
 */
function List({ items, ordered, ctx, keyBase, depth = 0 }: {
  items: ListItem[]
  ordered: boolean
  ctx: Ctx
  keyBase: string
  depth?: number
}) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className={`list-none pl-1 space-y-1 ${depth ? 'mt-1' : 'mb-4 last:mb-0'}`}>
      {items.map((it, j) => (
        <li key={j} className="flex gap-2">
          <span
            className="shrink-0 select-none num"
            style={ordered ? { minWidth: '1.5em', textAlign: 'right' } : undefined}
            aria-hidden
          >
            {ordered ? `${j + 1}.` : depth ? '◦' : '•'}
          </span>
          <span className="min-w-0 flex-1">
            {renderInline(it.text, ctx, `${keyBase}-${j}`)}
            {it.sub && (
              <List
                items={it.sub.items}
                ordered={it.sub.ordered}
                ctx={ctx}
                keyBase={`${keyBase}-${j}s`}
                depth={depth + 1}
              />
            )}
          </span>
        </li>
      ))}
    </Tag>
  )
}

interface RichTextProps {
  text: string
  /** Explicit anchor-id base. Pass a stable id shared with a sibling
   *  <RichTextFootnotes> so footnote ref/definition links still connect when the
   *  list is rendered somewhere else on the page. */
  id?: string
  /** Suppress the inline footnote list — render it separately via RichTextFootnotes. */
  hideFootnotes?: boolean
  /** Lower-cased search terms to <mark>-highlight in the rendered text. */
  highlight?: string[]
}

/** Render the Markdown written in Admin. Returns null for empty text. */
export function RichText({ text, id: idProp, hideFootnotes, highlight }: RichTextProps) {
  const rawId = useId()
  // useId's value contains colons, which are not valid in a URL fragment.
  const id = (idProp ?? rawId).replace(/:/g, '')
  const parsed = useMemo(() => parse(text || ''), [text])
  if (!(text || '').trim()) return null
  const ctx: Ctx = {
    footnoteNumbers: parsed.footnoteNumbers,
    footnoteText: parsed.footnoteText,
    id,
    highlight,
  }

  return (
    <>
      {parsed.blocks.map((b, i) => {
        if (b.kind === 'p') {
          return <p key={i} className="mb-4 last:mb-0">{renderInline(b.text, ctx, `b${i}`)}</p>
        }
        // h2/h3, not h1: the page's own h1 is the post's headline, and a heading
        // inside the prose sits under that. Getting this wrong gives a page two
        // h1s, which is a real (if minor) structural problem for search.
        if (b.kind === 'h') {
          const big = b.level === 1
          const Tag = big ? 'h2' : 'h3'
          return (
            <Tag
              key={i}
              className={big
                ? 'text-xl sm:text-2xl font-bold mt-8 mb-3 first:mt-0'
                : 'text-base sm:text-lg font-bold mt-6 mb-2 first:mt-0'}
              style={{ color: COLORS.ink, letterSpacing: '-0.3px' }}
            >
              {renderInline(b.text, ctx, `b${i}`)}
            </Tag>
          )
        }
        // A quotation, set in a tinted panel inset from the text either side, so
        // a passage being quoted is obviously not the page speaking.
        if (b.kind === 'quote') {
          return (
            <blockquote
              key={i}
              className="my-5 px-5 py-4 rounded-lg border-l-2"
              style={{ backgroundColor: COLORS.tint, borderColor: COLORS.accent, color: COLORS.muted }}
            >
              {b.paras.map((p, j) => (
                <p key={j} className="mb-2 last:mb-0">{renderInline(p, ctx, `b${i}-${j}`)}</p>
              ))}
            </blockquote>
          )
        }
        if (b.kind === 'figure') {
          return <PostImage key={i} url={b.url} alt={b.alt} caption={b.caption} />
        }
        if (b.kind === 'embed') {
          return (
            <div key={i} className="my-6">
              <EmbedFrame url={b.url} title={b.title} />
            </div>
          )
        }
        if (b.kind === 'break') return <ThematicBreak key={i} />
        return <List key={i} items={b.items} ordered={b.kind === 'ol'} ctx={ctx} keyBase={`b${i}`} />
      })}
      {!hideFootnotes && <FootnoteList footnotes={parsed.footnotes} ctx={ctx} id={id} />}
    </>
  )
}

/** Render ONLY the footnote list for `text`, using `id` as the anchor base so it
 *  links up with a sibling <RichText … id={id} hideFootnotes />. Null if none. */
export function RichTextFootnotes({ text, id: idProp, highlight }: {
  text: string
  id?: string
  highlight?: string[]
}) {
  const rawId = useId()
  const id = (idProp ?? rawId).replace(/:/g, '')
  const parsed = useMemo(() => parse(text || ''), [text])
  if (parsed.footnotes.length === 0) return null
  const ctx: Ctx = {
    footnoteNumbers: parsed.footnoteNumbers,
    footnoteText: parsed.footnoteText,
    id,
    highlight,
  }
  return <FootnoteList footnotes={parsed.footnotes} ctx={ctx} id={id} />
}
