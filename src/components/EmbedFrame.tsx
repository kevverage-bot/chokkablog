import { useEffect, useRef, useState } from 'react'
import { COLORS } from '../constants/colors'

/**
 * An interactive chart from one of the tool sites, sitting inside a post.
 *
 * This is why the blog doesn't need a chart library: GERS Explorer, the CRA
 * explorer and the OECD benchmarks already draw these, already keep them current
 * with the data, and already expose an embed URL. A post links to the real thing
 * rather than a screenshot that goes stale the day the figures are revised.
 *
 * ⚠ SANDBOX. `allow-top-navigation` is deliberately absent, which is the whole
 * reason the attribute is here: without it, an embedded page can call
 * `window.top.location = …` and redirect a reader who is looking at chokkablog.
 * Everything else the charts genuinely need is granted:
 *   allow-scripts               they are applications, not images
 *   allow-same-origin           so they keep their own origin and can reach
 *                               their own data (without this they are opaque and
 *                               most of them simply fail to load)
 *   allow-popups + …-to-escape-sandbox
 *                               their "explore this chart" links open a real tab
 *                               rather than another sandboxed one
 *
 * allow-scripts together with allow-same-origin is the combination usually
 * warned about, and that warning is about SAME-ORIGIN frames, where it lets the
 * frame remove its own sandbox. These are cross-origin, so it does not apply.
 */
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms'

/**
 * postMessage `type`s carrying an iframe height that we honour.
 *
 * Each tool speaks its own: GERS Explorer emits `gers-embed-height`, the CRA
 * charts emit `cra-embed-resize`. An embed that reports nothing keeps the
 * fallback height, which is why that has to be a usable size and not zero.
 */
const HEIGHT_MESSAGE_TYPES = new Set(['gers-embed-height', 'cra-embed-resize'])

/** Ignore an absurd reported height — a mis-measured frame that asks for 40,000
 *  pixels would otherwise push the rest of the post off the end of the page. */
const MAX_HEIGHT = 4000

interface EmbedFrameProps {
  url: string
  title?: string
  /** Height until the embedded page reports its own. Reserved from the first
   *  paint, so the text below does not jump when the chart arrives. */
  minHeight?: number
}

export function EmbedFrame({ url, title = 'Embedded chart', minHeight = 480 }: EmbedFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(minHeight)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Matched against THIS frame's contentWindow, so several embeds in one
      // post each size independently rather than all taking the last message.
      if (
        e.data && HEIGHT_MESSAGE_TYPES.has(e.data.type) &&
        ref.current && e.source === ref.current.contentWindow &&
        typeof e.data.height === 'number' && Number.isFinite(e.data.height)
      ) {
        setHeight(Math.min(MAX_HEIGHT, Math.max(minHeight, e.data.height)))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [minHeight])

  return (
    <iframe
      ref={ref}
      src={url}
      title={title}
      loading="lazy"
      sandbox={SANDBOX}
      referrerPolicy="strict-origin-when-cross-origin"
      className="block w-full rounded-lg border"
      style={{ height, borderColor: COLORS.border }}
    />
  )
}
