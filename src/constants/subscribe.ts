import type { SubscribeContent } from '../hooks/useSubscribeContent'

/**
 * The sign-up box's wording as it stands in the code, and what it falls back to.
 *
 * The live wording lives in the database (supabase/010_subscribe.sql) so it can
 * be edited in Admin. These are the same words, kept here for two situations:
 * the deploy that lands before the migration has been run, and any read that
 * fails on the day.
 *
 * ⚠ Unlike the home page's fallback, this one applies to an EMPTY read as well
 * as a failed one. An emptied tools grid is a decision somebody made; an
 * unlabelled submit button is not a decision anybody would make, and a sign-up
 * box with no pitch is worse than useless — it asks for an address without
 * saying what for, which is the one thing consent cannot be.
 *
 * Worth keeping in step with the seed values in 010_subscribe.sql, but nothing
 * breaks if they drift — the database wins the moment it answers.
 */
export const FALLBACK_SUBSCRIBE_CONTENT: SubscribeContent = {
  heading: 'New posts by email',
  intro:
    'I write when there is something to say, and I will only email you when I ' +
    'think a piece is worth your attention — not every time I post.',
  button: 'Keep me posted',
  comment_optin: 'Also email me when there is a new post worth reading',
}
