import { useMemo, useState } from 'react'
import { COLORS } from '../../constants/colors'
import { TopSection } from '../TopSection'
import { MarkdownField } from '../MarkdownField'
import { useArchiveIndex, useArchivePost, useArchiveEdit } from '../../hooks/useArchive'
import { formatPostDate } from '../../lib/dates'
import { pathForArchive } from '../../lib/routes'

/**
 * Editing the archive.
 *
 * The archive is 229 finished posts, so this is not an editor in the sense
 * PostsSection is: there is nothing to create, nothing to publish and nothing to
 * order. What there IS, and the reason the whole section was rehosted rather
 * than left on Blogger, is the NOTE — a line at the top of a post that still
 * ranks, pointing whoever landed on it from a 2015 search result at whatever
 * answers the question now.
 *
 * So: find a post, write the note, save. The title and the original HTML are
 * editable too, behind a disclosure, for the occasional broken thing — but
 * they are not what this is for.
 */
export function ArchiveSection() {
  const { posts, loading } = useArchiveIndex()
  const [filter, setFilter] = useState('')
  const [openPath, setOpenPath] = useState<string | null>(null)

  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return posts
    return posts.filter((p) => p.title.toLowerCase().includes(q) || p.path.includes(q))
  }, [posts, filter])

  // 229 rows is a scroll, not a list. Everything is reachable through the box.
  const shown = matches.slice(0, 40)

  return (
    <TopSection title="Archive" subtitle="the old Blogger posts, and the notes on them">
      {loading ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>Loading…</p>
      ) : (
        <>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a post by title or year…"
            aria-label="Find an archive post"
            className="w-full rounded-lg border px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2"
            style={{ borderColor: COLORS.border, color: COLORS.ink }}
          />
          <p className="text-xs mb-3" style={{ color: COLORS.faint }}>
            {matches.length} of {posts.length} posts
            {matches.length > shown.length && ` — showing the first ${shown.length}`}
          </p>

          <ul className="m-0 p-0 list-none">
            {shown.map((post) => (
              <li key={post.path} className="border-b last:border-b-0" style={{ borderColor: COLORS.border }}>
                <button
                  type="button"
                  onClick={() => setOpenPath(openPath === post.path ? null : post.path)}
                  aria-expanded={openPath === post.path}
                  className="flex w-full items-baseline gap-3 text-left py-2 cursor-pointer bg-transparent border-none px-0"
                >
                  <span className="text-xs shrink-0 num" style={{ color: COLORS.faint }}>
                    {formatPostDate(post.published_at)}
                  </span>
                  <span className="text-sm font-medium flex-1" style={{ color: COLORS.ink }}>
                    {post.title}
                  </span>
                </button>
                {openPath === post.path && <Editor path={post.path} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </TopSection>
  )
}

/** The one post being worked on. Its body is fetched only now — the list above
 *  never carries 3.2MB of HTML around for the sake of a note. */
function Editor({ path }: { path: string }) {
  const { post, loading } = useArchivePost(path)
  const save = useArchiveEdit()
  const [note, setNote] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [showHtml, setShowHtml] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (loading || !post) {
    return <p className="text-xs pb-3" style={{ color: COLORS.faint }}>Loading the post…</p>
  }

  // `null` means untouched, so the fetched value shows until it is edited.
  const noteValue = note ?? post.note
  const htmlValue = html ?? post.html
  const dirty = noteValue !== post.note || htmlValue !== post.html

  const onSave = async () => {
    setSaving(true)
    setSaved(false)
    const err = await save(path, { note: noteValue, html: htmlValue })
    setSaving(false)
    setError(err)
    if (!err) setSaved(true)
  }

  return (
    <div className="pb-4">
      <label className="block text-xs font-semibold mb-1" style={{ color: COLORS.muted }}>
        Note shown above the post
      </label>
      <p className="text-xs mb-2" style={{ color: COLORS.faint }}>
        Markdown, the same as a blog post. A link to what replaced this is the
        whole idea — <code>[the 2026 figures](/blog/gers-2026)</code>.
      </p>
      <MarkdownField
        value={noteValue}
        onChange={(v) => { setNote(v); setSaved(false) }}
        placeholder="This post is from 2015. For the current position see…"
        minHeight={90}
      />

      <button
        type="button"
        onClick={() => setShowHtml((v) => !v)}
        className="text-xs underline cursor-pointer bg-transparent border-none p-0 mt-3"
        style={{ color: COLORS.faint }}
      >
        {showHtml ? 'Hide the original HTML' : 'Edit the original HTML'}
      </button>
      {showHtml && (
        <textarea
          value={htmlValue}
          onChange={(e) => { setHtml(e.target.value); setSaved(false) }}
          spellCheck={false}
          className="w-full rounded-lg border px-3 py-2 text-xs font-mono mt-2"
          style={{ borderColor: COLORS.border, color: COLORS.ink, minHeight: 200 }}
        />
      )}

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer border-none disabled:opacity-40"
          style={{ background: COLORS.accent, color: '#fff' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <a
          href={pathForArchive(path)}
          target="_blank"
          rel="noopener"
          className="text-xs no-underline hover:underline"
          style={{ color: COLORS.faint }}
        >
          View the post &rarr;
        </a>
        {saved && !dirty && (
          <span className="text-xs" style={{ color: COLORS.positive }}>Saved</span>
        )}
        {error && <span className="text-xs" style={{ color: COLORS.negative }}>{error}</span>}
      </div>
      {/* The rebuild reminder that applies to everything prerendered: an edit is
          live for readers at once and reaches Google on the next build. */}
      <p className="text-xs mt-2" style={{ color: COLORS.faint }}>
        Saved notes show immediately, and reach search engines after the next
        rebuild — see Search &amp; feeds above.
      </p>
    </div>
  )
}
