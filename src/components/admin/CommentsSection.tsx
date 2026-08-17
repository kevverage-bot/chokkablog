import { useState } from 'react'
import { COLORS } from '../../constants/colors'
import { TopSection } from '../TopSection'
import { AUTHOR } from '../../lib/pageTitle'
import { pathForPost } from '../../lib/routes'
import { useAuth } from '../../hooks/useAuth'
import {
  useCommentModeration, type ModeratedComment, type CommentStatus,
} from '../../hooks/useCommentModeration'

const FILTERS: { id: CommentStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'Live' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'spam', label: 'Spam' },
  { id: 'all', label: 'All' },
]

const STATUS_COLOR: Record<CommentStatus, string> = {
  pending: COLORS.accent,
  approved: COLORS.positive,
  rejected: COLORS.muted,
  spam: COLORS.negative,
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * The comment moderation queue.
 *
 * Nothing a reader writes is on the site until it is approved here, so this is
 * the section that decides what the blog looks like below the line. It opens
 * itself when something is waiting.
 */
export function CommentsSection() {
  const { comments, loading, error, pendingCount, setStatus, remove, reply } = useCommentModeration()
  const { profile } = useAuth()
  const [filter, setFilter] = useState<CommentStatus | 'all'>('pending')
  const [actionError, setActionError] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  const shown = filter === 'all' ? comments : comments.filter((c) => c.status === filter)
  // The name a reply is signed with. The profile's own name wins, so a second
  // author would not be published under the first one's byline.
  const byline = profile?.full_name?.trim() || AUTHOR

  const handleDelete = async (c: ModeratedComment) => {
    const extra = c.status === 'approved' ? '\n\nIt is LIVE on the site now.' : ''
    if (!window.confirm(`Delete this comment by ${c.author_name}? Any reply to it goes too, and this cannot be undone.${extra}`)) return
    setActionError(await remove(c.id))
  }

  return (
    <TopSection
      title="Comments"
      subtitle={pendingCount > 0 ? `${pendingCount} waiting` : 'nothing waiting'}
      defaultOpen={pendingCount > 0}
    >
      <div className="flex flex-wrap gap-1 mb-4">
        {FILTERS.map((f) => {
          const count = f.id === 'all' ? comments.length : comments.filter((c) => c.status === f.id).length
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
          Could not read the queue: {error}
        </p>
      )}
      {actionError && (
        <p className="text-sm" style={{ color: COLORS.negative }} role="alert">{actionError}</p>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>
          {filter === 'pending' ? 'Nothing waiting.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => (
            <Row
              key={c.id}
              comment={c}
              byline={byline}
              replying={replyingTo === c.id}
              onReplyOpen={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
              onReply={async (body) => {
                const err = await reply(c, body, byline)
                setActionError(err)
                if (!err) setReplyingTo(null)
              }}
              onStatus={async (s) => setActionError(await setStatus(c.id, s, c.approved_at))}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      )}
    </TopSection>
  )
}

function Row({ comment: c, byline, replying, onReplyOpen, onReply, onStatus, onDelete }: {
  comment: ModeratedComment
  byline: string
  replying: boolean
  onReplyOpen: () => void
  onReply: (body: string) => void
  onStatus: (status: CommentStatus) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState('')

  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: c.status === 'pending' ? COLORS.accent : COLORS.border }}
    >
      <div className="flex items-start gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs flex flex-wrap items-center gap-x-2" style={{ color: COLORS.faint }}>
            <span
              className="font-semibold uppercase"
              style={{ color: STATUS_COLOR[c.status], letterSpacing: '1px' }}
            >
              {c.status === 'pending' ? 'waiting' : c.status}
            </span>
            <span>{formatWhen(c.created_at)}</span>
            {c.post?.slug
              ? <a href={pathForPost(c.post.slug)} target="_blank" rel="noopener" className="underline truncate" style={{ color: 'inherit' }}>
                  {c.post.headline}
                </a>
              : <span>{c.post?.headline ?? 'post deleted'}</span>}
            {c.parent_id && <span>· a reply</span>}
          </div>
          <div className="text-sm mt-1" style={{ color: COLORS.ink }}>
            <span className="font-semibold">{c.author_name}</span>
            {c.is_author && (
              <span className="ml-1.5 text-[10px] font-semibold uppercase" style={{ color: COLORS.accent, letterSpacing: '1px' }}>
                you
              </span>
            )}
            {/* Admin-only: the public view does not select this column at all. */}
            {c.email && (
              <>
                {' '}
                <a href={`mailto:${c.email}`} className="underline" style={{ color: COLORS.accent }}>
                  {c.email}
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

      {/* Plain text. This is what a stranger typed, and it is never Markdown —
          the page renders it the same way. */}
      <p className="text-sm leading-relaxed whitespace-pre-wrap m-0 mb-2" style={{ color: COLORS.ink }}>
        {c.body}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {c.status !== 'approved' && (
          <button
            type="button"
            onClick={() => onStatus('approved')}
            className="px-2.5 py-0.5 text-[11px] font-semibold rounded text-white cursor-pointer"
            style={{ backgroundColor: COLORS.positive }}
          >
            Approve
          </button>
        )}
        {(['pending', 'rejected', 'spam'] as CommentStatus[])
          .filter((s) => s !== c.status)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStatus(s)}
              className="px-2 py-0.5 text-[11px] rounded border cursor-pointer"
              style={{ borderColor: COLORS.border, color: COLORS.muted }}
            >
              {s === 'pending' ? 'Back to waiting' : `Mark ${s}`}
            </button>
          ))}
        {/* Only a top-level comment can be answered: one level of nesting is what
            the page renders, and threads deeper than that stop being readable. */}
        {!c.parent_id && (
          <button
            type="button"
            onClick={onReplyOpen}
            className="text-[11px] underline cursor-pointer bg-transparent border-none p-0"
            style={{ color: COLORS.ink }}
          >
            {replying ? 'Cancel reply' : 'Reply'}
          </button>
        )}
      </div>

      {replying && (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={`Reply publicly as ${byline}. Plain text — it is shown exactly as typed.`}
            className="w-full border rounded-md px-2 py-1.5 text-sm"
            style={{ borderColor: COLORS.border, color: COLORS.ink, resize: 'vertical' }}
            spellCheck
            autoFocus
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => onReply(draft)}
              disabled={!draft.trim()}
              className="px-3 py-1 text-[11px] font-semibold rounded text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: COLORS.ink }}
            >
              Post reply
            </button>
            {/* Said plainly, because it is the one action here that goes straight
                to the page with no second look. */}
            <span className="text-[11px]" style={{ color: COLORS.faint }}>
              Goes live immediately, badged as the author.
              {c.status !== 'approved' && ' The comment above it is not approved, so the reply will not be visible until it is.'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
