import { describe, it, expect } from 'vitest'
// `?raw` gives the deployed source as a string — the Deno functions cannot be
// imported for real (they call Deno.serve at module load), and their text is what
// this file needs to assert on anyway.
import FEEDBACK_FN from '../../supabase/functions/submit-feedback/index.ts?raw'
import COMMENT_FN from '../../supabase/functions/submit-comment/index.ts?raw'
import GUARD from '../../supabase/functions/_shared/guard.ts?raw'
import { FEEDBACK_LIMITS, validateFeedback, isPlausibleEmail } from '../lib/feedback'
import { COMMENT_LIMITS, validateComment } from '../lib/comments'
import { threadComments, type PublicComment } from '../hooks/useComments'

/**
 * The two public write paths are the only places on this site where a stranger's
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
