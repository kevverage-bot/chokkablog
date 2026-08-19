import { describe, it, expect } from 'vitest'
import { subscribersToCsv, countByStatus, type Subscriber } from '../hooks/useSubscribers'

/**
 * The export is the escape hatch.
 *
 * Keeping our own copy of the list is only worth the trouble while getting it
 * out is one click — otherwise "I can move off Kit whenever I like" is a claim
 * rather than a fact. The same file answers a subject access request, so a
 * quoting bug here is not cosmetic: it silently shifts every later column, and
 * the person reading the file has no way to know.
 */

const sub = (over: Partial<Subscriber>): Subscriber => ({
  id: 'x', created_at: '2026-08-19T12:00:00Z', email: 'a@example.com',
  source: 'site', source_page: '/blog/a-post', status: 'pending',
  confirmed_at: null, kit_error: null, admin_note: null, ...over,
})

describe('subscribersToCsv', () => {
  it('writes a header and one row per subscriber', () => {
    const csv = subscribersToCsv([sub({ email: 'a@example.com' }), sub({ email: 'b@example.com' })])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('email,status,signed_up_at,source,source_page,confirmed_at,note')
    expect(lines).toHaveLength(3)
    expect(lines[1].startsWith('a@example.com,')).toBe(true)
  })

  it('⚠ quotes a field containing a comma, so later columns do not shift', () => {
    const csv = subscribersToCsv([sub({ admin_note: 'asked twice, then confirmed' })])
    expect(csv).toContain('"asked twice, then confirmed"')
  })

  it('⚠ doubles an embedded quote rather than ending the field early', () => {
    const csv = subscribersToCsv([sub({ admin_note: 'said "no thanks"' })])
    expect(csv).toContain('"said ""no thanks"""')
  })

  it('quotes a field containing a newline', () => {
    const csv = subscribersToCsv([sub({ admin_note: 'line one\nline two' })])
    expect(csv).toContain('"line one\nline two"')
  })

  it('leaves an ordinary field unquoted', () => {
    // An email address cannot contain a comma or a quote, so quoting every cell
    // would only make the file harder to read.
    expect(subscribersToCsv([sub({})])).toContain('a@example.com,pending,')
  })

  it('writes empty cells for the nulls rather than the word "null"', () => {
    const csv = subscribersToCsv([sub({ source_page: null, confirmed_at: null, admin_note: null })])
    expect(csv).not.toMatch(/null/i)
    expect(csv.split('\r\n')[1].endsWith(',,,')).toBe(true)
  })

  it('exports a header even with nobody on the list', () => {
    expect(subscribersToCsv([])).toBe('email,status,signed_up_at,source,source_page,confirmed_at,note')
  })
})

describe('countByStatus', () => {
  it('counts each state and the total', () => {
    const counts = countByStatus([
      sub({ status: 'pending' }), sub({ status: 'pending' }),
      sub({ status: 'confirmed' }), sub({ status: 'unsubscribed' }),
    ])
    expect(counts).toEqual({ total: 4, pending: 2, confirmed: 1, unsubscribed: 1, failed: 0 })
  })

  it('is all zeroes for an empty list', () => {
    expect(countByStatus([])).toEqual({ total: 0, pending: 0, confirmed: 0, unsubscribed: 0, failed: 0 })
  })

  it('does not let an unexpected status corrupt the counts', () => {
    // The check constraint prevents this, but a count that silently becomes NaN
    // on the day it does not is a worse failure than an ignored row.
    const counts = countByStatus([sub({ status: 'bogus' as Subscriber['status'] })])
    expect(counts.total).toBe(1)
    expect(counts.pending + counts.confirmed + counts.unsubscribed + counts.failed).toBe(0)
  })
})
