import { tokenPattern } from './search'

/**
 * Marking search matches inside HTML the app did not render.
 *
 * ⚠ WHY THIS EXISTS RATHER THAN highlightText(). Every other page on this site
 * highlights by splitting a STRING into React nodes, which is safe by
 * construction. An archive post is not a string the app owns: it is Blogger's
 * original markup, sanitised at import and injected with
 * `dangerouslySetInnerHTML` so thirteen years of tables, blockquotes and charts
 * survive. There is no React tree to split, so the marks have to be put in
 * afterwards, in the DOM.
 *
 * ⚠ AND WHY IT TOUCHES TEXT NODES ONLY. The obvious implementation — a regex
 * over innerHTML — would match inside tag names, attributes and URLs, so a
 * search for "img" or "class" would rewrite the markup and a search for "http"
 * would break every link and hotlinked image on the page. The archive's images
 * are hotlinked from Blogger and cannot be re-fetched, so corrupting one is
 * permanent as far as a reader is concerned. A TreeWalker sees text and nothing
 * else, which makes that class of damage impossible rather than unlikely.
 *
 * Idempotent: a node already inside a mark this function made is skipped, so
 * running it twice cannot nest marks or double-count.
 */

/** Marks this module made, so a second pass can recognise and skip them. */
const MARK_ATTR = 'data-q-mark'

/** Matches the styling in lib/highlight.tsx. Kept as a string because these
 *  elements are built by hand rather than by React. */
const MARK_CSS =
  'background-color:#FDE68A;color:inherit;border-radius:2px;padding:0 1px;'
  + '-webkit-box-decoration-break:clone;box-decoration-break:clone;'

/**
 * Wrap every occurrence of `terms` in `root` with a <mark>. Returns how many
 * were marked, which is what a caller needs to decide whether to scroll to the
 * first one.
 *
 * Safe to call with an empty term list, a detached node, or nothing at all.
 */
export function markMatchesInDom(root: HTMLElement | null, terms: string[]): number {
  const t = (terms ?? []).filter(Boolean)
  if (!root || t.length === 0) return 0

  const re = new RegExp('(' + t.map(tokenPattern).join('|') + ')', 'gi')

  // Collected before mutating: replacing a node while walking invalidates the
  // walker's position, and the symptom is a silent half-highlighted page.
  const targets: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue ?? ''
      if (!text.trim()) return NodeFilter.FILTER_REJECT
      // Never mark inside a mark this function already made.
      const parent = node.parentElement
      if (parent?.closest(`[${MARK_ATTR}]`)) return NodeFilter.FILTER_REJECT
      // Defensive: the archive HTML is sanitised at import and contains no
      // script or style, but a highlight inside one would be rendered as code.
      const tag = parent?.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT
      re.lastIndex = 0
      return re.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })

  let node: Node | null
  while ((node = walker.nextNode())) targets.push(node as Text)

  let marked = 0
  for (const textNode of targets) {
    const text = textNode.nodeValue ?? ''
    const frag = document.createDocumentFragment()
    let last = 0
    re.lastIndex = 0

    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      // A zero-length match would loop for ever; a token cannot produce one, but
      // the pattern is assembled from user input and this costs one line.
      if (m[0].length === 0) { re.lastIndex += 1; continue }
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)))
      const mark = document.createElement('mark')
      mark.setAttribute(MARK_ATTR, '')
      mark.setAttribute('style', MARK_CSS)
      mark.textContent = m[0]
      frag.appendChild(mark)
      last = m.index + m[0].length
      marked += 1
    }

    if (marked === 0 && last === 0) continue
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
    textNode.parentNode?.replaceChild(frag, textNode)
  }

  return marked
}

/** The first mark this module made, for scrolling to. Null when there is none. */
export function firstMark(root: HTMLElement | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[${MARK_ATTR}]`) ?? null
}
