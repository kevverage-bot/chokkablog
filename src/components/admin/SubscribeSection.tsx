import { useState } from 'react'
import { COLORS } from '../../constants/colors'
import { TopSection } from '../TopSection'
import { MarkdownField } from '../MarkdownField'
import { useSubscribeContent, type SubscribeContent } from '../../hooks/useSubscribeContent'
import {
  useSubscribers, subscribersToCsv, countByStatus, type Subscriber,
} from '../../hooks/useSubscribers'
import { formatPostDate } from '../../lib/dates'

const inputCls = 'w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2'
const inputStyle = { borderColor: COLORS.border, color: COLORS.ink }
const labelCls = 'block text-xs font-semibold mb-1 mt-4 uppercase'
const labelStyle = { color: COLORS.faint, letterSpacing: '1px' }
const hintCls = 'text-[11px] mt-1'

/**
 * The words on the email sign-up, editable.
 *
 * One row, one Save button — the same shape as the home page's text. It is worth
 * its own section rather than living inside "Home page" because the box appears
 * in four places now: under every post, under every archive post, on the front
 * page, and beside the comment form.
 */
export function SubscribeSection() {
  return (
    <TopSection title="Email sign-up" subtitle="the pitch, and who has given you an address">
      <SubscribeText />
      <SubscriberList />
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

/** Waits for the row, then hands it to the form as its starting value — the same
 *  split as HomeText, and for the same reason: an effect would re-run and could
 *  overwrite what the author is in the middle of typing. */
function SubscribeText() {
  const { content, loading, failed, save } = useSubscribeContent()

  if (loading) return <p className="text-sm" style={{ color: COLORS.faint }}>Loading…</p>

  if (failed || !content) {
    return (
      <p className="text-sm" style={{ color: COLORS.negative }}>
        The sign-up wording could not be read. If this is the first deploy since
        the change, run <code>supabase/010_subscribe.sql</code>. The box still
        works meanwhile — it falls back to the wording in the bundle.
      </p>
    )
  }

  return <SubscribeTextForm initial={content} save={save} />
}

function SubscribeTextForm({ initial, save }: {
  initial: SubscribeContent
  save: (next: SubscribeContent) => Promise<string | null>
}) {
  const [draft, setDraft] = useState<SubscribeContent>(initial)
  // What is currently in the database, as far as this form knows. Moves only on
  // a save that succeeded, which is what makes the Save button go quiet again.
  const [savedValue, setSavedValue] = useState<SubscribeContent>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = <K extends keyof SubscribeContent>(key: K, value: SubscribeContent[K]) => {
    setDraft({ ...draft, [key]: value })
    setSaved(false)
  }

  const dirty = (Object.keys(draft) as (keyof SubscribeContent)[])
    .some((k) => draft[k] !== savedValue[k])

  const onSave = async () => {
    const next: SubscribeContent = {
      heading: draft.heading.trim(),
      intro: draft.intro,
      button: draft.button.trim(),
      comment_optin: draft.comment_optin.trim(),
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
    <div className="mb-4">
      {/* ⚠ The one thing an editor here has to understand, said where they will
          read it rather than in a source comment they will not. */}
      <div
        className="rounded-md border px-3 py-2 text-xs mb-2"
        style={{ borderColor: COLORS.accent, background: COLORS.accentSoft, color: COLORS.ink }}
      >
        <strong>The promise below is the basis on which people consent.</strong>{' '}
        It currently says only the pieces worth someone's attention get emailed,
        not every post. If that ever stops being true, change these words{' '}
        <em>before</em> the sending changes, not after. The small print under the
        field — confirmation, never shared, unsubscribe, the privacy notice — is
        fixed and not editable here, on purpose.
      </div>

      <label className={labelCls} style={labelStyle}>Heading</label>
      <input
        value={draft.heading}
        onChange={(e) => set('heading', e.target.value)}
        placeholder="e.g. New posts by email"
        className={inputCls}
        style={inputStyle}
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        The small coral label above the pitch. <strong>Blank hides it.</strong>
      </div>

      <label className={labelCls} style={labelStyle}>The pitch</label>
      <MarkdownField
        value={draft.intro}
        onChange={(v) => set('intro', v)}
        placeholder="Why somebody should give you their address, and what they will get."
        minHeight={100}
        spellCheck
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        Two sentences at most. It appears under every post, under every archive
        post, and on the front page.
      </div>

      <label className={labelCls} style={labelStyle}>Button</label>
      <input
        value={draft.button}
        onChange={(e) => set('button', e.target.value)}
        placeholder="e.g. Keep me posted"
        className={inputCls}
        style={inputStyle}
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        Blank falls back rather than hiding — an unlabelled button is nobody's
        decision.
      </div>

      <label className={labelCls} style={labelStyle}>Beside the comment box</label>
      <input
        value={draft.comment_optin}
        onChange={(e) => set('comment_optin', e.target.value)}
        placeholder="e.g. Also email me when there is a new post worth reading"
        className={inputCls}
        style={inputStyle}
      />
      <div className={hintCls} style={{ color: COLORS.faint }}>
        The label on the tick-box under the comment form. A different sentence
        from the pitch on purpose: somebody who has just written a comment is
        already persuaded and needs the offer, not the argument. The box is
        always unticked to begin with, and that is not configurable — a
        pre-ticked box is not consent.
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


/* ────────────────────────── The list ────────────────────────── */

/**
 * Everyone who has asked, newest first.
 *
 * ⚠ THE ONE THING THIS SCREEN HAS TO GET ACROSS, and the reason for the notice
 * at the top of it: THIS IS NOT THE MAILING LIST. Kit is. A row here records
 * that somebody asked and when; nothing writes back, so a person Kit shows as
 * confirmed still reads `pending` here, and an unsubscribe made through Kit's
 * footer link never arrives at all. A table of email addresses in an admin panel
 * invites precisely the wrong assumption, and acting on it would mean emailing
 * people who have left.
 */
function SubscriberList() {
  const { items, loading, error, remove } = useSubscribers()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  if (loading) {
    return <p className="text-sm mt-8" style={{ color: COLORS.faint }}>Loading the list…</p>
  }
  if (error) {
    return <p className="text-sm mt-8" style={{ color: COLORS.negative }}>{error}</p>
  }

  const counts = countByStatus(items)

  const onRemove = async (s: Subscriber) => {
    setBusyId(s.id)
    setRemoveError(await remove(s.id))
    setBusyId(null)
  }

  return (
    <div className="mt-10 pt-6 border-t" style={{ borderColor: COLORS.border }}>
      <h3 className="text-sm font-bold uppercase m-0 mb-1" style={{ color: COLORS.ink, letterSpacing: '1px' }}>
        Who has signed up
      </h3>

      <div
        className="rounded-md border px-3 py-2 text-xs mt-3 mb-4"
        style={{ borderColor: COLORS.accent, background: COLORS.accentSoft, color: COLORS.ink }}
      >
        <strong>This is the consent record, not the mailing list.</strong> It says
        who asked and when — which is what you need if anyone ever queries it.
        <strong> Kit decides who actually gets emailed.</strong> Nothing writes
        back here yet, so somebody Kit has confirmed still shows as{' '}
        <em>pending</em> below, and an unsubscribe made through Kit never reaches
        this table at all. Never work out who to email from this screen.
      </div>

      {items.length === 0 ? (
        <p className="text-sm" style={{ color: COLORS.faint }}>
          Nobody has signed up yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <Count label="asked" value={counts.total} strong />
            {counts.confirmed > 0 && <Count label="known confirmed" value={counts.confirmed} />}
            {counts.pending > 0 && <Count label="not known either way" value={counts.pending} />}
            {counts.unsubscribed > 0 && <Count label="left" value={counts.unsubscribed} />}
            {counts.failed > 0 && <Count label="never reached Kit" value={counts.failed} />}
            <ExportButton items={items} />
          </div>

          {removeError && (
            <div
              className="mb-3 rounded-md border px-3 py-2 text-xs"
              style={{ borderColor: COLORS.negative, background: '#FEF2F2', color: COLORS.negative }}
              role="alert"
            >
              <strong>Not deleted.</strong> {removeError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase" style={{ color: COLORS.faint, letterSpacing: '1px' }}>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 pr-4 font-semibold">Asked</th>
                  <th className="py-2 pr-4 font-semibold">From</th>
                  <th className="py-2 pr-4 font-semibold">Here</th>
                  <th className="py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-t align-top" style={{ borderColor: COLORS.border }}>
                    <td className="py-2 pr-4" style={{ color: COLORS.ink }}>{s.email}</td>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ color: COLORS.muted }}>
                      {formatPostDate(s.created_at)}
                    </td>
                    <td className="py-2 pr-4" style={{ color: COLORS.muted }}>
                      {/* Where they were standing when they agreed — the part of
                          the consent record that makes it worth having. */}
                      {s.source_page ?? '—'}
                    </td>
                    <td className="py-2 pr-4" style={{ color: COLORS.faint }}>
                      {s.status}
                      {s.kit_error && (
                        <span title={s.kit_error} style={{ color: COLORS.negative }}> ⚠</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void onRemove(s)}
                        disabled={busyId === s.id}
                        title="Removes the consent record here. Does NOT remove them from Kit."
                        className="text-xs underline cursor-pointer bg-transparent border-none p-0 disabled:opacity-50"
                        style={{ color: COLORS.negative }}
                      >
                        {busyId === s.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className={hintCls} style={{ color: COLORS.faint }}>
            ⚠ <strong>Delete removes the record here only.</strong> An erasure
            request needs the same person removed in Kit as well, or they stay on
            the list and keep receiving emails — with nothing left here to show
            they ever agreed.
          </p>
        </>
      )}
    </div>
  )
}

function Count({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <span className="text-sm" style={{ color: strong ? COLORS.ink : COLORS.muted }}>
      <strong style={{ fontSize: strong ? '1.25rem' : undefined }}>{value}</strong>{' '}
      <span className="text-xs">{label}</span>
    </span>
  )
}

/**
 * The list, out.
 *
 * ⚠ THIS IS THE ESCAPE HATCH, and it is why keeping our own copy was worth the
 * trouble at all: "I can move off Kit whenever I like" is only true while
 * getting the addresses out takes one click. It also answers a subject access
 * request without anybody opening the SQL editor.
 *
 * Built and revoked in the browser — the file never goes near a server, which
 * for a file that is nothing but email addresses is the right place for it.
 */
function ExportButton({ items }: { items: Subscriber[] }) {
  const download = () => {
    const blob = new Blob([subscribersToCsv(items)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Undated filenames overwrite each other in Downloads, and then nobody can
    // tell which export is current.
    a.download = `chokkablog-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={download}
      className="ml-auto px-3 py-1.5 text-xs font-semibold rounded border cursor-pointer"
      style={{ borderColor: COLORS.border, color: COLORS.ink }}
    >
      Export CSV
    </button>
  )
}
