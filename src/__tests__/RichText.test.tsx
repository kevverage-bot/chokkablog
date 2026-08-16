import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RichText } from '../components/RichText'

/**
 * The renderer's job is to turn author-written Markdown into elements. Two
 * things here are worth holding down with tests rather than review:
 *
 *  - the security property (no executable URL ever becomes a live link or src),
 *    because a regression looks like nothing at all on screen;
 *  - the block-versus-inline distinction, because <figure> inside <p> is invalid
 *    HTML that browsers silently repair into something else.
 */

describe('pictures', () => {
  it('renders a captioned image on its own line as a figure', () => {
    const { container } = render(
      <RichText text={'Before.\n\n![The deficit gap|A line chart](https://x/y.png#1200x800)\n\nAfter.'} />,
    )
    const fig = container.querySelector('figure')
    expect(fig).not.toBeNull()
    expect(fig?.querySelector('figcaption')?.textContent).toBe('The deficit gap')

    const img = container.querySelector('img')!
    expect(img.getAttribute('alt')).toBe('A line chart')
    expect(img.getAttribute('src')).toBe('https://x/y.png')
    // From the #WxH fragment. Without these the picture is a zero-height box
    // that shoves the paragraph below it down the page when it loads.
    expect(img.getAttribute('width')).toBe('1200')
    expect(img.getAttribute('height')).toBe('800')
    expect(img.getAttribute('loading')).toBe('lazy')
  })

  it('renders a plain image with no caption and no figure', () => {
    const { container } = render(<RichText text={'![A line chart](https://x/y.png)'} />)
    expect(container.querySelector('figcaption')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('A line chart')
  })

  it('renders an image inside a sentence inline, never as a figure', () => {
    // <figure> is not valid inside <p>; browsers repair it by moving it out,
    // which reflows the paragraph around it.
    const { container } = render(<RichText text={'Text with ![a chart](https://x/y.png) in it.'} />)
    expect(container.querySelector('p img')).not.toBeNull()
    expect(container.querySelector('figure')).toBeNull()
  })
})

describe('embedded charts', () => {
  it('frames an embed on its own line, without allow-top-navigation', () => {
    const { container } = render(
      <RichText text={'@[Deficit chart](https://gers-explorer.com/embed/charts/deficit)'} />,
    )
    const frame = container.querySelector('iframe')!
    expect(frame.getAttribute('src')).toBe('https://gers-explorer.com/embed/charts/deficit')
    expect(frame.getAttribute('title')).toBe('Deficit chart')

    const sandbox = frame.getAttribute('sandbox') ?? ''
    // The point of the sandbox: without this an embedded page can redirect the
    // reader away from chokkablog with window.top.location.
    expect(sandbox).not.toContain('allow-top-navigation')
    // …while still granting what the charts genuinely need to run.
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).toContain('allow-same-origin')
  })

  it('degrades an embed written mid-sentence to a link, with no stray @', () => {
    // An iframe cannot sit inside a paragraph, and a link to the chart is what
    // the reader wanted from it anyway.
    const { container } = render(<RichText text={'Text @[Chart](https://x/y) more.'} />)
    expect(container.querySelector('iframe')).toBeNull()
    const link = container.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://x/y')
    expect(link.textContent).toBe('Chart')
    expect(container.textContent).toBe('Text Chart more.')
  })
})

describe('the security property', () => {
  it('refuses a javascript: link, leaving the source visible', () => {
    const { container } = render(<RichText text={'[click me](javascript:alert(1))'} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('click me')
  })

  it('refuses a javascript: image source', () => {
    const { container } = render(<RichText text={'![x](javascript:alert(1))'} />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('refuses a data: URL, which can carry a whole HTML document', () => {
    const { container } = render(<RichText text={'[x](data:text/html,<script>alert(1)</script>)'} />)
    expect(container.querySelector('a')).toBeNull()
  })

  it('refuses an embed with an unsafe URL', () => {
    const { container } = render(<RichText text={'@[Chart](javascript:alert(1))'} />)
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('renders an unknown HTML tag as text, not as markup', () => {
    const { container } = render(<RichText text={'<img src=x onerror=alert(1)> and <b>bold</b>'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

describe('ordinary formatting still works', () => {
  it('renders emphasis, links and lists', () => {
    const { container } = render(
      <RichText text={'**bold** and *italic*\n\n- one\n- two\n\n[a link](https://example.com)'} />,
    )
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('em')?.textContent).toBe('italic')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('a link').getAttribute('href')).toBe('https://example.com')
  })

  it('opens an external link in a new tab but an internal one in place', () => {
    const { container } = render(
      <RichText text={'[out](https://example.com) and [in](/insights/x)'} />,
    )
    const [ext, int] = Array.from(container.querySelectorAll('a'))
    expect(ext.getAttribute('target')).toBe('_blank')
    expect(ext.getAttribute('rel')).toContain('noopener')
    expect(int.getAttribute('target')).toBeNull()
  })
})
