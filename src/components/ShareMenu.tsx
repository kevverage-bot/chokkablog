import { useEffect, useRef, useState } from 'react'
import { COLORS } from '../constants/colors'
import { shareTargets } from '../lib/share'

/**
 * Share, with somewhere to share it to.
 *
 * Two behaviours behind one button, chosen by what the device can do:
 *
 *  - On a touch device, the operating system's own share sheet. It lists the
 *    apps that reader actually has — Messages, Signal, whatever they use — which
 *    is a list no website can guess at, and it hands off without opening a
 *    logged-out web view of a network they are signed into in an app.
 *  - Everywhere else, this menu. Desktop Safari and Edge do have `navigator.share`,
 *    but their sheets are thin, so a coarse pointer is the test rather than
 *    the API's presence.
 *
 * Copy link stays in both paths. It is the one destination that always works
 * and asks nothing of the reader, and for a lot of people it is the whole
 * feature.
 */
export function ShareMenu({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  // Escape closes, and gives the keyboard back to the button that opened it —
  // otherwise focus is left on a menu that is no longer there.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); button.current?.focus() }
    }
    // A click anywhere else closes it. `mousedown` rather than `click` so the
    // menu is gone before whatever was clicked underneath reacts.
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setOpen(false)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked — no-op rather than an error the reader can't act on */ }
  }

  const onShare = async () => {
    // Touch first. `pointer: coarse` is the finger test; a laptop with a
    // touchscreen still reports `fine` for its trackpad and so gets the menu.
    const touch = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches
    if (touch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // Dismissing the sheet rejects exactly as a failure does, and there is
        // no way to tell them apart. Falling through to the menu would put a
        // second chooser in front of somebody who has just said no, so this
        // ends here.
        return
      }
    }
    setOpen((v) => !v)
  }

  const itemCls = 'block w-full text-left px-3 py-1.5 text-xs no-underline hover:bg-gray-50 cursor-pointer bg-transparent border-none'

  return (
    <span className="relative inline-block" ref={wrap}>
      <button
        ref={button}
        type="button"
        onClick={onShare}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Share this post"
        className="cursor-pointer bg-transparent border-none p-0 text-xs underline"
        style={{ color: 'inherit', font: 'inherit' }}
      >
        {copied ? 'Link copied' : 'Share'}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Share this post"
          // Above the prose and any embedded chart's iframe, which otherwise
          // paints over a menu that overlaps it.
          className="absolute left-0 top-full mt-2 z-30 w-36 rounded-lg border py-1 shadow-lg"
          style={{ background: '#fff', borderColor: COLORS.border, color: COLORS.ink }}
        >
          {shareTargets(url, title).map((t) => (
            <a
              key={t.id}
              role="menuitem"
              href={t.href}
              target={t.sameTab ? undefined : '_blank'}
              // noreferrer as well as noopener: the receiving network gets the
              // URL because the reader is sending it, and does not need to be
              // told which page they were on when they decided to.
              rel="nofollow noopener noreferrer"
              onClick={() => setOpen(false)}
              className={itemCls}
              style={{ color: 'inherit' }}
            >
              {t.label}
            </a>
          ))}
          <span className="block my-1 border-t" style={{ borderColor: COLORS.border }} />
          <button role="menuitem" type="button" onClick={copy} className={itemCls} style={{ color: 'inherit', font: 'inherit' }}>
            Copy link
          </button>
        </div>
      )}
    </span>
  )
}
