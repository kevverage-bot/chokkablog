import { useEffect, useRef, useState } from 'react'
import { COLORS } from '../constants/colors'
import { Captcha } from './Captcha'
import { CAPTCHA_CONFIGURED, HCAPTCHA_SITE_KEY } from '../lib/captcha'
import { useComments, threadComments, type PublicComment } from '../hooks/useComments'
import { validateComment, COMMENT_LIMITS } from '../lib/comments'
import { formatPostDate } from '../lib/dates'

/**
 * Reader comments beneath a post.
 *
 * Everything here reads the moderation queue's public face, so a comment appears
 * only once it has been approved. A new one therefore does NOT show up on submit
 * — the confirmation says so, rather than leaving the reader wondering whether it
 * worked at all.
 *
 * The form sits behind a button rather than always being open, which keeps
 * hCaptcha's third-party iframe off every page view; it loads when somebody
 * actually intends to write something.
 */
export function PostComments({ postId }: { postId: string }) {
  const { comments, loading, submit } = useComments(postId)
  const [open, setOpen] = useState(false)
  const threads = threadComments(comments)

  return (
    <section className="mt-12 pt-8 border-t" style={{ borderColor: COLORS.border }}>
      <h2
        className="text-[11px] font-semibold uppercase mb-5"
        style={{ color: COLORS.accent, letterSpacing: '2px' }}
      >
        {threads.length > 0 ? `Comments (${threads.length})` : 'Comments'}
      </h2>

      {!loading && threads.length === 0 && (
        <p className="text-sm mb-5" style={{ color: COLORS.faint }}>
          No comments yet.
        </p>
      )}

      <ul className="list-none p-0 m-0 mb-8 space-y-6">
        {threads.map((t) => (
          <li key={t.id} className="pb-6 border-b last:border-b-0" style={{ borderColor: COLORS.border }}>
            <Comment comment={t} />
            {t.replies.length > 0 && (
              <ul
                className="list-none p-0 mt-4 ml-3 pl-4 space-y-4 border-l-2"
                style={{ borderColor: COLORS.accentSoft }}
              >
                {t.replies.map((r) => <li key={r.id}><Comment comment={r} /></li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {!CAPTCHA_CONFIGURED ? (
        // The write path cannot work without a captcha (the Edge Function refuses
        // the insert), so offering a form here would only waste what somebody
        // wrote in it.
        <p className="text-sm m-0" style={{ color: COLORS.faint }}>
          Comments are not open yet.
        </p>
      ) : open ? (
        <CommentForm postId={postId} submit={submit} onCancel={() => setOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-4 py-2 text-sm font-semibold rounded text-white cursor-pointer"
          style={{ backgroundColor: COLORS.ink }}
        >
          Add a comment
        </button>
      )}
    </section>
  )
}

/** One comment, at either level. The author's own replies are badged — a reply
 *  that looks like every other comment is just a comment. */
function Comment({ comment }: { comment: PublicComment }) {
  return (
    <>
      <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
        <span className="font-semibold text-sm" style={{ color: COLORS.ink }}>
          {comment.author_name}
        </span>
        {comment.is_author && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase"
            style={{ backgroundColor: COLORS.accent, color: 'white', letterSpacing: '1px' }}
          >
            Author
          </span>
        )}
        <span className="text-xs" style={{ color: COLORS.faint }}>
          {formatPostDate(comment.approved_at ?? comment.created_at)}
        </span>
      </div>
      {/* Plain text, NEVER Markdown: rendering reader-supplied markup is how a
          comment box becomes a link farm. Line breaks are kept. */}
      <p
        className="text-[15px] leading-relaxed whitespace-pre-wrap m-0"
        style={{ color: COLORS.ink }}
      >
        {comment.body}
      </p>
    </>
  )
}

function CommentForm({ postId, submit, onCancel }: {
  postId: string
  submit: ReturnType<typeof useComments>['submit']
  onCancel: () => void
}) {
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')   // honeypot
  const [token, setToken] = useState<string | null>(null)
  /** Bumped to remount the captcha — see the note in components/Captcha.tsx. */
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const openedAt = useRef(0)
  useEffect(() => { openedAt.current = Date.now() }, [])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const invalid = validateComment({ body, name, email })
    if (invalid) { setError(invalid); return }
    if (HCAPTCHA_SITE_KEY && !token) { setError('Please complete the captcha.'); return }

    setSending(true)
    const res = await submit({
      postId, body, name, email, token,
      elapsedMs: Date.now() - openedAt.current,
      website,
    })
    setSending(false)

    if (res.ok) { setSent(true); return }
    // A verified token cannot be replayed, so a retry needs a fresh one.
    setToken(null)
    setAttempt((a) => a + 1)
    setError(res.error ?? 'Could not post that — please try again.')
  }

  const inputCls = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2'
  const inputStyle = { borderColor: COLORS.border, color: COLORS.ink }
  const labelCls = 'block text-xs font-semibold mb-1 uppercase'
  const labelStyle = { color: COLORS.faint, letterSpacing: '1px' }

  if (sent) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: COLORS.border, background: COLORS.tint }}>
        <p className="text-sm m-0" style={{ color: COLORS.ink }}>
          Thank you — your comment has been sent for review, and will appear here
          once it has been read.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={send}
      className="rounded-lg border p-4 space-y-4"
      style={{ borderColor: COLORS.border, background: COLORS.hoverBg }}
    >
      <div>
        <label htmlFor="cm-body" className={labelCls} style={labelStyle}>Comment</label>
        <textarea
          id="cm-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={COMMENT_LIMITS.body}
          required
          spellCheck
          className={inputCls}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="cm-name" className={labelCls} style={labelStyle}>Name</label>
          <input
            id="cm-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={COMMENT_LIMITS.name}
            required
            className={inputCls}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="cm-email" className={labelCls} style={labelStyle}>Email</label>
          <input
            id="cm-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={COMMENT_LIMITS.email}
            required
            className={inputCls}
            style={inputStyle}
          />
        </div>
      </div>

      <p className="text-[11px] m-0" style={{ color: COLORS.faint }}>
        Your name is shown with your comment. Your email address is never
        published — it is only used to reach you. Comments appear once they have
        been read.
      </p>

      {/* Honeypot: positioned off-screen rather than display:none, which some
          bots check for, and out of both the tab order and the accessibility
          tree. Anything typed here means the sender is not a person. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor="cm-website">Website</label>
        <input
          id="cm-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <Captcha key={attempt} onToken={setToken} />

      {error && (
        <p className="text-sm m-0" style={{ color: COLORS.negative }} role="alert">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-xs rounded border cursor-pointer"
          style={{ borderColor: COLORS.border, color: COLORS.muted }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={sending}
          className="px-4 py-1.5 text-xs font-semibold rounded text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: COLORS.ink }}
        >
          {sending ? 'Posting…' : 'Post comment'}
        </button>
      </div>
    </form>
  )
}
