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
