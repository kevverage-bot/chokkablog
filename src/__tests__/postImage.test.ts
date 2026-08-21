import { describe, it, expect } from 'vitest'
import { toggleOutline, imageAtCaret, OUTLINE_FLAG, parseImageUrl, splitImageText } from '../lib/postImage'
import { stripMarkdown } from '../lib/markdownText'
import { extractEmbedUrl, isUsableEmbedUrl } from '../lib/embedUrl'

describe('parseImageUrl', () => {
  it('reads the dimensions the uploader recorded', () => {
    expect(parseImageUrl('https://x/y.png#1200x800'))
      .toEqual({ src: 'https://x/y.png', width: 1200, height: 800, outlined: false })
  })

  it('leaves a URL with no fragment alone', () => {
    // An image saved before the convention existed still has to render — it
    // just cannot reserve its space.
    expect(parseImageUrl('https://x/y.png')).toEqual({ src: 'https://x/y.png', outlined: false })
  })

  it('ignores a fragment that is not a size', () => {
    expect(parseImageUrl('https://x/y.png#section'))
      .toEqual({ src: 'https://x/y.png#section', outlined: false })
  })
})

describe('splitImageText', () => {
  it('treats plain Markdown as alt text with no caption', () => {
    expect(splitImageText('A line chart of the deficit'))
      .toEqual({ caption: null, alt: 'A line chart of the deficit' })
  })

  it('puts the visible caption first', () => {
    expect(splitImageText("Scotland's deficit vs UK|A line chart"))
      .toEqual({ caption: "Scotland's deficit vs UK", alt: 'A line chart' })
  })

  it('falls back to the caption when the alt is empty', () => {
    // A repetitive alt beats no alt at all.
    expect(splitImageText('Deficit chart|')).toEqual({ caption: 'Deficit chart', alt: 'Deficit chart' })
  })
})

describe('stripMarkdown, for excerpts and meta descriptions', () => {
  it('drops a thematic break rather than leaving hyphens in the description', () => {
    // ⚠ `---` is not caught by the bullet rule (that needs a space after the
    // dash) nor by the emphasis strip (that only removes * _ `), so without a
    // rule of its own it survives into a meta description as three hyphens.
    expect(stripMarkdown('Before.\n\n---\n\nAfter.')).toBe('Before. After.')
    expect(stripMarkdown('Before.\n\n* * *\n\nAfter.')).toBe('Before. After.')
    expect(stripMarkdown('Before.\n\n___\n\nAfter.')).toBe('Before. After.')
  })

  it('drops an embed that is alone on a line', () => {
    expect(stripMarkdown('Before.\n\n@[Chart](https://gers-explorer.com/embed/charts/x)\n\nAfter.'))
      .toBe('Before. After.')
  })

  it('keeps the text of an embed written mid-sentence, which renders as a link', () => {
    expect(stripMarkdown('See the @[deficit chart](https://x/y) for detail.'))
      .toBe('See the deficit chart for detail.')
  })

  it('keeps an image caption but not its alt', () => {
    // The alt describes the picture to someone who cannot see it, which reads
    // oddly dropped into the middle of a search-result description.
    expect(stripMarkdown('Text. ![The deficit gap|A line chart](https://x/y.png#800x600) More.'))
      .toBe('Text. The deficit gap More.')
  })

  it('contributes nothing for a plain image with no caption', () => {
    expect(stripMarkdown('Text. ![A line chart](https://x/y.png) More.')).toBe('Text. More.')
  })

  it('still turns an ordinary link into its text', () => {
    expect(stripMarkdown('See [the figures](https://x/y) here.')).toBe('See the figures here.')
  })
})

describe('extractEmbedUrl', () => {
  it('pulls the src out of a pasted iframe snippet', () => {
    // What the Embed button on GERS Explorer actually copies. Pasted raw, the
    // spaces and quotes make the @[…](…) token unmatchable, and the markup just
    // sits in the post as text.
    const snippet = '<iframe src="https://gers-explorer.com/embed/charts/deficit" width="100%" height="480" frameborder="0"></iframe>'
    expect(extractEmbedUrl(snippet)).toBe('https://gers-explorer.com/embed/charts/deficit')
  })

  it('decodes the &amp; between query parameters', () => {
    // Left encoded, the chart receives "amp;o=billions" and silently ignores it.
    expect(extractEmbedUrl('<iframe src="https://x/y?a=1&amp;b=2">'))
      .toBe('https://x/y?a=1&b=2')
  })

  it('passes a bare URL straight through', () => {
    expect(extractEmbedUrl('  https://x/y  ')).toBe('https://x/y')
  })
})

describe('isUsableEmbedUrl', () => {
  it('accepts an ordinary https URL with a query string', () => {
    expect(isUsableEmbedUrl('https://gers-explorer.com/embed/charts/x?o=billions')).toBe(true)
  })

  it('rejects anything that would break the @[…](…) token', () => {
    expect(isUsableEmbedUrl('<iframe src="https://x/y"></iframe>')).toBe(false)
    expect(isUsableEmbedUrl('https://x/y z')).toBe(false)
  })

  it('rejects a scheme that is not http(s)', () => {
    expect(isUsableEmbedUrl('javascript:alert(1)')).toBe(false)
    expect(isUsableEmbedUrl('data:text/html,x')).toBe(false)
  })
})


/**
 * The per-image outline.
 *
 * Opt-in, because whether a picture wants an edge depends on the picture: a
 * chart exported on white bleeds into the page without one, a photograph with
 * its own edges usually reads better without. The flag rides in the URL
 * FRAGMENT, which is never sent to a server — so how a picture is framed can
 * never change which bytes are fetched.
 */
describe('the outline flag', () => {
  it('is read off the end of the fragment, alongside the size', () => {
    const url = `https://x.test/a.png#1200x800${OUTLINE_FLAG}`
    expect(parseImageUrl(url)).toEqual({
      src: 'https://x.test/a.png', width: 1200, height: 800, outlined: true,
    })
  })

  it('leaves the size intact and reports no outline when absent', () => {
    expect(parseImageUrl('https://x.test/a.png#1200x800')).toEqual({
      src: 'https://x.test/a.png', width: 1200, height: 800, outlined: false,
    })
  })

  it('works on an image saved before sizes were recorded', () => {
    // The `#` is left over once the flag is stripped, and must not reach the src
    // — a trailing hash is harmless in a request but ugly in the DOM.
    expect(parseImageUrl(`https://x.test/old.png#${OUTLINE_FLAG}`)).toEqual({
      src: 'https://x.test/old.png', outlined: true,
    })
  })

  it('toggles on and back off, returning exactly what it started with', () => {
    const bare = 'https://x.test/a.png'
    const sized = 'https://x.test/a.png#1200x800'
    expect(toggleOutline(toggleOutline(sized))).toBe(sized)
    expect(toggleOutline(toggleOutline(bare))).toBe(bare)
    expect(toggleOutline(sized)).toBe(`${sized}${OUTLINE_FLAG}`)
    // No fragment yet: one is added, because the flag must not become part of
    // the request path.
    expect(toggleOutline(bare)).toBe(`${bare}#${OUTLINE_FLAG}`)
  })
})

describe('imageAtCaret', () => {
  const text = 'Before\n\n![Caption|Alt text](https://x.test/a.png#800x600)\n\nAfter'
  const start = text.indexOf('![')
  const end = text.indexOf(')') + 1

  it('finds the image the caret is inside, wherever in it the caret is', () => {
    for (const caret of [start, start + 5, text.indexOf('https'), end]) {
      expect(imageAtCaret(text, caret)?.url).toBe('https://x.test/a.png#800x600')
    }
  })

  it('finds nothing when the caret is in ordinary prose', () => {
    expect(imageAtCaret(text, 2)).toBeNull()
    expect(imageAtCaret(text, text.length - 2)).toBeNull()
    expect(imageAtCaret('no images here', 4)).toBeNull()
  })

  it('picks the right one when a post has several', () => {
    const two = '![one](https://x.test/1.png)\n\n![two](https://x.test/2.png)'
    expect(imageAtCaret(two, 3)?.url).toBe('https://x.test/1.png')
    expect(imageAtCaret(two, two.indexOf('![two') + 3)?.url).toBe('https://x.test/2.png')
  })

  it('reports the span it found, so the caller can rewrite just that image', () => {
    const found = imageAtCaret(text, start + 3)!
    expect(text.slice(found.start, found.end)).toBe('![Caption|Alt text](https://x.test/a.png#800x600)')
  })
})
