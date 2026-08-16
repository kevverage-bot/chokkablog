import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { NavBar } from './components/NavBar'
import { SiteFooter } from './components/SiteFooter'
import { PageLoading } from './components/PageLoading'
import { HomePage } from './pages/HomePage'
import { AdminPage, AdminDenied } from './pages/AdminPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { useAuth } from './hooks/useAuth'
import { parseUrlState, pathForPage, type PageId } from './lib/routes'
import { NOT_FOUND_TITLE, STATIC_PAGE_TITLES, useDocumentTitle } from './lib/pageTitle'

/**
 * Split out of the main bundle: the sign-in form pulls in the hCaptcha widget,
 * and one author uses it. Everyone else was downloading it on the home page.
 */
const LoginPage = lazy(() =>
  import('./components/LoginPage').then((m) => ({ default: m.LoginPage })),
)

// Parsed once at module level, before the first render, so nothing paints the
// home page and then corrects itself.
const initialRoute = parseUrlState()

function App() {
  const [page, setPageRaw] = useState<PageId>(initialRoute.page)
  const [notFound, setNotFound] = useState(initialRoute.notFound)
  const { profile, loading } = useAuth()
  const isAdmin = profile?.role === 'admin'

  /**
   * Navigate, and put the new path in the address bar.
   *
   * pushState (not replaceState) so Back returns to the previous page. In-page
   * view state, when there is any, belongs on replaceState instead — otherwise
   * every toggle becomes a history entry and Back stops meaning "the page I came
   * from".
   */
  const setPage = useCallback((next: PageId) => {
    if (parseUrlState().page !== next || parseUrlState().notFound) {
      window.history.pushState(null, '', pathForPage(next))
    }
    setNotFound(false)
    setPageRaw(next)
  }, [])

  // Back/forward. Re-read the URL rather than keeping our own stack — the
  // browser's is the one that is always right.
  useEffect(() => {
    const onPop = () => {
      const r = parseUrlState()
      setPageRaw(r.page)
      setNotFound(r.notFound)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // `null` for a page whose title needs data that hasn't arrived — see
  // lib/pageTitle. Nothing here is in that position yet.
  //
  // /admin reports "Not found" to a non-admin, tab title included: a denial page
  // under a title saying "Admin" tells a stranger the page is real and that they
  // are simply on the wrong side of it. `loading` counts as not-an-admin here so
  // the title does not flick from Admin to Not found while the profile arrives.
  const adminDenied = page === 'admin' && !isAdmin
  useDocumentTitle(
    notFound || adminDenied ? NOT_FOUND_TITLE : STATIC_PAGE_TITLES[page] ?? null,
  )

  return (
    <>
      <NavBar activePage={notFound ? null : page} onNavigate={setPage} />
      <main>{renderPage()}</main>
      <SiteFooter />
      <Analytics />
      <SpeedInsights />
    </>
  )

  function renderPage() {
    if (notFound) return <NotFoundPage onNavigate={setPage} />
    switch (page) {
      case 'home':
        return <HomePage />
      case 'login':
        return (
          <Suspense fallback={<PageLoading label="" />}>
            <LoginPage />
          </Suspense>
        )
      case 'admin':
        // Wait for the profile before deciding. Rendering the denial first and
        // the page a moment later flashes "not found" at the one person who is
        // allowed to be here, on every load.
        if (loading) return <PageLoading />
        return isAdmin ? <AdminPage /> : <AdminDenied />
    }
  }
}

export default App
