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

/** The last token the fake captcha was told to hand back, and the hook that
 *  lets a test "solve" it. */
let solveCaptcha: (token: string | null) => void = () => {}

vi.mock('../components/Captcha', () => ({
  // Stands in for the hCaptcha iframe, which cannot run here. It exposes a
  // button so a test can solve it at the moment a reader would.
  Captcha: ({ onToken }: { onToken: (t: string | null) => void }) => {
    solveCaptcha = onToken
    return <button type="button" onClick={() => onToken('a-verified-token')}>I am human</button>
  },
}))

const invoke = vi.fn(async () => ({ data: { ok: true }, error: null }))

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.maybeSingle = () => Promise.resolve(wording)
  return { supabase: { from: () => chain, functions: { invoke: (...a: unknown[]) => invoke(...(a as [])) } } }
})

vi.mock('../lib/subscribe', async (orig) => ({
  ...(await orig<typeof import('../lib/subscribe')>()),
  // Kit's handover is the browser's job now; it is covered by its own tests.
  handOverToKit: vi.fn(async () => ({ ok: true })),
}))

beforeEach(() => {
  wording = { data: null, error: { message: 'relation does not exist' } }
  invoke.mockClear()
  solveCaptcha = () => {}
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
    // Asserted against the stand-in Captcha above: what matters is that the
    // component is not MOUNTED, not what it renders once it is.
    render(<SubscribeBox />)

    const field = await screen.findByLabelText(/email address/i)
    expect(screen.queryByRole('button', { name: 'I am human' })).toBeNull()

    await userEvent.type(field, 'a')
    expect(await screen.findByRole('button', { name: 'I am human' })).toBeTruthy()
  })
})


/**
 * ⚠ ONE PRESS, NOT TWO.
 *
 * The form used to say "please complete the captcha", wait for the reader to do
 * exactly that, and then sit there until they pressed the same button a second
 * time — having already been told precisely what was wanted. On a one-field form
 * that happens on EVERY sign-up, because there is nothing to type that would
 * make you pause long enough to solve the captcha first. It is the point at
 * which a mildly interested reader gives up, and it is invisible in every test
 * that drives the form in the "right" order.
 */
describe('the captcha does not cost a second click', () => {
  const fill = async () => {
    render(<SubscribeBox />)
    await userEvent.type(await screen.findByLabelText(/email address/i), 'reader@example.com')
  }

  it('signs them up as soon as the captcha is solved, with no second press', async () => {
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Keep me posted' }))
    expect(invoke).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'I am human' }))

    expect(await screen.findByText(/check your inbox/i)).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('says what is about to happen, and does not call it an error', async () => {
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Keep me posted' }))

    expect(await screen.findByText(/signed up as soon as you do/i)).toBeTruthy()
    // role=alert is for something that went wrong. Being asked to prove you are
    // human is not a mistake the reader made.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /Waiting for the captcha/i })).toBeTruthy()
  })

  it('still works the ordinary way round, solving first and then pressing', async () => {
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'I am human' }))
    // Solving it unprompted must NOT submit anything on its own.
    expect(invoke).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Keep me posted' }))
    expect(await screen.findByText(/check your inbox/i)).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('⚠ a token arriving on its own never signs anybody up', async () => {
    // The widget re-verifies by itself when a token expires. Without the armed
    // flag that would post the form behind the reader's back.
    await fill()
    solveCaptcha('a-verified-token')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not resubmit for ever when the send fails', async () => {
    // A failure clears the token and remounts the widget, which mints a fresh
    // one. Disarming first is what stops that fresh token bouncing straight back
    // into another attempt.
    invoke.mockImplementationOnce(async () => ({ data: { ok: false, error: 'Nope.' }, error: null }))
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Keep me posted' }))
    await userEvent.click(screen.getByRole('button', { name: 'I am human' }))

    expect(await screen.findByText('Nope.')).toBeTruthy()
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
