import { useState, useRef, useEffect } from 'react'
import { COLORS } from '../constants/colors'
import { useAuth } from '../hooks/useAuth'
import { pathForPage, plainClick, type PageId } from '../lib/routes'
import { Container, CONTAINER_CLS } from './Container'

/**
 * The site header: the wordmark, the sections, and the auth state.
 *
 * Light rather than a coloured bar — the design puts a single 1px rule under the
 * nav and lets the content carry the page. The coral appears only on the
 * wordmark's dot and the active section.
 */

interface NavItem {
  id: PageId
  label: string
  adminOnly?: boolean
  /** Shown as a magnifier on the wide layout, where the label would compete with
   *  the sections for attention — search is a tool, not a part of the site. The
   *  dropped-down menu still spells it out, because an icon in a list of words
   *  reads as a missing label. */
  icon?: 'search'
}

// Tools, Archive and About join this as their pages land. Nothing is listed
// before its page exists — see the note at the top of lib/routes.ts.
const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'blog', label: 'Blog' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'admin', label: 'Admin', adminOnly: true },
]

interface NavBarProps {
  /** `null` on a page that is not a section — the 404 — so nothing is marked
   *  current. `aria-current="page"` on Home while the reader is looking at a
   *  "not found" is a lie to a screen reader as much as to the eye. */
  activePage: PageId | null
  onNavigate: (page: PageId) => void
}

export function NavBar({ activePage, onNavigate }: NavBarProps) {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  /**
   * Sections are real anchors, so they can be cmd-clicked, middle-clicked and
   * copied as link addresses — and so a crawler has something to follow. The
   * handler takes over for a plain left-click only.
   */
  const navClick = (id: PageId) => (e: React.MouseEvent) => {
    if (!plainClick(e)) return
    e.preventDefault()
    onNavigate(id)
    setMenuOpen(false)
  }

  return (
    <header>
      <nav className={`${CONTAINER_CLS} flex items-baseline justify-between py-5`}>
        <a
          href={pathForPage('home')}
          onClick={navClick('home')}
          className="text-2xl font-extrabold tracking-tight no-underline select-none"
          style={{ color: COLORS.ink, letterSpacing: '-1px' }}
        >
          Chokkablog<span style={{ color: COLORS.accent }}>.</span>
        </a>

        {/* Desktop sections */}
        <div className="hidden sm:flex items-baseline gap-6">
          {visibleItems.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              active={item.id === activePage}
              onClick={navClick(item.id)}
            />
          ))}
          <AuthControl profile={profile} onSignOut={signOut} onClick={navClick('login')} />
        </div>

        {/* Mobile: a hamburger that drops the same list below the rule */}
        <div className="sm:hidden relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="flex flex-col justify-center gap-[5px] w-6 h-6 cursor-pointer bg-transparent border-none p-0"
          >
            <span className="block h-[2px] w-6" style={{ background: COLORS.ink }} />
            <span className="block h-[2px] w-6" style={{ background: COLORS.ink }} />
            <span className="block h-[2px] w-6" style={{ background: COLORS.ink }} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-3 rounded-lg border bg-white shadow-lg py-1 z-50 min-w-[160px]"
              style={{ borderColor: COLORS.border }}
            >
              {visibleItems.map((item) => (
                <a
                  key={item.id}
                  href={pathForPage(item.id)}
                  onClick={navClick(item.id)}
                  aria-current={item.id === activePage ? 'page' : undefined}
                  className="block px-4 py-2 text-sm font-semibold no-underline"
                  style={{ color: item.id === activePage ? COLORS.accent : COLORS.ink }}
                >
                  {item.label}
                </a>
              ))}
              <div className="border-t mt-1 pt-1 px-4 py-2" style={{ borderColor: COLORS.border }}>
                <AuthControl profile={profile} onSignOut={signOut} onClick={navClick('login')} />
              </div>
            </div>
          )}
        </div>
      </nav>
      <Container>
        <div className="h-px" style={{ background: COLORS.ink }} />
      </Container>
    </header>
  )
}

function NavLink({ item, active, onClick }: {
  item: NavItem
  active: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <a
      href={pathForPage(item.id)}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      // The icon form keeps its accessible name in aria-label — an anchor whose
      // only content is an <svg> has no name at all otherwise, and a screen
      // reader announces it as "link".
      aria-label={item.icon ? item.label : undefined}
      title={item.icon ? item.label : undefined}
      className={`text-sm font-semibold no-underline transition-colors${item.icon ? ' flex items-center' : ''}`}
      style={{ color: active ? COLORS.accent : COLORS.ink }}
    >
      {item.icon ? <SearchIcon /> : item.label}
    </a>
  )
}

/** The magnifier. Sized to sit on the nav's baseline with the section labels. */
function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Sign-in link, or who you are and a way out. */
function AuthControl({ profile, onSignOut, onClick }: {
  profile: { full_name: string | null; email: string; role: string } | null
  onSignOut: () => void
  onClick: (e: React.MouseEvent) => void
}) {
  if (!profile) {
    return (
      <a
        href={pathForPage('login')}
        onClick={onClick}
        className="text-sm no-underline"
        style={{ color: COLORS.faint }}
      >
        Sign in
      </a>
    )
  }
  return (
    <span className="flex items-baseline gap-2 text-xs" style={{ color: COLORS.faint }}>
      <span>{profile.full_name || profile.email}</span>
      <button
        type="button"
        onClick={onSignOut}
        className="cursor-pointer bg-transparent border-none p-0 text-xs underline"
        style={{ color: 'inherit', font: 'inherit' }}
      >
        Sign out
      </button>
    </span>
  )
}
