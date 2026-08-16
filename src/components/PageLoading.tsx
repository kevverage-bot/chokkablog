import { COLORS } from '../constants/colors'

/**
 * Shown in place of a whole page while its content loads.
 *
 * The reserved height is the entire point of this component.
 *
 * Every page is followed by the site footer, so a placeholder shorter than the
 * viewport leaves the footer near the top of the screen — and then throws it down
 * the full height of the page the moment the content arrives. On GERS Explorer
 * that single shift of a fully-visible element was what put four pages in
 * Vercel's "poor" Cumulative Layout Shift bucket (0.34–0.66), while the one page
 * rendering straight from static JSON scored 0.
 *
 * Claiming a viewport keeps the footer below the fold, so nothing that was
 * visible moves. Over-reserving is safe: an element arriving into view for the
 * first time is not a layout shift, whereas one already on screen being pushed
 * down is the most heavily penalised thing CLS measures.
 *
 * Better still, where it is cheap, is to render the page's own frame immediately
 * and placeholder only the part that is waiting. Reach for this when that would
 * mean restructuring the page.
 */
export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="min-h-screen flex items-start justify-center pt-24 text-sm"
      style={{ color: COLORS.muted }}
    >
      {label}
    </div>
  )
}
