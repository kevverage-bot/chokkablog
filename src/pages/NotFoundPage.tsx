import { useEffect } from 'react'
import { COLORS } from '../constants/colors'
import { pathForPage, plainClick, type PageId } from '../lib/routes'
import { Container } from '../components/Container'

/**
 * Shown when the path matched no route.
 *
 * The `noindex` tag is the point of this page. Vercel's catch-all rewrite answers
 * 200 for every path — which is what lets a post published since the last
 * prerender still resolve — so the server cannot say "not found" on our behalf.
 * Without this, every mistyped or stale URL becomes another indexable duplicate
 * of the home page. `follow` is kept so the links out of here still count.
 */
export function NotFoundPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,follow'
    document.head.appendChild(meta)
    return () => { meta.remove() }
  }, [])

  return (
    <Container className="py-16">
      <h1 className="text-2xl font-extrabold mb-2" style={{ color: COLORS.ink, letterSpacing: '-0.5px' }}>
        Not found
      </h1>
      <p className="text-sm mb-4" style={{ color: COLORS.muted }}>
        There&rsquo;s nothing at this address — it may have been moved or renamed.
      </p>
      <a
        href={pathForPage('home')}
        onClick={(e) => { if (plainClick(e)) { e.preventDefault(); onNavigate('home') } }}
        className="text-sm font-semibold no-underline hover:underline"
        style={{ color: COLORS.accent }}
      >
        &larr; Home
      </a>
    </Container>
  )
}
