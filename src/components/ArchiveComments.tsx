import { COLORS } from '../constants/colors'
import { AUTHOR } from '../lib/pageTitle'
import { formatPostDate, isoDate } from '../lib/dates'
import type { ArchiveComment } from '../hooks/useArchive'

/**
 * The discussion as it stood when the post was on Blogger.
 *
 * Read-only, and permanently so: there is no form here, and public.archive_comments
 * has no insert policy for a reader. New writing gets the Phase 4 comment
 * system, which is moderated; this is a record of a conversation that finished
 * years ago, republished with the post it belongs to.
 *
 * NOT in the prerendered snapshot — same decision as the blog's own comments.
 * What Google should index is the post.
 */
export function ArchiveComments({ comments }: { comments: ArchiveComment[] }) {
  if (comments.length === 0) return null

  // Blogger threaded replies by id. Anything whose parent is missing from the
  // export renders at the top level rather than disappearing.
  const known = new Set(comments.map((c) => c.blogger_id))
  const isReply = (c: ArchiveComment) =>
    c.reply_to_blogger_id !== null && known.has(c.reply_to_blogger_id)

  return (
    <section className="mt-12 pt-8 border-t" style={{ borderColor: COLORS.border }}>
      <h2 className="text-lg font-bold mb-1" style={{ color: COLORS.ink }}>
        {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
      </h2>
      <p className="text-xs mb-6" style={{ color: COLORS.faint }}>
        From the original post. This discussion is closed.
      </p>
      <ol className="m-0 p-0 list-none space-y-5">
        {comments.map((c) => (
          <li
            key={c.id}
            className={isReply(c) ? 'pl-4 sm:pl-8 border-l' : ''}
            style={isReply(c) ? { borderColor: COLORS.border } : undefined}
          >
            <Comment comment={c} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function Comment({ comment }: { comment: ArchiveComment }) {
  const name = comment.author_name.trim()
  const mine = name === AUTHOR
  return (
    <article>
      <div className="flex items-baseline gap-2 mb-1 text-xs">
        <span className="font-semibold" style={{ color: mine ? COLORS.accent : COLORS.ink }}>
          {/* 1,241 of these were left unsigned on Blogger. */}
          {name || 'Anonymous'}
        </span>
        {mine && (
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
            style={{ background: COLORS.accentSoft, color: COLORS.accent, letterSpacing: '0.5px' }}
          >
            Author
          </span>
        )}
        <time dateTime={isoDate(comment.published_at)} style={{ color: COLORS.faint }}>
          {formatPostDate(comment.published_at)}
        </time>
      </div>
      {/* Sanitised at import to a much narrower allowlist than the posts —
          these are the public's words, not Kevin's. See scripts/import-archive.py. */}
      <div
        className="archive-html text-[15px]"
        style={{ color: COLORS.muted }}
        dangerouslySetInnerHTML={{ __html: comment.html }}
      />
    </article>
  )
}
