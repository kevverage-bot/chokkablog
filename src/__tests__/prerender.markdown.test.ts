import { describe, it, expect } from 'vitest'
import { stripMarkdown as stripApp } from '../lib/markdownText'
import {
  stripMarkdown as stripBuild,
  markdownToHtml,
  clamp,
} from '../../scripts/lib/markdown.mjs'

/**
 * The prerenderer has its own Markdown implementation, in .mjs, because the
 * build script runs before anything has compiled the app's TypeScript. Two
 * implementations of the same rules is a drift problem, and this file is the
 * thing that stops it: the first block runs BOTH strippers over one corpus and
 * demands identical output.
 *
 * If it fails, the meta description a crawler was served no longer matches the
 * excerpt a reader sees on the hub — which is exactly the bug the single
 * implementation in src/lib/markdownText.ts was created to prevent.
 */

/** Everything the editor can produce, plus the things authors do by hand. */
const CORPUS = [
  '',
  'Plain prose with no markup at all.',
  '**Bold**, *italic*, ***both*** and <u>underlined</u>.',
  'A [link](https://example.com) and some `inline code`.',
  '# A heading\n\nThen a paragraph.',
  '## Second level\n\n### Third level',
  '> A pulled quotation\n> over two lines.',
  '- one\n- two\n  - a sub-point\n- three',
  '1. first\n2. second',
  'A footnote reference[^1] mid-sentence.\n\n[^1]: The note itself.',
  'A ^[reveal note] with no anchor.',
  'A ^[Barnett formula|The mechanism that sets the block grant] with an anchor.',
  '![Just alt text](https://x.test/a.png)',
  '![A caption|and its alt](https://x.test/a.png#1200x800)',
  'A picture ![inline](https://x.test/b.png) mid-sentence.',
  '@[Deficit over time](https://gers-explorer.com/embed/charts/deficit)',
  'An embed @[inline chart](https://x.test/c) mid-sentence.',
  'Mixed: **bold** with a [link](/blog/x) and a note[^2].\n\n[^2]: Note two.',
  'Multiple   spaces\nand\nnewlines.',
  "Smart punctuation — en dashes, curly ’quotes’ and “doubles”.",
]

describe('stripMarkdown: the app and the prerenderer agree', () => {
  for (const md of CORPUS) {
    it(`matches for ${JSON.stringify(md.slice(0, 42))}`, () => {
      expect(stripBuild(md)).toBe(stripApp(md))
    })
  }
})

describe('markdownToHtml', () => {
  it('escapes anything that looks like markup in the source', () => {
    const html = markdownToHtml('An <script>alert(1)</script> tag and a & sign.')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })

  it('refuses a javascript: link, keeping only its text', () => {
    // The one way the author's Markdown could put executable script into HTML
    // that is served to every reader.
    const html = markdownToHtml('[click me](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('click me')
  })

  it('renders a captioned picture as a figure, with the recorded size', () => {
    const html = markdownToHtml('![The deficit since 1999|A line chart](https://x.test/a.png#1200x800)')
    expect(html).toContain('<figure>')
    expect(html).toContain('width="1200"')
    expect(html).toContain('height="800"')
    expect(html).toContain('alt="A line chart"')
    expect(html).toContain('<figcaption>The deficit since 1999</figcaption>')
    // The fragment is our own convention and must not reach the src attribute.
    expect(html).toContain('src="https://x.test/a.png"')
  })

  it('turns a chart embed into a link to the chart', () => {
    // An iframe is worth nothing to a client that runs no JavaScript, and a link
    // is what the reader wanted from it anyway.
    const html = markdownToHtml('@[Deficit over time](https://gers-explorer.com/c/deficit)')
    expect(html).toContain('<a href="https://gers-explorer.com/c/deficit">Deficit over time</a>')
    expect(html).not.toContain('<iframe')
  })

  it('keeps a footnote definition, because a reader sees it', () => {
    const html = markdownToHtml('A claim[^1].\n\n[^1]: The source of the claim.')
    expect(html).toContain('<sup>1</sup>')
    expect(html).toContain('<li>The source of the claim.</li>')
  })

  it('keeps a reveal note’s anchor and drops the hidden half', () => {
    // The note's text is not in the page until someone clicks it, so putting it
    // in the snapshot would index something no reader can see.
    const html = markdownToHtml('The ^[Barnett formula|sets the block grant] matters.')
    expect(html).toContain('Barnett formula')
    expect(html).not.toContain('block grant')
  })

  it('never emits a div, which the writer asserts on', () => {
    // makeWriter() replaces `<div id="root"></div>` and its re-run guard matches
    // to the first </div>, so a div in a snapshot would corrupt the next build.
    for (const md of CORPUS) {
      expect(markdownToHtml(md)).not.toContain('<div')
    }
  })

  it('renders structure, not just words', () => {
    const html = markdownToHtml('# Title\n\n- one\n- two\n\n> quoted')
    expect(html).toContain('<h2>Title</h2>')   // h1 belongs to the page
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<blockquote>')
  })
})

describe('clamp', () => {
  it('leaves a short description alone', () => {
    expect(clamp('Short enough.')).toBe('Short enough.')
  })

  it('cuts on a word boundary and marks the cut', () => {
    const out = clamp('word '.repeat(60), 40)
    expect(out.length).toBeLessThanOrEqual(41)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toContain('wor…')
  })

  it('strips markup before measuring', () => {
    expect(clamp('**bold** and *italic*')).toBe('bold and italic')
  })
})
