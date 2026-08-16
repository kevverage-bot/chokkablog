import { describe, it, expect } from 'vitest'
import { parseImageUrl, splitImageText } from '../lib/postImage'
import { stripMarkdown } from '../lib/markdownText'
import { extractEmbedUrl, isUsableEmbedUrl } from '../lib/embedUrl'

describe('parseImageUrl', () => {
  it('reads the dimensions the uploader recorded', () => {
    expect(parseImageUrl('https://x/y.png#1200x800'))
      .toEqual({ src: 'https://x/y.png', width: 1200, height: 800 })
  })

  it('leaves a URL with no fragment alone', () => {
    // An image saved before the convention existed still has to render — it
    // just cannot reserve its space.
    expect(parseImageUrl('https://x/y.png')).toEqual({ src: 'https://x/y.png' })
  })

  it('ignores a fragment that is not a size', () => {
    expect(parseImageUrl('https://x/y.png#section')).toEqual({ src: 'https://x/y.png#section' })
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
