import { COLORS } from '../constants/colors'

/**
 * Shared treatment for content visible only to a signed-in admin because it is
 * not published yet. A dashed red outline plus a badge makes the preview state
 * unmistakable — without it, the one person who can see a draft is the one
 * person who will assume it is live.
 *
 * The outline itself is `PREVIEW_OUTLINE` in constants/colors.ts.
 */
export function PreviewBadge({ className = '', label = 'Admin preview — not published' }: {
  className?: string
  /** What makes this admin-only, where it isn't the publish flag. */
  label?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${className}`}
      style={{ backgroundColor: '#FDECEA', color: COLORS.negative }}
    >
      {label}
    </span>
  )
}
