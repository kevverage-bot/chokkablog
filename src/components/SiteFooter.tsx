import { lazy, Suspense, useState } from 'react'
import { COLORS } from '../constants/colors'
import { CAPTCHA_CONFIGURED } from '../lib/captcha'

/**
 * Split out of the main bundle: the form and its captcha are only ever needed by
 * a reader who has decided to write something.
 */
const FeedbackModal = lazy(() =>
  import('./FeedbackModal').then((m) => ({ default: m.FeedbackModal })),
)

/**
 * The foot of every page, rendered once from App so a new page gets it without
 * having to remember to.
 *
 * It carries the Feedback trigger, and the footer is the right home for it
 * precisely because it is the one thing on every page: a reader can report a
 * wrong-looking number from wherever they found it, and the form sends that
 * page's URL with the message.
 */
export function SiteFooter() {
  const [open, setOpen] = useState(false)

  return (
    <footer className="text-center mt-16 mb-6">
      <p className="text-xs flex items-center justify-center gap-3" style={{ color: COLORS.faint }}>
        <span>chokkablog.com</span>
        {/* Hidden rather than shown-and-broken when there is no captcha: the Edge
            Function refuses the write without one, so the form could only throw
            away what somebody wrote. See lib/captcha.ts. */}
        {CAPTCHA_CONFIGURED && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="cursor-pointer bg-transparent border-none p-0 underline"
              style={{ color: 'inherit', font: 'inherit' }}
            >
              Feedback
            </button>
          </>
        )}
        <span aria-hidden="true">·</span>
        {/* A real link, so a feed reader can find the feed by following it and a
            crawler counts it. The <link rel="alternate"> in index.html is for
            software; this one is for people. */}
        <a href="/rss.xml" className="underline" style={{ color: 'inherit' }}>RSS</a>
      </p>

      {open && (
        <Suspense fallback={null}>
          <FeedbackModal onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </footer>
  )
}
