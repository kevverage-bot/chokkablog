import { useState } from 'react'
import { COLORS } from '../../constants/colors'
import { TopSection } from '../TopSection'
import { MarkdownField } from '../MarkdownField'
import { useSubscribeContent, type SubscribeContent } from '../../hooks/useSubscribeContent'

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
    <TopSection title="Email sign-up" subtitle="the pitch on the box that collects addresses">
      <SubscribeText />
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
