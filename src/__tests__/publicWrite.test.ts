import { describe, it, expect, vi, afterEach } from 'vitest'
// `?raw` gives the deployed source as a string — the Deno functions cannot be
// imported for real (they call Deno.serve at module load), and their text is what
// this file needs to assert on anyway.
import FEEDBACK_FN from '../../supabase/functions/submit-feedback/index.ts?raw'
import COMMENT_FN from '../../supabase/functions/submit-comment/index.ts?raw'
import SUBSCRIBE_FN from '../../supabase/functions/subscribe/index.ts?raw'
import SUBSCRIBE_LIB from '../lib/subscribe.ts?raw'
import SUBSCRIBE_HOOK from '../hooks/useSubscribe.ts?raw'
import COMMENT_FORM from '../components/PostComments.tsx?raw'
import COMMENT_HOOK from '../hooks/useComments.ts?raw'
import FEEDBACK_FORM from '../components/FeedbackModal.tsx?raw'
import SUBSCRIBE_FORM from '../components/SubscribeBox.tsx?raw'
import CAPTCHA_HOOK from '../hooks/useCaptchaSubmit.ts?raw'
import GUARD from '../../supabase/functions/_shared/guard.ts?raw'
import { FEEDBACK_LIMITS, validateFeedback, isPlausibleEmail } from '../lib/feedback'
import { COMMENT_LIMITS, validateComment } from '../lib/comments'
import { SUBSCRIBE_LIMITS, validateSubscribe, handOverToKit, KIT_FORM_URL } from '../lib/subscribe'
import { threadComments, type PublicComment } from '../hooks/useComments'

/**
 * The three public write paths are the only places on this site where a stranger's
 * input reaches the database, so the things that constrain them are worth a test
 * of their own.
 *
 * THE DRIFT PROBLEM. Every limit exists twice: once in src/lib for a fast,
 * friendly error in the browser, and once in the Edge Function because the
 * browser's copy is ADVISORY — anyone can POST at the function directly. The
 * function is deployed alone to Deno and cannot import from src/, so the pair is
 * held together here, by reading the deployed source. If a limit is raised in one
 * place only, the symptom is either a form that rejects what the server would
 * have taken, or one that accepts what the server then refuses.
 */

/**
 * The source with its comments removed.
 *
 * These files explain themselves at length, so a bare `toContain` on the raw
 * text asserts on the prose as much as the code — and a comment SAYING a
 * function does not do something would satisfy a test checking that it does not.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** The optional-sign-up block of submit-comment, sliced out so assertions about
 *  it cannot accidentally be satisfied by the comment handling around it. */
const SUBSCRIBE_COMMENT_BLOCK = COMMENT_FN.slice(
  COMMENT_FN.indexOf('─── The optional sign-up ───'),
  COMMENT_FN.indexOf('// Best effort, and only after the row is committed.'),
)

/** Pull `key: 1234` out of the function's LIMITS literal. */
function limitIn(source: string, key: string): number {
  const m = source.match(new RegExp(`${key}:\\s*(\\d+)`))
  if (!m) throw new Error(`no ${key} limit found in the Edge Function source`)
  return Number(m[1])
}

describe('the browser and the Edge Function agree on the limits', () => {
  it('feedback', () => {
    expect(limitIn(FEEDBACK_FN, 'message')).toBe(FEEDBACK_LIMITS.message)
    expect(limitIn(FEEDBACK_FN, 'name')).toBe(FEEDBACK_LIMITS.name)
    expect(limitIn(FEEDBACK_FN, 'email')).toBe(FEEDBACK_LIMITS.email)
  })

  it('comments', () => {
    expect(limitIn(COMMENT_FN, 'body')).toBe(COMMENT_LIMITS.body)
    expect(limitIn(COMMENT_FN, 'name')).toBe(COMMENT_LIMITS.name)
    expect(limitIn(COMMENT_FN, 'email')).toBe(COMMENT_LIMITS.email)
  })

  it('subscribe', () => {
    expect(limitIn(SUBSCRIBE_FN, 'email')).toBe(SUBSCRIBE_LIMITS.email)
  })

  it('the minimum time on a form', () => {
    // A const in the shared guard rather than a LIMITS entry, so it needs its own
    // matcher.
    const m = GUARD.match(/MIN_ELAPSED_MS\s*=\s*(\d+)/)
    expect(m).toBeTruthy()
    expect(Number(m![1])).toBe(FEEDBACK_LIMITS.minElapsedMs)
  })
})

describe('the guard keeps the properties the tables depend on', () => {
  // These are assertions about the SHAPE of the deployed guard, not about style.
  // Each one is a rule the SQL comments in 006/007 rely on being true, and none
  // of them can be checked by running the function from here.
  it('fails closed when the captcha secret is missing', () => {
    // An unset secret must mean a refused write, never an unprotected one.
    expect(GUARD).toMatch(/if \(!secret\)/)
    expect(GUARD).toMatch(/Not configured yet/)
  })

  it('verifies the captcha with hCaptcha itself, server-side', () => {
    expect(GUARD).toContain('https://api.hcaptcha.com/siteverify')
  })

  it('checks the captcha before it touches the database', () => {
    // Cheap checks first: a script that cannot pass the captcha never costs a
    // query. If a rate-limit lookup moved above the verify, this catches it.
    expect(GUARD.indexOf('siteverify')).toBeLessThan(GUARD.indexOf('.from(opts.table)'))
  })

  it('salts the address before storing it', () => {
    // An unsalted hash of an IPv4 address is not anonymous — the whole space can
    // be enumerated in seconds.
    expect(GUARD).toMatch(/sha256Hex\(`\$\{salt\}:\$\{ip\}`\)/)
  })

  it('answers the honeypot with a 200, so a bot learns nothing', () => {
    expect(GUARD).toMatch(/body\.website[\s\S]{0,80}json\(\{ ok: true \}\)/)
  })
})

describe('the functions insert as pending, and only onto a published post', () => {
  it('a comment arrives unapproved', () => {
    expect(COMMENT_FN).toMatch(/status: 'pending'/)
  })

  it('a comment cannot be hung off a draft or an unknown id', () => {
    expect(COMMENT_FN).toMatch(/published !== true/)
  })
})

describe('validateFeedback', () => {
  it('needs a message', () => {
    expect(validateFeedback({ message: '  ', name: '', email: '' })).toMatch(/write a message/i)
  })

  it('takes a message with no name or email at all', () => {
    // Plenty of people want to report a wrong number without a correspondence.
    expect(validateFeedback({ message: 'That figure looks wrong.', name: '', email: '' })).toBeNull()
  })

  it('rejects an implausible address but only when one is given', () => {
    expect(validateFeedback({ message: 'x', name: '', email: 'not-an-address' })).toMatch(/email/i)
    expect(validateFeedback({ message: 'x', name: '', email: '' })).toBeNull()
  })

  it('rejects an over-long message', () => {
    const long = 'a'.repeat(FEEDBACK_LIMITS.message + 1)
    expect(validateFeedback({ message: long, name: '', email: '' })).toMatch(/longer than/i)
  })
})

describe('validateComment', () => {
  it('requires a name and an email, unlike feedback', () => {
    expect(validateComment({ body: 'Good point.', name: '', email: 'a@b.co' })).toMatch(/name/i)
    expect(validateComment({ body: 'Good point.', name: 'Jo', email: '' })).toMatch(/email/i)
    expect(validateComment({ body: 'Good point.', name: 'Jo', email: 'a@b.co' })).toBeNull()
  })

  it('rejects an over-long comment', () => {
    const long = 'a'.repeat(COMMENT_LIMITS.body + 1)
    expect(validateComment({ body: long, name: 'Jo', email: 'a@b.co' })).toMatch(/limited to/i)
  })
})

describe('isPlausibleEmail', () => {
  it('accepts the ordinary shapes', () => {
    for (const e of ['a@b.co', 'kevin.hague@example.co.uk', 'x+tag@sub.domain.org']) {
      expect(isPlausibleEmail(e)).toBe(true)
    }
  })

  it('rejects what cannot be an address', () => {
    for (const e of ['', 'nope', 'a@b', 'a b@c.d', '@b.co']) {
      expect(isPlausibleEmail(e)).toBe(false)
    }
  })
})

describe('threadComments', () => {
  const base = (over: Partial<PublicComment>): PublicComment => ({
    id: 'x', post_id: 'p', parent_id: null, is_author: false,
    author_name: 'Jo', body: 'text', created_at: '2026-01-01', approved_at: null,
    ...over,
  })

  it('nests a reply under its parent', () => {
    const threads = threadComments([
      base({ id: '1' }),
      base({ id: '2', parent_id: '1', is_author: true }),
    ])
    expect(threads).toHaveLength(1)
    expect(threads[0].replies.map((r) => r.id)).toEqual(['2'])
  })

  it('drops a reply whose parent is not published, rather than promoting it', () => {
    // An answer floating free of the thing it answers reads as a non-sequitur —
    // or worse, as agreement with something nobody can see.
    const threads = threadComments([base({ id: '2', parent_id: 'gone' })])
    expect(threads).toEqual([])
  })

  it('keeps the order it was given', () => {
    const threads = threadComments([base({ id: 'a' }), base({ id: 'b' }), base({ id: 'c' })])
    expect(threads.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
})


/**
 * THE SIGN-UP PATH.
 *
 * Each of these pins a decision that was made by testing the live Kit account on
 * 19 Aug 2026, and every one is silent when broken — the form keeps working, and
 * what changes is whether people consented, whether the record survives, or what
 * a stranger can learn.
 */
describe('subscribe keeps the properties the consent record depends on', () => {
  it('the EDGE FUNCTION does not talk to Kit', () => {
    // ⚠ THE FIX FOR THE QUARANTINE, AND THE EASIEST THING IN THIS REPO TO UNDO
    // BY TIDYING. Kit's form endpoint answers a datacentre IP with 200 and
    // `"status":"quarantined"`; the identical POST from a browser succeeds. So
    // the handover is client-side (src/lib/subscribe.ts) and this function only
    // guards and records. Moving the fetch back here looks more correct and
    // stops every confirmation email being sent.
    expect(codeOnly(SUBSCRIBE_FN)).not.toContain('kit.com')
  })

  it('the browser posts at the FORM endpoint, never at the subscribers API', () => {
    // POST /v4/subscribers adds people as `active` and sends nothing at all.
    expect(KIT_FORM_URL).toBe('https://app.kit.com/forms/9820264/subscriptions')
    expect(codeOnly(SUBSCRIBE_LIB)).not.toContain('api.kit.com')
  })

  it('needs no Kit credential anywhere', () => {
    // The form endpoint is unauthenticated, which is why there is no Kit key in
    // Supabase to leak or rotate — and no key in the bundle, where it would be
    // readable by anyone.
    expect(codeOnly(SUBSCRIBE_FN)).not.toMatch(/KIT_API_KEY|X-Kit-Api-Key/)
    expect(codeOnly(SUBSCRIBE_LIB)).not.toMatch(/KIT_API_KEY|X-Kit-Api-Key/)
  })

  it('records the consent BEFORE handing over to Kit', () => {
    // The row is the thing we are obliged to be able to produce; the handover is
    // the thing that can be retried. Reversed, a Kit outage loses the evidence
    // that somebody asked.
    // Compared at the CALL sites: `handOverToKit` also appears in the import
    // line at the top, which would make a naive indexOf compare the wrong two
    // things and pass whatever the order really was.
    const code = codeOnly(SUBSCRIBE_HOOK)
    expect(code.indexOf("invoke('subscribe'")).toBeLessThan(code.indexOf('return handOverToKit('))
  })

  it('lowercases the address, matching the check constraint on the column', () => {
    // 009_subscribers.sql refuses a row where email <> lower(email), so this is
    // not a nicety — without it the insert fails outright.
    expect(SUBSCRIBE_FN).toMatch(/\.toLowerCase\(\)/)
  })

  it('upserts, so a repeat sign-up is not an error', () => {
    expect(SUBSCRIBE_FN).toMatch(/onConflict: 'email'/)
  })

  it('does not overwrite an existing row\'s status', () => {
    // Someone already 'confirmed' must not be demoted to 'pending' for filling
    // the box in again. The upsert payload therefore names no status at all.
    const upsert = SUBSCRIBE_FN.slice(
      SUBSCRIBE_FN.indexOf('.upsert('),
      SUBSCRIBE_FN.indexOf('onConflict'),
    )
    expect(upsert).not.toMatch(/status:/)
  })

  it('never tells a stranger whether an address is already on the list', () => {
    // ⚠ Anyone can POST here with anyone else's address. A reply distinguishing
    // a new sign-up from an existing one is an oracle for testing whether a
    // given person reads chokkablog. The success response carries nothing but ok.
    expect(SUBSCRIBE_FN).toMatch(/return json\(\{ ok: true \}\)/)
    expect(codeOnly(SUBSCRIBE_FN)).not.toMatch(/already/i)
  })
})

/**
 * handOverToKit, against a stubbed Kit.
 *
 * ⚠ THE QUARANTINE CASE IS THE POINT OF THIS BLOCK. Kit answers HTTP 200 when it
 * has REFUSED a submission — the outcome is in the body, not the status line —
 * and the first version of this shipped believing a 200 meant success. A reader
 * would have been told to check an inbox for an email nobody had sent.
 */
/**
 * THE OPT-IN BESIDE THE COMMENT FORM.
 *
 * The riskiest thing added to this site, because getting it wrong is invisible
 * and unlawful at the same time: an address given so a comment can be answered
 * is NOT consent to a mailing list, and every commenter quietly enrolled is a
 * spam complaint waiting to be made against a list that has no defence.
 */
describe('the comment form only subscribes somebody who asked', () => {
  it('requires the flag to be exactly true, not merely truthy', () => {
    // `body.subscribe` arrives from the open internet. A truthiness check would
    // enrol anyone who POSTed the string "no".
    expect(SUBSCRIBE_COMMENT_BLOCK).toMatch(/body\.subscribe === true/)
  })

  it('starts unticked, and nothing can make it start ticked', () => {
    // A pre-ticked box is not consent under UK GDPR — it has to be a positive
    // act. There is deliberately no setting for this.
    expect(codeOnly(COMMENT_FORM)).toMatch(/const \[wantsEmails, setWantsEmails\] = useState\(false\)/)
    expect(codeOnly(COMMENT_FORM)).not.toMatch(/defaultChecked/)
  })

  it('writes the consent row under the captcha the comment already verified', () => {
    // A verified hCaptcha token cannot be replayed, so the browser cannot call
    // `subscribe` afterwards without a second captcha. Hence the upsert here.
    expect(SUBSCRIBE_COMMENT_BLOCK).toMatch(/\.from\('subscribers'\)/)
    expect(SUBSCRIBE_COMMENT_BLOCK).toMatch(/onConflict: 'email'/)
  })

  it('never loses the comment because the sign-up failed', () => {
    // The words are what the reader came to give. The sign-up is an extra, and
    // an extra must not be able to discard the thing it was attached to.
    expect(SUBSCRIBE_COMMENT_BLOCK).not.toMatch(/return json\(/)
    expect(SUBSCRIBE_COMMENT_BLOCK).toMatch(/console\.error/)
  })

  it('runs the sign-up AFTER the comment is stored', () => {
    const code = codeOnly(COMMENT_FN)
    expect(code.indexOf(".from('comments').insert")).toBeLessThan(code.indexOf(".from('subscribers')"))
  })

  it('believes the server about whether the sign-up happened, not the tick-box', () => {
    // ⚠ During a deploy where the site is newer than the Edge Function, the old
    // function ignores the flag entirely. Reporting success from the client's
    // own checkbox would promise a confirmation email that nothing was asked to
    // send — the reader waits for ever and blames their spam folder.
    const code = codeOnly(COMMENT_HOOK)
    expect(code).toMatch(/data\?\.subscribed === true/)
    expect(code).toMatch(/recorded \? await handOverToKit/)
  })

  it('shows the same small print as the sign-up box, not a second copy of it', () => {
    // Two versions of a disclosure is how one of them ends up wrong.
    expect(codeOnly(COMMENT_FORM)).toContain('SubscribeSmallPrint')
  })
})

describe('handOverToKit', () => {
  const kitReplies = (status: number, body: unknown) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })))
  }

  afterEach(() => { vi.unstubAllGlobals() })

  it('accepts a real success', async () => {
    kitReplies(200, { status: 'success', redirect_url: 'https://app.kit.com/forms/success' })
    await expect(handOverToKit('reader@example.com')).resolves.toEqual({ ok: true })
  })

  it('REFUSES a quarantined submission, despite the 200', async () => {
    kitReplies(200, {
      status: 'quarantined',
      url: 'https://app.kit.com/forms/guards/58b5769d-ebaa-4ca9-9808-dda3f0551b47',
    })
    const res = await handOverToKit('reader@example.com')
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('refuses anything that is not explicitly a success', async () => {
    kitReplies(200, { status: 'error' })
    await expect(handOverToKit('reader@example.com')).resolves.toMatchObject({ ok: false })
    kitReplies(500, {})
    await expect(handOverToKit('reader@example.com')).resolves.toMatchObject({ ok: false })
  })

  it('survives a blocked or unreachable Kit rather than throwing', async () => {
    // An extension or a network that refuses kit.com throws instead of answering,
    // and a rejected promise here would take the whole form down with it.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('blocked') }))
    await expect(handOverToKit('reader@example.com')).resolves.toMatchObject({ ok: false })
  })

  it('sends the address lowercased, as the consent row stores it', async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success' }) }))
    vi.stubGlobal('fetch', spy)
    await handOverToKit('  Reader@Example.COM  ')
    const body = JSON.parse((spy.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body.email_address).toBe('reader@example.com')
  })
})

describe('validateSubscribe', () => {
  it('requires an address — it is the entire point of the box', () => {
    expect(validateSubscribe('   ')).toMatch(/enter your email/i)
  })

  it('rejects one that is not plausibly an address', () => {
    expect(validateSubscribe('kevin')).toMatch(/does not look right/i)
    expect(validateSubscribe('kevin@example.com')).toBeNull()
  })

  it('takes a plus-addressed alias, which is a real address people use', () => {
    expect(validateSubscribe('kev+chokka@example.com')).toBeNull()
  })

  it('rejects an over-long one', () => {
    expect(validateSubscribe('a'.repeat(SUBSCRIBE_LIMITS.email) + '@example.com'))
      .toMatch(/too long/i)
  })
})


/**
 * ⚠ ALL THREE FORMS SHARE THE CAPTCHA RULE.
 *
 * The rule — a press with no token arms the form, solving it sends — is easy to
 * re-implement badly in one form and leave the other two behind, and the symptom
 * is not a crash: it is a reader saying what they want twice, or worse, a
 * half-written comment posting itself when a token quietly renews. One copy, in
 * hooks/useCaptchaSubmit.ts, for the same reason the Edge Functions share
 * _shared/guard.ts.
 */
describe('the three public forms handle the captcha the same way', () => {
  const forms: [string, string][] = [
    ['the sign-up box', SUBSCRIBE_FORM],
    ['the comment form', COMMENT_FORM],
    ['the feedback form', FEEDBACK_FORM],
  ]

  for (const [name, source] of forms) {
    it(`${name} uses the shared hook`, () => {
      expect(codeOnly(source)).toContain('useCaptchaSubmit(')
    })

    it(`${name} does not keep its own token state`, () => {
      // A form holding its own token has stopped using the shared rule, however
      // much it still imports it. Matched on the setters rather than on the
      // useState call — every form has a `useState<string | null>` for its error
      // message, and asserting on that shape would fail for the wrong reason.
      expect(codeOnly(source)).not.toMatch(/setToken\(/)
      expect(codeOnly(source)).not.toMatch(/setAttempt\(/)
    })

    it(`${name} tells the reader it is waiting rather than scolding them`, () => {
      // role=status, not role=alert: being asked to prove you are human is not
      // a mistake the reader made.
      expect(source).toMatch(/captcha\.armed && !error/)
      expect(source).toMatch(/Waiting for the captcha/)
    })
  }

  it('a token arriving unasked never submits anything', () => {
    // hCaptcha re-verifies by itself when a token expires. Without the armed
    // check that would post a comment somebody was still writing.
    expect(codeOnly(CAPTCHA_HOOK)).toMatch(/if \(!t \|\| !armed\) return/)
  })

  it('a failed send disarms before it clears the token', () => {
    // Clearing the token remounts the widget, which mints a fresh one. Still
    // armed at that moment, the form would resubmit the request that has just
    // failed, for as long as it kept failing.
    const code = codeOnly(CAPTCHA_HOOK)
    expect(code.indexOf('setArmed(false)')).toBeLessThan(code.indexOf('setToken(null)'))
  })
})
