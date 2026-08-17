import { useState } from 'react'
import { COLORS } from '../../constants/colors'
import { TopSection } from '../TopSection'
import { MarkdownField } from '../MarkdownField'
import { useHomeContent, type HomeContent } from '../../hooks/useHomeContent'
import { useTools, type Tool, type ToolDraft } from '../../hooks/useTools'

const EMPTY_TOOL: ToolDraft = {
  name: '', description: '', url: '', wip: false, sort_order: 0,
}

const inputCls = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2'
const inputStyle = { borderColor: COLORS.border, color: COLORS.ink }
const labelCls = 'block text-xs font-semibold mb-1 mt-4 uppercase'
const labelStyle = { color: COLORS.faint, letterSpacing: '1px' }
const hintCls = 'text-[11px] mt-1'

/**
 * The home page, editable.
 *
 * Two things that live on one page and are saved separately: the words, which
 * are one row and one Save button, and the tools grid, where each card is its
 * own row and saves on its own. Splitting them keeps a half-finished new tool
 * from blocking a typo fix in the standfirst.
 */
export function HomeSection() {
  return (
    <TopSection title="Home page" subtitle="the words on the front page, and the tools grid">
      <HomeText />
      <ToolsGrid />
    </TopSection>
  )
}

/** A failed save, shown next to the button that failed — where the author is
 *  looking when nothing appears to have happened. */
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

/** Waits for the row, then hands it to the form as its starting value. The
 *  split is what lets the form seed its fields from a prop instead of copying
 *  them out of an effect — an effect would re-run and could overwrite what the
 *  author is in the middle of typing. */
function HomeText() {
  const { content, loading, failed, save } = useHomeContent()

  if (loading) return <p className="text-sm" style={{ color: COLORS.faint }}>Loading…</p>

  if (failed || !content) {
    return (
      <p className="text-sm" style={{ color: COLORS.negative }}>
        The home page content could not be read. If this is the first deploy
        since the change, run <code>supabase/005_home.sql</code>.
      </p>
    )
  }

  return <HomeTextForm initial={content} save={save} />
}

function HomeTextForm({ initial, save }: {
  initial: HomeContent
  save: (next: HomeContent) => Promise<string | null>
}) {
  const [draft, setDraft] = useState<HomeContent>(initial)
  // What is currently in the database, as far as this form knows. Moves only on
  // a save that succeeded, which is what makes the Save button go quiet again.
  const [savedValue, setSavedValue] = useState<HomeContent>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof HomeContent>(key: K, value: HomeContent[K]) => {
    setDraft({ ...draft, [key]: value })
    setSaved(false)
  }

  const dirty = (Object.keys(draft) as (keyof HomeContent)[])
    .some((k) => draft[k] !== savedValue[k])

  const onSave = async () => {
    const next: HomeContent = {
      badge: draft.badge.trim(),
      intro: draft.intro,
      tools_heading: draft.tools_heading.trim(),
    }
    setSaving(true)
    const err = await save(next)
    setSaving(false)
    setError(err)
    setSaved(!err)
    if (!err) {
      setDraft(next)
      setSavedValue(next)
    }
  }

  return (
    <div className="mb-8">
      <label className={labelCls} style={labelStyle}>Badge</label>
      <input
        value={draft.badge}
        onChange={(e) => set('badge', e.target.value)}
        placeholder="e.g. Coming soon"
        className={inputCls}
        style={inputStyle}
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        The coral chip above the intro.{' '}
        <strong>Leave it blank and it disappears</strong> — which is what to do
        once there is writing to read.
      </div>

      <label className={labelCls} style={labelStyle}>Intro</label>
      <MarkdownField
        value={draft.intro}
        onChange={(v) => set('intro', v)}
        placeholder="The paragraph under the badge."
        minHeight={100}
        spellCheck
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        The first thing a stranger reads. Same formatting as a post, though this
        is a place for two sentences rather than a picture.
      </div>

      <label className={labelCls} style={labelStyle}>Tools heading</label>
      <input
        value={draft.tools_heading}
        onChange={(e) => set('tools_heading', e.target.value)}
        placeholder="e.g. Tools"
        className={inputCls}
        style={inputStyle}
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        The small label over the grid below. Blank hides the label, not the grid.
      </div>

      {error && <SaveError message={error} />}

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="px-4 py-1.5 text-xs font-semibold rounded text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: COLORS.ink }}
        >
          {saving ? 'Saving…' : 'Save text'}
        </button>
        {saved && !dirty && (
          <span className="text-xs" style={{ color: COLORS.positive }}>Saved.</span>
        )}
      </div>
    </div>
  )
}

function ToolsGrid() {
  const { tools, loading, failed, create, update, remove, move } = useTools()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyMove, setBusyMove] = useState(false)

  // On failure the editor STAYS OPEN with the message, rather than closing and
  // throwing the author's typing away while looking as though it had saved.
  const handleCreate = async (draft: ToolDraft) => {
    setSaving(true)
    // Appended to the end of the grid; the arrows move it from there.
    const err = await create({ ...draft, sort_order: tools.length })
    setSaving(false)
    setError(err)
    if (!err) setAdding(false)
  }

  const handleUpdate = async (id: string, draft: ToolDraft) => {
    setSaving(true)
    const err = await update(id, draft)
    setSaving(false)
    setError(err)
    if (!err) setEditingId(null)
  }

  const handleDelete = async (tool: Tool) => {
    const what = tool.name.trim() || 'this unnamed tool'
    if (!window.confirm(`Remove ${what} from the home page? This cannot be undone.`)) return
    const err = await remove(tool.id)
    if (err) setError(err)
  }

  const handleMove = async (id: string, delta: -1 | 1) => {
    setBusyMove(true)
    const err = await move(id, delta)
    setBusyMove(false)
    if (err) setError(err)
  }

  if (failed) return null // The message above already says what to do.

  return (
    <div>
      <h3 className="text-sm font-bold mb-1" style={{ color: COLORS.ink }}>Tools</h3>
      <p className="text-xs mb-3" style={{ color: COLORS.muted }}>
        The cards under the intro, in the order they appear. These are the other
        sites, so each is an outbound link.
      </p>

      {!adding && (
        <button
          type="button"
          onClick={() => { setAdding(true); setEditingId(null); setError(null) }}
          className="px-3 py-1.5 text-xs font-semibold rounded text-white cursor-pointer mb-4"
          style={{ backgroundColor: COLORS.ink }}
        >
          + New tool
        </button>
      )}

      {adding && (
        <div className="rounded-lg border p-4 mb-4" style={{ borderColor: COLORS.accent }}>
          <ToolEditor
            initial={EMPTY_TOOL}
            saving={saving}
            error={error}
            onSave={handleCreate}
            onCancel={() => { setAdding(false); setError(null) }}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>Loading…</p>
      ) : tools.length === 0 && !adding ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>
          No tools — the grid is hidden entirely.
        </p>
      ) : (
        <div className="space-y-2">
          {tools.map((tool, i) => (
            <div key={tool.id} className="rounded-lg border p-3" style={{ borderColor: COLORS.border }}>
              {editingId === tool.id ? (
                <ToolEditor
                  initial={tool}
                  saving={saving}
                  error={error}
                  onSave={(draft) => handleUpdate(tool.id, draft)}
                  onCancel={() => { setEditingId(null); setError(null) }}
                />
              ) : (
                <ToolRow
                  tool={tool}
                  canMoveUp={i > 0 && !busyMove}
                  canMoveDown={i < tools.length - 1 && !busyMove}
                  onMove={(delta) => handleMove(tool.id, delta)}
                  onEdit={() => { setEditingId(tool.id); setAdding(false); setError(null) }}
                  onDelete={() => handleDelete(tool)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {error && !adding && !editingId && <SaveError message={error} />}
    </div>
  )
}

/** One card, collapsed. */
function ToolRow({ tool, canMoveUp, canMoveDown, onMove, onEdit, onDelete }: {
  tool: Tool
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (delta: -1 | 1) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const arrowCls = 'text-xs cursor-pointer bg-transparent border-none p-0 px-1 disabled:opacity-25 disabled:cursor-default'
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col shrink-0 -mt-0.5">
        <button type="button" onClick={() => onMove(-1)} disabled={!canMoveUp} className={arrowCls} style={{ color: COLORS.ink }} aria-label={`Move ${tool.name} up`}>
          ▲
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={!canMoveDown} className={arrowCls} style={{ color: COLORS.ink }} aria-label={`Move ${tool.name} down`}>
          ▼
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm" style={{ color: COLORS.ink }}>
          {tool.name.trim() || <span style={{ color: COLORS.faint }}>Unnamed</span>}
        </div>
        <div className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2" style={{ color: COLORS.faint }}>
          {tool.wip && (
            <span className="font-semibold" style={{ color: COLORS.negative }}>Work in progress</span>
          )}
          <span className="truncate">{tool.description || 'no description'}</span>
          {tool.url
            ? <a href={tool.url} target="_blank" rel="noopener" className="underline" style={{ color: 'inherit' }}>{tool.url}</a>
            : <span>no link</span>}
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

function ToolEditor({ initial, saving, error, onSave, onCancel }: {
  initial: ToolDraft
  saving: boolean
  error: string | null
  onSave: (draft: ToolDraft) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [url, setUrl] = useState(initial.url)
  const [wip, setWip] = useState(initial.wip)

  const trimmedUrl = url.trim()
  // Caught here rather than left to tools_link_needs_url, so the author is told
  // which box is wrong without losing the round-trip.
  const urlProblem = !trimmedUrl
    ? (wip ? null : 'A card that isn’t marked work in progress needs a link — otherwise it is a dead end on the front page.')
    : /^https?:\/\//i.test(trimmedUrl)
      ? null
      : 'Needs the full address, starting https://.'

  const canSave = name.trim().length > 0 && !urlProblem

  return (
    <div>
      <label className={labelCls} style={labelStyle}>Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. GERS Explorer"
        className={inputCls}
        style={inputStyle}
        autoFocus
      />

      <label className={labelCls} style={labelStyle}>Description</label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Revenue, spending & deficit"
        className={inputCls}
        style={inputStyle}
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        A few words. The card is narrow — a quarter of the row on a wide screen.
      </div>

      <label className={labelCls} style={labelStyle}>Link</label>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://gers-explorer.com"
        className={inputCls}
        style={inputStyle}
      />
      {urlProblem && (
        <div className={`${hintCls} font-semibold`} style={{ color: COLORS.negative }}>
          {urlProblem}
        </div>
      )}

      <label className="flex items-center gap-2 mt-5 text-sm cursor-pointer" style={{ color: COLORS.ink }}>
        <input type="checkbox" checked={wip} onChange={(e) => setWip(e.target.checked)} />
        Work in progress{' '}
        <span style={{ color: COLORS.faint }}>(the card shows, but as text rather than a link)</span>
      </label>

      {error && <SaveError message={error} />}

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => onSave({
            name: name.trim(),
            description: description.trim(),
            url: trimmedUrl,
            wip,
            sort_order: initial.sort_order,
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
