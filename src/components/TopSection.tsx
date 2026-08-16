import { useState } from 'react'
import { COLORS } from '../constants/colors'

/**
 * One collapsible section of the Admin page.
 *
 * Admin is a single long page rather than a set of routes, because the work is
 * one job — write, check the inbox, publish — and tabs would put a navigation
 * between each step. Collapsed by default keeps it scannable as sections
 * accumulate; the one with someone waiting in it opens itself.
 */
export function TopSection({ title, subtitle, defaultOpen = false, children }: {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-none p-0 mb-2"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 12 12"
          aria-hidden="true"
          style={{
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
            color: COLORS.accent,
          }}
        >
          <path d="M2 4 L6 8 L10 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
        <h2 className="text-lg font-bold m-0" style={{ color: COLORS.ink }}>
          {title}
        </h2>
        {subtitle && <span className="text-sm ml-2" style={{ color: COLORS.muted }}>{subtitle}</span>}
      </button>
      {open && <div className="pl-1">{children}</div>}
    </section>
  )
}
