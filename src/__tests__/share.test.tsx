import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { shareTargets } from '../lib/share'
import { ShareMenu } from '../components/ShareMenu'

/**
 * Sharing a post.
 *
 * Two things are worth holding still here. The first is escaping: a headline
 * with an ampersand or a question mark in it — which is most of them — silently
 * truncates the message on the receiving network if it goes out raw, and the
 * only person who ever sees that is the stranger it was sent to. The second is
 * that what gets sent is the post's own permalink and nothing else; the page
 * this button sits on can be carrying a `?q=` search term at the moment it is
 * clicked.
 */

const URL = 'https://chokkablog.scot/blog/gers-2026'
const TITLE = 'GERS 2026: what it says & what it doesn’t'

describe('share destinations', () => {
  const by = (id: string) => {
    const t = shareTargets(URL, TITLE).find((x) => x.id === id)
    if (!t) throw new Error(`no ${id} target`)
    return t
  }

  it('offers the seven agreed networks, in order', () => {
    expect(shareTargets(URL, TITLE).map((t) => t.id)).toEqual([
      'x', 'bluesky', 'facebook', 'linkedin', 'whatsapp', 'reddit', 'email',
    ])
  })

  it('escapes the URL and the title everywhere', () => {
    for (const t of shareTargets(URL, TITLE)) {
      // The raw ampersand is the failure: unescaped, everything after it in the
      // title is read as another query parameter and thrown away.
      expect(t.href).not.toContain('what it says &')
      // And the query string must survive a round trip intact.
      const q = t.href.slice(t.href.indexOf('?') + 1)
      const found = [...new URLSearchParams(q).values()].join(' ')
      expect(found).toContain(URL)
    }
  })

  it('sends the title where the network can use it', () => {
    for (const id of ['x', 'bluesky', 'whatsapp', 'reddit', 'email']) {
      const q = new URLSearchParams(by(id).href.split('?')[1])
      expect([...q.values()].join(' ')).toContain(TITLE)
    }
  })

  it('sends LinkedIn the URL alone, which is all its dialog reads', () => {
    expect(by('linkedin').href).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(URL)}`,
    )
  })

  it('puts the link last in a single-field message, so truncation cannot cut it', () => {
    for (const id of ['bluesky', 'whatsapp']) {
      const text = new URLSearchParams(by(id).href.split('?')[1]).get('text') ?? ''
      expect(text).toBe(`${TITLE} ${URL}`)
      expect(text.endsWith(URL)).toBe(true)
    }
  })

  it('opens email in the same tab rather than leaving a blank one behind', () => {
    expect(by('email').sameTab).toBe(true)
    expect(shareTargets(URL, TITLE).filter((t) => t.sameTab)).toHaveLength(1)
  })

  it('adds no tracking parameters — one post keeps one address', () => {
    for (const t of shareTargets(URL, TITLE)) {
      expect(t.href.toLowerCase()).not.toContain('utm_')
    }
  })
})

describe('the share menu', () => {
  const writeText = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    writeText.mockClear()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    // jsdom has no matchMedia; a desktop reader is `pointer: fine`, which is
    // what makes the menu the default path rather than the OS share sheet.
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  })

  afterEach(() => {
    // @ts-expect-error — putting jsdom back the way it was found
    delete navigator.share
  })

  it('opens on click and lists every destination', async () => {
    render(<ShareMenu url={URL} title={TITLE} />)
    expect(screen.queryByRole('menu')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    for (const label of ['X', 'Bluesky', 'Facebook', 'LinkedIn', 'WhatsApp', 'Reddit', 'Email', 'Copy link']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeTruthy()
    }
  })

  it('copies the link and says so, without needing a network at all', async () => {
    render(<ShareMenu url={URL} title={TITLE} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }))

    expect(writeText).toHaveBeenCalledWith(URL)
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeTruthy()
    // And the menu gets out of the way once it has done its job.
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape — a menu with no keyboard way out is a trap', async () => {
    render(<ShareMenu url={URL} title={TITLE} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Share' }))
  })

  it('closes on a click outside it', async () => {
    render(<><ShareMenu url={URL} title={TITLE} /><p>elsewhere</p></>)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    await userEvent.click(screen.getByText('elsewhere'))

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('every outbound link opens away from the page, and carries no referrer', async () => {
    render(<ShareMenu url={URL} title={TITLE} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    const x = screen.getByRole('menuitem', { name: 'X' })
    expect(x.getAttribute('target')).toBe('_blank')
    expect(x.getAttribute('rel')).toContain('noopener')
    expect(x.getAttribute('rel')).toContain('noreferrer')
    // Except the mailto:, which has nowhere to go in a new tab.
    expect(screen.getByRole('menuitem', { name: 'Email' }).getAttribute('target')).toBeNull()
  })

  it('hands a touch device to its own share sheet instead of opening the menu', async () => {
    const share = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia

    render(<ShareMenu url={URL} title={TITLE} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(share).toHaveBeenCalledWith({ title: TITLE, url: URL })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('does not fall back to the menu when the reader dismisses that sheet', async () => {
    const share = vi.fn(() => Promise.reject(new Error('AbortError')))
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia

    render(<ShareMenu url={URL} title={TITLE} />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(screen.queryByRole('menu')).toBeNull()
  })
})
