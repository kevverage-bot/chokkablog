import type { ReactNode } from 'react'

/**
 * The site's one measure.
 *
 * The nav, every page and the footer all sit inside this, so the wordmark lines
 * up with the first word of the prose and the rule under the nav ends where the
 * content does. Getting this from a shared component rather than repeating the
 * classes is what stops one page drifting a few pixels off the others.
 */
export const CONTAINER_CLS = 'max-w-4xl mx-auto px-5 sm:px-7'

export function Container({ className = '', children }: {
  className?: string
  children: ReactNode
}) {
  return <div className={`${CONTAINER_CLS} ${className}`}>{children}</div>
}
