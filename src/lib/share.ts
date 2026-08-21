/**
 * Where a post can be shared to, and the address that does it.
 *
 * Kept out of the component and free of React so the awkward half — the
 * encoding — can be tested directly. Every one of these is a GET endpoint that
 * takes the URL and, mostly, some text; get the escaping wrong and the reader
 * sends a stranger a truncated link, which is the kind of bug that never gets
 * reported because the person who hit it isn't the person who saw it.
 *
 * No tracking parameters are appended. A share that arrives with `?utm_source=`
 * hanging off it is a different URL from the post, and the site's whole routing
 * story is that one post has one address.
 */

export type ShareTargetId = 'x' | 'bluesky' | 'facebook' | 'linkedin' | 'whatsapp' | 'reddit' | 'email'

export type ShareTarget = {
  id: ShareTargetId
  /** What the reader sees in the menu. */
  label: string
  href: string
  /** mailto: must replace the tab rather than open a blank one that never
   *  navigates and is left behind for the reader to close. */
  sameTab?: boolean
}

/**
 * The menu, in order.
 *
 * `title` is expected to be plain text — run a headline through `plainTitle`
 * first, or the asterisks a Markdown headline carries get sent as literal
 * characters to somebody who has no way to read them as emphasis.
 */
export function shareTargets(url: string, title: string): ShareTarget[] {
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(title)
  // The networks that take one free-text field rather than separate title and
  // URL fields want them joined, and the URL last so that a client which
  // truncates the message still leaves the link whole.
  const both = encodeURIComponent(`${title} ${url}`)

  return [
    { id: 'x', label: 'X', href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { id: 'bluesky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${both}` },
    { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    // LinkedIn's share-offsite dialog reads the page's own OpenGraph tags and
    // ignores any text passed to it, so passing a title would only be a lie
    // about what the reader is going to see.
    { id: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { id: 'whatsapp', label: 'WhatsApp', href: `https://api.whatsapp.com/send?text=${both}` },
    { id: 'reddit', label: 'Reddit', href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
    { id: 'email', label: 'Email', href: `mailto:?subject=${t}&body=${both}`, sameTab: true },
  ]
}
