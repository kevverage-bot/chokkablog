import { COLORS } from '../constants/colors'

/**
 * The foot of every page, rendered once from App so a new page gets it without
 * having to remember to.
 *
 * From Phase 4 this also carries the Feedback trigger. The footer is the one
 * thing on every page, which is what makes it the right home for it: a reader can
 * report a wrong-looking number from wherever they found it, and the form sends
 * that page's URL along with the message.
 */
export function SiteFooter() {
  return (
    <footer className="text-center mt-16 mb-6">
      <p className="text-xs" style={{ color: COLORS.faint }}>
        chokkablog.com
      </p>
    </footer>
  )
}
