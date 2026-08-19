import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubscribeBox } from '../components/SubscribeBox'
import { FALLBACK_SUBSCRIBE_CONTENT } from '../constants/subscribe'

/**
 * The sign-up box.
 *
 * Its pitch is editable in Admin, which creates the failure this file exists to
 * prevent: a box that asks a stranger for an email address while saying nothing
 * about what it is for. Consent is what the words say it is, so the words
 * failing to load cannot be allowed to produce a silent collection form.
 *
 * The other half is the small print, which is NOT editable and must not become
 * so — see the note on SubscribeSmallPrint.
 */

let wording: { data: unknown; error: { message: string } | null } = {
  data: null, error: { message: 'relation does not exist' },
}

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.maybeSingle = () => Promise.resolve(wording)
  return { supabase: { from: () => chain, functions: { invoke: vi.fn() } } }
})

beforeEach(() => {
  wording = { data: null, error: { message: 'relation does not exist' } }
})

describe('SubscribeBox', () => {
  it('renders the wording the database gives it', async () => {
    wording = {
      data: {
        heading: 'Get the good ones',
        intro: 'Rarely, and only when it matters.',
        button: 'Go on then',
        comment_optin: 'Email me too',
      },
      error: null,
    }
    render(<SubscribeBox />)

    expect(await screen.findByText('Get the good ones')).toBeTruthy()
    expect(screen.getByText('Rarely, and only when it matters.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go on then' })).toBeTruthy()
  })

  it('falls back to the bundled pitch when the wording cannot be read', async () => {
    // ⚠ The box must still work on the deploy that lands before the migration.
    render(<SubscribeBox />)

    expect(await screen.findByText(FALLBACK_SUBSCRIBE_CONTENT.heading)).toBeTruthy()
    expect(screen.getByText(FALLBACK_SUBSCRIBE_CONTENT.intro)).toBeTruthy()
  })

  it('NEVER shows an unlabelled button, even if the pitch is emptied', async () => {
    // A blank heading is an editorial decision and is honoured. A blank button
    // is not a decision anybody would make.
    wording = { data: { heading: '', intro: '', button: '', comment_optin: '' }, error: null }
    render(<SubscribeBox />)

    expect(await screen.findByRole('button', { name: FALLBACK_SUBSCRIBE_CONTENT.button }))
      .toBeTruthy()
    expect(screen.queryByText(FALLBACK_SUBSCRIBE_CONTENT.heading)).toBeNull()
  })

  it('shows the small print whatever the database says, because it is not from there', async () => {
    // ⚠ THE POINT OF THIS TEST. The disclosure at the point of collection —
    // confirmation, sole use, never shared, unsubscribe, the notice — has to
    // survive any edit to the pitch above it, including one that empties it.
    wording = { data: { heading: '', intro: '', button: '', comment_optin: '' }, error: null }
    render(<SubscribeBox />)

    expect(await screen.findByText(/email asking you to confirm/i)).toBeTruthy()
    expect(screen.getByText(/never shared or sold/i)).toBeTruthy()
    expect(screen.getByText(/unsubscribe link/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /privacy notice/i }).getAttribute('href'))
      .toBe('/privacy')
  })

  it('keeps hCaptcha off the page until somebody actually types', async () => {
    // The box is on nearly every page now. Mounting ~10 kB of third-party iframe
    // for every reader to serve the few who sign up is the cost this avoids.
    render(<SubscribeBox />)

    const field = await screen.findByLabelText(/email address/i)
    expect(document.querySelector('[data-hcaptcha-widget-id], iframe')).toBeNull()

    await userEvent.type(field, 'a')
    // The widget is lazy-loaded, so what is asserted is that something now
    // renders in its place rather than nothing at all.
    expect(await screen.findByText(/Loading the captcha/i)).toBeTruthy()
  })
})
