import { useState } from 'react'
import { COLORS } from '../../constants/colors'
import { TopSection } from '../TopSection'
import { MarkdownField } from '../MarkdownField'
import { useInsights, type Insight, type InsightDraft } from '../../hooks/useInsights'
import { autoExcerpt } from '../../lib/insightExcerpt'
import { formatPostDate } from '../../lib/dates'
import { pathForInsight } from '../../lib/routes'

/** A new post. Unpublished, so writing one is never one mis-click from being live. */
const EMPTY: InsightDraft = {
  slug: null, headline: '', short_title: '', summary: '', body: '', footer: '', published: false,
}

/** Lowercase letters, digits, single hyphens. What a readable URL is made of. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** A first suggestion for a new post's slug, from its headline. Only ever
 *  offered, never applied to an existing post — see the warning in the editor. */
function suggestSlug(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

export function InsightsSection() {
  const { insights, loading, create, update, remove } = useInsights()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const takenSlugs = (exceptId?: string) =>
    new Set(insights.filter((i) => i.id !== exceptId && i.slug).map((i) => i.slug as string))

  // On failure the editor STAYS OPEN with the message. Closing it would throw
  // the author's writing away while looking like it had saved.
  const handleCreate = async (draft: InsightDraft) => {
    setSaving(true)
    const err = await create(draft)
    setSaving(false)
    setSaveError(err)
    if (!err) setAdding(false)
  }

  const handleUpdate = async (id: string, draft: InsightDraft) => {
    setSaving(true)
    const err = await update(id, draft)
    setSaving(false)
    setSaveError(err)
    if (!err) setEditingId(null)
  }

  const handleDelete = async (post: Insight) => {
    const what = post.headline.trim() || 'this untitled post'
    const extra = post.published
      ? '\n\nIt is PUBLISHED. Any link to it, anywhere, will break.'
      : ''
    if (!window.confirm(`Delete ${what}? This cannot be undone.${extra}`)) return
    const err = await remove(post.id)
    if (err) setSaveError(err)
  }

  return (
    <TopSection title="Insights" subtitle="the posts — newest first, drafts at the top" defaultOpen>
      {!adding && (
        <button
          type="button"
          onClick={() => { setAdding(true); setEditingId(null); setSaveError(null) }}
          className="px-3 py-1.5 text-xs font-semibold rounded text-white cursor-pointer mb-4"
          style={{ backgroundColor: COLORS.ink }}
        >
          + New post
        </button>
      )}

      {adding && (
        <div className="rounded-lg border p-4 mb-4" style={{ borderColor: COLORS.accent }}>
          <Editor
            initial={EMPTY}
            saving={saving}
            error={saveError}
            takenSlugs={takenSlugs()}
            onSave={handleCreate}
            onCancel={() => { setAdding(false); setSaveError(null) }}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>Loading…</p>
      ) : insights.length === 0 && !adding ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>No posts yet.</p>
      ) : (
        <div className="space-y-2">
          {insights.map((post) => (
            <div key={post.id} className="rounded-lg border p-3" style={{ borderColor: COLORS.border }}>
              {editingId === post.id ? (
                <Editor
                  initial={post}
                  saving={saving}
                  error={saveError}
                  takenSlugs={takenSlugs(post.id)}
                  onSave={(draft) => handleUpdate(post.id, draft)}
                  onCancel={() => { setEditingId(null); setSaveError(null) }}
                />
              ) : (
                <Row
                  post={post}
                  onEdit={() => { setEditingId(post.id); setAdding(false); setSaveError(null) }}
                  onDelete={() => handleDelete(post)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </TopSection>
  )
}

/** One post, collapsed. */
function Row({ post, onEdit, onDelete }: { post: Insight; onEdit: () => void; onDelete: () => void }) {
  const date = formatPostDate(post.published_at)
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm" style={{ color: COLORS.ink }}>
          {post.headline.trim() || <span style={{ color: COLORS.faint }}>Untitled</span>}
        </div>
        <div className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2" style={{ color: COLORS.faint }}>
          <span
            className="font-semibold"
            style={{ color: post.published ? COLORS.positive : COLORS.negative }}
          >
            {post.published ? 'Published' : 'Draft'}
          </span>
          {date && <span>{date}</span>}
          {post.slug
            ? <a href={pathForInsight(post.slug)} className="underline" style={{ color: 'inherit' }}>
                {pathForInsight(post.slug)}
              </a>
            : <span>no slug yet</span>}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <button type="button" onClick={onEdit} className="text-xs underline cursor-pointer bg-transparent border-none p-0" style={{ color: COLORS.ink }}>
          Edit
        </button>
        <button type="button" onClick={onDelete} className="text-xs underline cursor-pointer bg-transparent border-none p-0" style={{ color: COLORS.negative }}>
          Delete
        </button>
      </div>
    </div>
  )
}

/** A failed save, shown next to the Save button — where the author is looking
 *  when nothing appears to have happened. */
function SaveError({ message }: { message: string }) {
  return (
    <div
      className="mt-3 rounded-md border px-3 py-2 text-xs"
      style={{ borderColor: COLORS.negative, background: '#FEF2F2', color: COLORS.negative }}
      role="alert"
    >
      <strong>Not saved.</strong> {message}
    </div>
  )
}

function Editor({ initial, saving, error, takenSlugs, onSave, onCancel }: {
  initial: InsightDraft
  saving: boolean
  error: string | null
  takenSlugs: Set<string>
  onSave: (draft: InsightDraft) => void
  onCancel: () => void
}) {
  const [headline, setHeadline] = useState(initial.headline)
  const [shortTitle, setShortTitle] = useState(initial.short_title)
  const [summary, setSummary] = useState(initial.summary)
  const [body, setBody] = useState(initial.body)
  const [footer, setFooter] = useState(initial.footer)
  const [published, setPublished] = useState(initial.published)
  const [slug, setSlug] = useState(initial.slug ?? '')

  // A slug that has never been set can be suggested from the headline. One that
  // exists is left alone: the whole point is that it does not follow the title.
  const isNew = !initial.slug
  const suggestion = isNew && !slug.trim() ? suggestSlug(headline) : ''

  const trimmedSlug = slug.trim()
  // Caught here rather than left to the unique index, so the author is told
  // which field is wrong before losing the round-trip.
  const slugProblem = !trimmedSlug
    ? (published ? 'A published post needs a slug — without one it has no address.' : null)
    : !SLUG_RE.test(trimmedSlug)
      ? 'Lowercase letters, numbers and single hyphens only — no spaces, capitals or punctuation.'
      : takenSlugs.has(trimmedSlug)
        ? 'Another post already uses this slug.'
        : null

  const canSave = headline.trim().length > 0 && !slugProblem

  const inputCls = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2'
  const inputStyle = { borderColor: COLORS.border, color: COLORS.ink }
  const labelCls = 'block text-xs font-semibold mb-1 mt-4 uppercase'
  const labelStyle = { color: COLORS.faint, letterSpacing: '1px' }
  const hintCls = 'text-[11px] mt-1'

  return (
    <div>
      <label className={labelCls} style={labelStyle}>Headline</label>
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="e.g. What the GERS figures actually show about the deficit"
        className={inputCls}
        style={inputStyle}
        autoFocus
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        <code>**bold**</code>, <code>*italic*</code> and <code>&lt;u&gt;underline&lt;/u&gt;</code> work
        here too, for emphasis within the title.
      </div>

      <label className={labelCls} style={labelStyle}>URL slug</label>
      <div className="flex gap-2">
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="e.g. what-the-gers-figures-show"
          className={inputCls}
          style={inputStyle}
        />
        {suggestion && (
          <button
            type="button"
            onClick={() => setSlug(suggestion)}
            className="shrink-0 px-3 text-xs rounded border cursor-pointer whitespace-nowrap"
            style={{ borderColor: COLORS.border, color: COLORS.ink }}
            title={`Use "${suggestion}"`}
          >
            Suggest
          </button>
        )}
      </div>
      <div className={hintCls} style={{ color: COLORS.faint }}>
        This post&rsquo;s address: <code>/insights/{trimmedSlug || '…'}</code>.{' '}
        {initial.slug && (
          <strong style={{ color: COLORS.negative }}>
            Changing it breaks every existing link to this post, including anything
            already shared or indexed.
          </strong>
        )}{' '}
        Editing the headline never changes it, which is deliberate.
      </div>
      {slugProblem && (
        <div className={`${hintCls} font-semibold`} style={{ color: COLORS.negative }}>
          {slugProblem}
        </div>
      )}

      <label className={labelCls} style={labelStyle}>Short title (optional)</label>
      <input
        value={shortTitle}
        onChange={(e) => setShortTitle(e.target.value)}
        placeholder="e.g. What GERS shows about the deficit"
        className={inputCls}
        style={inputStyle}
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        Used where the full headline is too long to read: the browser tab, the
        back-button history, and the title in search results — Google cuts titles
        around 60 characters. Blank uses the headline.
        {shortTitle.trim().length > 60 && (
          <span className="block mt-1" style={{ color: COLORS.negative }}>
            {shortTitle.trim().length} characters — still likely to be cut.
          </span>
        )}
      </div>

      <label className={labelCls} style={labelStyle}>Post</label>
      <MarkdownField
        value={body}
        onChange={setBody}
        placeholder="Write the post here."
        minHeight={240}
        spellCheck
      />

      <label className={labelCls} style={labelStyle}>Summary (optional)</label>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="One or two sentences for the Insights list and the search-result description."
        className={inputCls}
        style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
        spellCheck
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        Shown on the Insights list instead of the automatic excerpt, and used as
        this page&rsquo;s description in search results and link previews. Blank
        uses the opening of the post.
        {!summary.trim() && body.trim() && (
          <div className="mt-1" style={{ color: COLORS.muted }}>
            Automatic: &ldquo;{autoExcerpt(body)}&rdquo;
          </div>
        )}
      </div>

      <label className={labelCls} style={labelStyle}>Footer (optional)</label>
      <MarkdownField
        value={footer}
        onChange={setFooter}
        placeholder="Sources, caveats, corrections — shown in small print below the post."
        minHeight={80}
        spellCheck
      />

      <label className="flex items-center gap-2 mt-5 text-sm cursor-pointer" style={{ color: COLORS.ink }}>
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        Published <span style={{ color: COLORS.faint }}>(unchecked = draft, visible only to you)</span>
      </label>
      {published && !initial.published && (
        <div className={hintCls} style={{ color: COLORS.muted }}>
          Saving now sets the publication date to today, once. Unpublishing later
          does not clear it, so putting the post back does not re-date it.
        </div>
      )}

      {error && <SaveError message={error} />}

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => onSave({
            headline: headline.trim(),
            short_title: shortTitle.trim(),
            summary: summary.trim(),
            body,
            footer,
            published,
            slug: trimmedSlug || null,
          })}
          disabled={!canSave || saving}
          className="px-4 py-1.5 text-xs font-semibold rounded text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: COLORS.ink }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-xs rounded border cursor-pointer"
          style={{ borderColor: COLORS.border, color: COLORS.muted }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
