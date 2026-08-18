import { describe, it, expect } from 'vitest'
import { foldPunctuation, matchable, matchesAll, snippet, tokenPattern, tokenize } from '../lib/search'

/**
 * These cover the failure this code exists to prevent: a query typed on a phone,
 * where the keyboard has silently substituted typographic punctuation, matching
 * text written with the ASCII form — and vice versa. It is invisible in a code
 * review because the two forms look identical in most fonts, so it is tested
 * instead.
 */

describe('foldPunctuation', () => {
  it('folds every quote form to the ASCII one', () => {
    expect(foldPunctuation('“north sea”')).toBe('"north sea"')
    expect(foldPunctuation('Scotland’s')).toBe("Scotland's")
  })

  it('folds dashes and the non-breaking space', () => {
    expect(foldPunctuation('Scotland − UK')).toBe('Scotland - UK')
    expect(foldPunctuation('a—b')).toBe('a-b')
    expect(foldPunctuation('a b')).toBe('a b')
  })

  it('is length-preserving, so offsets survive it', () => {
    // Load-bearing: a snippet finds an index in the folded copy and then slices
    // the ORIGINAL string with it. Any 1→2 mapping silently corrupts that.
    const samples = ['“quoted”', 'a—b–c', 'x y', "plain ascii"]
    for (const s of samples) expect(foldPunctuation(s)).toHaveLength(s.length)
  })

  it('leaves ordinary text alone', () => {
    expect(foldPunctuation('north sea revenue')).toBe('north sea revenue')
  })
})

describe('tokenize', () => {
  it('splits on whitespace and drops single characters', () => {
    expect(tokenize('north sea a revenue')).toEqual(['north', 'sea', 'revenue'])
  })

  it('keeps a quoted phrase whole, and puts phrases first', () => {
    expect(tokenize('deficit "north sea" revenue')).toEqual(['north sea', 'deficit', 'revenue'])
  })

  it('treats curly quotes as quotes — this is what a phone types', () => {
    expect(tokenize('“north sea”')).toEqual(['north sea'])
  })

  it('ignores a dangling quote rather than returning nothing', () => {
    // Mid-typing. The old behaviour let the stray quote cling to the word and
    // match nothing at all.
    expect(tokenize('"north sea')).toEqual(['north', 'sea'])
  })

  it('is empty for an empty query', () => {
    expect(tokenize('   ')).toEqual([])
  })
})

describe('tokenPattern', () => {
  const matches = (token: string, text: string) =>
    new RegExp(tokenPattern(token), 'i').test(text)

  it('matches display text whichever apostrophe either side used', () => {
    expect(matches("scotland's", 'Scotland’s deficit')).toBe(true)
    expect(matches("scotland's", "Scotland's deficit")).toBe(true)
  })

  it('matches across dash variants and non-breaking spaces', () => {
    expect(matches('scotland - uk', 'Scotland − UK')).toBe(true)
    expect(matches('north sea', 'north sea')).toBe(true)
  })

  it('escapes regex metacharacters in the token', () => {
    // A query of "a.b" must not match "axb" via the wildcard dot.
    expect(matches('a.b', 'axb')).toBe(false)
    expect(matches('a.b', 'a.b')).toBe(true)
  })
})

describe('matchable', () => {
  it('lowercases and folds, so tokens can be compared against it', () => {
    expect(matchable('The North Sea — “Scotland’s”')).toBe('the north sea - "scotland\'s"')
  })

  it('survives null and undefined, which arrive from nullable columns', () => {
    expect(matchable(null as unknown as string)).toBe('')
    expect(matchable(undefined as unknown as string)).toBe('')
  })
})

describe('matchesAll', () => {
  it('requires every token, in any order', () => {
    expect(matchesAll('The north sea and its revenue', ['revenue', 'north'])).toBe(true)
    expect(matchesAll('The north sea', ['revenue', 'north'])).toBe(false)
  })

  it('folds the haystack, not just the tokens', () => {
    // The bug this exists to prevent: the query has been folded on its way in, so
    // comparing it against unfolded text applies the fold to one side only.
    expect(matchesAll('Scotland’s deficit', ["scotland's"])).toBe(true)
  })

  it('is vacuously true for no tokens, so callers must check first', () => {
    expect(matchesAll('anything', [])).toBe(true)
  })
})

describe('snippet', () => {
  const long = (word: string) => `${'padding '.repeat(30)}${word}${' trailing'.repeat(30)}`

  it('centres on the first token present and marks both clipped ends', () => {
    const out = snippet(long('deficit'), ['deficit'])
    expect(out).toContain('deficit')
    expect(out.startsWith('…')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
  })

  it('keeps the author’s punctuation, having only folded to find the match', () => {
    // The fold is length-preserving precisely so this slice is safe: the index
    // came from the folded copy and the text comes from the original.
    expect(snippet('It was “Scotland’s” deficit', ["scotland's"])).toBe('It was “Scotland’s” deficit')
  })

  it('does not cut a word in half at either end', () => {
    const out = snippet(long('deficit'), ['deficit'], 20)
    for (const word of out.replace(/…/g, ' ').trim().split(/\s+/)) {
      expect(['padding', 'deficit', 'trailing']).toContain(word)
    }
  })

  it('returns the whole text when it is shorter than the window', () => {
    expect(snippet('Short enough already.', ['short'])).toBe('Short enough already.')
  })

  it('falls back to the opening when no token appears in the text', () => {
    // Happens whenever a post matched on its headline alone.
    expect(snippet('The opening of the body.', ['unrelated'])).toBe('The opening of the body.')
    expect(snippet(long('x'), ['unrelated']).endsWith('…')).toBe(true)
  })

  it('is empty for empty text, so a result can omit the line entirely', () => {
    expect(snippet('', ['deficit'])).toBe('')
    expect(snippet('   ', ['deficit'])).toBe('')
  })
})
