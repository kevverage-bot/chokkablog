import { useState } from 'react'
import { COLORS } from '../../constants/colors'
import { TopSection } from '../TopSection'
import { useFeedbackInbox, type FeedbackItem, type FeedbackStatus } from '../../hooks/useFeedbackInbox'

const FILTERS: { id: FeedbackStatus | 'all'; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'read', label: 'Read' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'spam', label: 'Spam' },
  { id: 'all', label: 'All' },
]

const STATUS_COLOR: Record<FeedbackStatus, string> = {
  new: COLORS.accent,
  read: COLORS.muted,
  actioned: COLORS.positive,
  spam: COLORS.negative,
}

/** Date and time, not just the date: two messages about the same page an hour
 *  apart usually turn out to be one person getting more specific. */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * The feedback inbox.
 *
 * Opens itself when something is unread, and sits above the blog for the reason
 * given in AdminPage: a section with somebody waiting in it goes first.
 */
export function FeedbackSection() {
  const { items, loading, error, newCount, setStatus, setNote, remove } = useFeedbackInbox()
  const [filter, setFilter] = useState<FeedbackStatus | 'all'>('new')
  const [actionError, setActionError] = useState<string | null>(null)

  const shown = filter === 'all' ? items : items.filter((i) => i.status === filter)

  const handleDelete = async (item: FeedbackItem) => {
    if (!window.confirm('Delete this message? This cannot be undone.')) return
    setActionError(await remove(item.id))
  }

  return (
    <TopSection
      title="Feedback"
      subtitle={newCount > 0 ? `${newCount} new` : 'nothing new'}
      defaultOpen={newCount > 0}
    >
      <div className="flex flex-wrap gap-1 mb-4">
        {FILTERS.map((f) => {
          const count = f.id === 'all' ? items.length : items.filter((i) => i.status === f.id).length
          const active = filter === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="px-2.5 py-1 text-xs rounded border cursor-pointer"
              style={{
                borderColor: active ? COLORS.ink : COLORS.border,
                background: active ? COLORS.ink : 'transparent',
                color: active ? 'white' : COLORS.muted,
              }}
            >
              {f.label} ({count})
            </button>
          )
        })}
      </div>

      {error && (
        <p className="text-sm" style={{ color: COLORS.negative }}>
          Could not read the inbox: {error}
        </p>
      )}
      {actionError && (
        <p className="text-sm" style={{ color: COLORS.negative }} role="alert">{actionError}</p>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>
          {filter === 'new' ? 'Nothing new.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((item) => (
            <Message
              key={item.id}
              item={item}
              onStatus={async (s) => setActionError(await setStatus(item.id, s))}
              onNote={async (n) => setActionError(await setNote(item.id, n))}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </div>
      )}
    </TopSection>
  )
}

function Message({ item, onStatus, onNote, onDelete }: {
  item: FeedbackItem
  onStatus: (status: FeedbackStatus) => void
  onNote: (note: string) => void
  onDelete: () => void
}) {
  const [note, setNote] = useState(item.admin_note ?? '')
  const [noteOpen, setNoteOpen] = useState(false)

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: COLORS.border }}>
      <div className="flex items-start gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs flex flex-wrap items-center gap-x-2" style={{ color: COLORS.faint }}>
            <span className="font-semibold uppercase" style={{ color: STATUS_COLOR[item.status], letterSpacing: '1px' }}>
              {item.status}
            </span>
            <span>{formatWhen(item.created_at)}</span>
            {item.page && <span>{item.page}</span>}
          </div>
          <div className="text-sm mt-1" style={{ color: COLORS.ink }}>
            <span className="font-semibold">{item.name?.trim() || 'Anonymous'}</span>
            {/* A mailto rather than plain text: replying is the whole point, and
                this address exists nowhere else on the site. */}
            {item.email && (
              <>
                {' '}
                <a href={`mailto:${item.email}`} className="underline" style={{ color: COLORS.accent }}>
                  {item.email}
                </a>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs underline cursor-pointer bg-transparent border-none p-0 shrink-0"
          style={{ color: COLORS.negative }}
        >
          Delete
        </button>
      </div>

      {/* Plain text, never rendered as Markdown: this is what a stranger typed. */}
      <p className="text-sm leading-relaxed whitespace-pre-wrap m-0 mb-2" style={{ color: COLORS.ink }}>
        {item.message}
      </p>

      {item.view_url && item.view_url !== item.page && (
        <p className="text-[11px] m-0 mb-2 truncate" style={{ color: COLORS.faint }}>
          <a href={item.view_url} target="_blank" rel="noopener" style={{ color: 'inherit' }}>
            {item.view_url}
          </a>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['new', 'read', 'actioned', 'spam'] as FeedbackStatus[])
          .filter((s) => s !== item.status)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStatus(s)}
              className="px-2 py-0.5 text-[11px] rounded border cursor-pointer"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              Mark {s}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          className="text-[11px] underline cursor-pointer bg-transparent border-none p-0"
          style={{ color: COLORS.muted }}
        >
          {item.admin_note ? 'Note' : 'Add note'}
        </button>
      </div>

      {(noteOpen || item.admin_note) && (
        <div className="mt-2">
          {noteOpen ? (
            <div className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="A note to yourself — never shown to anyone else."
                className="flex-1 border rounded-md px-2 py-1 text-xs"
                style={{ borderColor: COLORS.border, color: COLORS.ink }}
              />
              <button
                type="button"
                onClick={() => { onNote(note); setNoteOpen(false) }}
                className="px-2 py-1 text-[11px] font-semibold rounded text-white cursor-pointer"
                style={{ backgroundColor: COLORS.ink }}
              >
                Save
              </button>
            </div>
          ) : (
            <p className="text-[11px] m-0 italic" style={{ color: COLORS.muted }}>{item.admin_note}</p>
          )}
        </div>
      )}
    </div>
  )
}
