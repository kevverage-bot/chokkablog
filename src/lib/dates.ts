/**
 * Post dates.
 *
 * Fixed to en-GB rather than the reader's locale: the date is part of the page's
 * text, it is prerendered at build time into HTML served to everyone, and a
 * format that changed per visitor would disagree with the snapshot a crawler
 * saw. One format, everywhere.
 */

const FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** "22 Aug 2024", or null for a post that has never been published. */
export function formatPostDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return FORMAT.format(d)
}

/** The `datetime` attribute for a <time> element: the date part of the ISO
 *  timestamp, which is what a machine reader wants and all it needs. */
export function isoDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 10)
}

/**
 * The calendar year a post belongs to, from its ISO timestamp.
 *
 * ⚠ FROM `published_at`, NEVER from the year in an archive post's URL. Three of
 * the 229 disagree — Blogger fixes the path at first publication and the date
 * was edited afterwards — and grouping by one while sorting by the other put
 * 2019 between 2022 and 2021 on the archive index, with a post dated February
 * 2022 sitting under it. Found live.
 *
 * Sliced from the ISO string rather than read off a Date, so the answer does not
 * depend on the reader's timezone: the archive index is prerendered in UTC on a
 * build machine and re-rendered in the browser, and the two have to agree about
 * which heading a post sits under.
 */
export function yearOf(iso: string | null | undefined): string {
  return String(iso ?? '').slice(0, 4)
}
