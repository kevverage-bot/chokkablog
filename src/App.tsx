import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { NavBar } from './components/NavBar'
import { SiteFooter } from './components/SiteFooter'
import { PageLoading } from './components/PageLoading'
import { HomePage } from './pages/HomePage'
import { BlogPage } from './pages/BlogPage'
import { PostPage } from './pages/PostPage'
import { SearchPage } from './pages/SearchPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ArchivePage } from './pages/ArchivePage'
import { ArchivePostPage } from './pages/ArchivePostPage'
import { AdminPage, AdminDenied } from './pages/AdminPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { useAuth } from './hooks/useAuth'
import { parseUrlState, pathForArchive, pathForPage, pathForPost, type PageId } from './lib/routes'
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
  const [postSlug, setPostSlug] = useState<string | null>(initialRoute.postSlug)
  const [archivePath, setArchivePath] = useState<string | null>(initialRoute.archivePath)
  const [notFound, setNotFound] = useState(initialRoute.notFound)
  const { profile, loading } = useAuth()
  const isAdmin = profile?.role === 'admin'

  /**
   * Navigate to a section, and put the new path in the address bar.
   *
   * pushState (not replaceState) so Back returns to the previous page. In-page
   * view state, when there is any, belongs on replaceState instead — otherwise
   * every toggle becomes a history entry and Back stops meaning "the page I came
   * from".
   */
  const setPage = useCallback((next: PageId) => {
    const cur = parseUrlState()
    // Compare the whole route, not just the page id: /blog/<slug> shares its
    // id with the hub, so testing the id alone would leave no Back target when
    // returning to the hub from a post.
    if (cur.page !== next || cur.postSlug !== null || cur.notFound) {
      window.history.pushState(null, '', pathForPage(next))
    }
    setNotFound(false)
    setPostSlug(null)
    setArchivePath(null)
    setPageRaw(next)
  }, [])

  /**
   * Open one post's own page.
   *
   * `term` is passed when the reader came from a search result: it rides along in
   * `?q=` so the post can mark the words that matched. PostPage takes it off the
   * URL again once it has read it — see the note there.
   */
  const selectPost = useCallback((slug: string, term?: string) => {
    if (parseUrlState().postSlug !== slug) {
      window.history.pushState(null, '', pathForPost(slug, term))
    }
    setNotFound(false)
    setArchivePath(null)
    setPostSlug(slug)
    setPageRaw('blog')
  }, [])

  /** Open one archive post, by its Blogger `YYYY/MM/slug`. */
  const selectArchive = useCallback((path: string) => {
    if (parseUrlState().archivePath !== path) {
      window.history.pushState(null, '', pathForArchive(path))
    }
    setNotFound(false)
    setPostSlug(null)
    setArchivePath(path)
    setPageRaw('archive')
  }, [])

  // Back/forward. Re-read the URL rather than keeping our own stack — the
  // browser's is the one that is always right.
  useEffect(() => {
    const onPop = () => {
      const r = parseUrlState()
      setPageRaw(r.page)
      setPostSlug(r.postSlug)
      setArchivePath(r.archivePath)
      setNotFound(r.notFound)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // `null` for a page whose title needs data that has not arrived — a post's
  // headline. PostPage sets its own once it has it, so it is left out here.
  //
  // /admin reports "Not found" to a non-admin, tab title included: a denial page
  // under a title saying "Admin" tells a stranger the page is real and that they
  // are simply on the wrong side of it. `loading` counts as not-an-admin here so
  // the title does not flick from Admin to Not found while the profile arrives.
  const adminDenied = page === 'admin' && !isAdmin
  // Both kinds of post set their own title once the text has arrived.
  const onPost = (page === 'blog' && postSlug !== null)
    || (page === 'archive' && archivePath !== null)
  useDocumentTitle(
    notFound || adminDenied
      ? NOT_FOUND_TITLE
      : onPost
        ? null
        : STATIC_PAGE_TITLES[page] ?? null,
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
        return <HomePage onSelect={selectPost} onNavigate={setPage} />
      case 'blog':
        return postSlug
          ? <PostPage slug={postSlug} onNavigate={setPage} onSelect={selectPost} />
          : <BlogPage onSelect={selectPost} />
      case 'privacy':
        return <PrivacyPage />
      case 'search':
        return <SearchPage onNavigate={setPage} onSelect={selectPost} onSelectArchive={selectArchive} />
      case 'archive':
        return archivePath
          ? <ArchivePostPage path={archivePath} onNavigate={setPage} />
          : <ArchivePage onNavigate={setPage} onSelect={selectArchive} />
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
