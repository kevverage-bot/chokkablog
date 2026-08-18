import { COLORS } from '../constants/colors'
import { TopSection } from '../components/TopSection'
import { useAuth } from '../hooks/useAuth'
import { Container } from '../components/Container'
import { PostsSection } from '../components/admin/PostsSection'
import { HomeSection } from '../components/admin/HomeSection'
import { RebuildSection } from '../components/admin/RebuildSection'
import { CommentsSection } from '../components/admin/CommentsSection'
import { FeedbackSection } from '../components/admin/FeedbackSection'

/**
 * The admin page: everything editable about the site, in one place.
 *
 * Each section is a `<TopSection>`, and the ordering rule inherited from GERS
 * Explorer is that anything with SOMEBODY WAITING IN IT goes first — hence the
 * two inboxes at the top, each opening itself only when it is not empty. An
 * unread comment is a reader waiting in public; a draft is not waiting for
 * anyone. Below them the blog, which is the daily work, then Home, which is
 * edited a few times a year.
 *
 * ⚠ This component renders only for an admin (App checks the role, and /admin
 * is disallowed in robots.txt), but that is presentation, not security.
 * Every table this page writes to is protected by RLS calling
 * `public.is_admin()` — see supabase/001_profiles.sql. The gate decides what is
 * *shown*; the database decides what is *saved*, and only the second is
 * load-bearing.
 */
export function AdminPage() {
  return (
    <Container className="py-10">
      <h1 className="text-2xl font-extrabold mb-6" style={{ color: COLORS.ink, letterSpacing: '-0.5px' }}>
        Admin
      </h1>
      <CommentsSection />
      <FeedbackSection />
      <PostsSection />
      <RebuildSection />
      <HomeSection />
      <AccountSection />
    </Container>
  )
}

/** Who the database thinks you are. Worth a section of its own: every write on
 *  this page succeeds or fails on `profiles.role`, so when a save is refused
 *  this is the first thing to check. */
function AccountSection() {
  const { user, profile } = useAuth()
  const rows: [string, string][] = [
    ['Email', profile?.email ?? user?.email ?? '—'],
    ['Name', profile?.full_name || '—'],
    ['Role', profile?.role ?? 'no profile row'],
  ]
  return (
    <TopSection title="Account" subtitle="the role every save on this page depends on">
      <dl className="text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3 py-1">
            <dt className="w-20 shrink-0" style={{ color: COLORS.muted }}>{label}</dt>
            <dd className="m-0" style={{ color: COLORS.ink }}>{value}</dd>
          </div>
        ))}
      </dl>
    </TopSection>
  )
}

/** Shown at /admin to anyone who is not an admin — including a signed-in user
 *  whose role is still 'pending'. Deliberately says nothing about what is here. */
export function AdminDenied() {
  return (
    <Container className="py-16">
      <h1 className="text-xl font-bold mb-2" style={{ color: COLORS.ink }}>Not found</h1>
      <p className="text-sm" style={{ color: COLORS.muted }}>
        There&rsquo;s nothing at this address.
      </p>
    </Container>
  )
}
