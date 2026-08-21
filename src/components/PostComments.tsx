import { useEffect, useRef, useState } from 'react'
import { COLORS } from '../constants/colors'
import { Captcha } from './Captcha'
import { SubscribeSmallPrint } from './SubscribeBox'
import { FORMS_AVAILABLE } from '../lib/captcha'
import { useComments, threadComments, type PublicComment } from '../hooks/useComments'
import { useCaptchaSubmit } from '../hooks/useCaptchaSubmit'
import { validateComment, COMMENT_LIMITS } from '../lib/comments'
import { useSubscribeContent } from '../hooks/useSubscribeContent'
import { FALLBACK_SUBSCRIBE_CONTENT } from '../constants/subscribe'
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

      {!FORMS_AVAILABLE ? (
        // Only reachable with the captcha switched on and no site key to render
        // it with — the Edge Function would refuse the insert, so offering a form
        // here would waste what somebody wrote in it.
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
  // ⚠ FALSE BY DEFAULT, AND IT MUST STAY FALSE. A pre-ticked box is not consent
  // under UK GDPR — it has to be a positive act. The reader is here to comment;
  // the mailing list is an offer, not a condition.
  const [wantsEmails, setWantsEmails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  /** The comment saved but Kit refused the sign-up. Worth saying, because the
   *  reader ticked a box and would otherwise wait for an email indefinitely. */
  const [subscribeFailed, setSubscribeFailed] = useState(false)

  // Read only once the form is open, which is also the only time it renders —
  // the offer's wording is editable in Admin like the rest of the sign-up copy.
  // A blank one falls back rather than rendering a checkbox with no label.
  const { content: subWords, failed: subFailed } = useSubscribeContent()
  const optInLabel =
    (subFailed || !subWords ? FALLBACK_SUBSCRIBE_CONTENT : subWords).comment_optin.trim()
    || FALLBACK_SUBSCRIBE_CONTENT.comment_optin

  const openedAt = useRef(0)
  useEffect(() => { openedAt.current = Date.now() }, [])

  /** Pressing Post without a solved captcha ARMS the form; solving it then
   *  posts. Shared with the other two public forms — see
   *  hooks/useCaptchaSubmit.ts. ⚠ The rule that a token arriving on its own
   *  never submits matters most HERE: hCaptcha re-verifies when one expires, and
   *  a comment somebody is still writing must not be posted behind their back. */
  const captcha = useCaptchaSubmit(async (token) => {
    setSending(true)
    const res = await submit({
      postId, body, name, email, token,
      elapsedMs: Date.now() - openedAt.current,
      website,
      subscribe: wantsEmails,
    })
    setSending(false)

    if (res.ok) { setSubscribeFailed(res.subscribeFailed === true); setSent(true); return true }
    setError(res.error ?? 'Could not post that — please try again.')
    return false
  })

  const send = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const invalid = validateComment({ body, name, email })
    if (invalid) { captcha.disarm(); setError(invalid); return }

    captcha.submit()
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
        {/* Two separate things happened, so they are reported separately. The
            comment is safe either way; only the sign-up can have failed. */}
        {wantsEmails && !subscribeFailed && (
          <p className="text-sm mt-2 mb-0" style={{ color: COLORS.ink }}>
            You will also get an email asking you to confirm the mailing list.
            Until you click the link in it, you are not on the list.
          </p>
        )}
        {wantsEmails && subscribeFailed && (
          <p className="text-sm mt-2 mb-0" style={{ color: COLORS.negative }}>
            Your comment is safe, but the mailing-list sign-up did not go
            through. Do try the sign-up box on any post.
          </p>
        )}
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

      {/* The offer, beneath the promise about the address just above it — that
          order matters, because the reader has to know what the address is
          normally used for before being asked to allow a second use of it. The
          small print is the SAME COMPONENT the sign-up box uses; a second copy
          phrased slightly differently is how one of them ends up wrong. */}
      <div className="rounded-md border p-3" style={{ borderColor: COLORS.border, background: COLORS.tint }}>
        <label htmlFor="cm-subscribe" className="flex items-start gap-2 cursor-pointer">
          <input
            id="cm-subscribe"
            type="checkbox"
            checked={wantsEmails}
            onChange={(e) => setWantsEmails(e.target.checked)}
            className="mt-0.5 cursor-pointer"
          />
          <span className="text-sm" style={{ color: COLORS.ink }}>{optInLabel}</span>
        </label>
        {wantsEmails && <div className="mt-2 pl-6"><SubscribeSmallPrint /></div>}
      </div>

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

      <Captcha key={captcha.attempt} onToken={captcha.onToken} />

      {/* Neutral, not red, and it promises the post — so the form completing by
          itself a moment later reads as the thing that was described. */}
      {captcha.armed && !error && (
        <p className="text-sm m-0" style={{ color: COLORS.ink }} role="status">
          Just tick the box above — your comment will be posted as soon as you do.
        </p>
      )}

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
          disabled={sending || captcha.armed}
          className="px-4 py-1.5 text-xs font-semibold rounded text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: COLORS.ink }}
        >
          {sending ? 'Posting…' : captcha.armed ? 'Waiting for the captcha…' : 'Post comment'}
        </button>
      </div>
    </form>
  )
}
