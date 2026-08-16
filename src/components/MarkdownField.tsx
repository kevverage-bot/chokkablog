import { useLayoutEffect, useRef, useState } from 'react'
import { COLORS } from '../constants/colors'
import { RichText } from './RichText'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: number
  spellCheck?: boolean
}

/**
 * A plain textarea with a formatting toolbar and a live Preview toggle.
 *
 * The buttons wrap or insert Markdown around the current selection — see
 * RichText for the syntax they produce. The stored value stays raw Markdown, so
 * text typed by hand and text made with the buttons are the same thing, and
 * anything written before a button existed keeps working.
 *
 * The buttons compose, because each leaves the wrapped text selected: Bold then
 * Italic gives ***both***, Bold then Underline gives **<u>both</u>**. BI is only
 * a shortcut for the pair.
 */
export function MarkdownField({ value, onChange, placeholder, minHeight = 120, spellCheck }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  // Selection to restore after a toolbar edit re-renders the controlled textarea.
  const pendingSel = useRef<[number, number] | null>(null)
  const [preview, setPreview] = useState(false)

  // Grow the textarea to fit its content, so a long post is all visible rather
  // than scrolling inside a small box; `minHeight` is the floor. Runs after
  // every change and when returning from Preview (the textarea remounts).
  useLayoutEffect(() => {
    if (preview) return
    const ta = taRef.current
    if (!ta) return
    if (pendingSel.current) {
      const [s, e] = pendingSel.current
      ta.focus()
      ta.setSelectionRange(s, e)
      pendingSel.current = null
    }
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, minHeight)}px`
  }, [value, preview, minHeight])

  const surround = (before: string, after: string, ph: string) => {
    const ta = taRef.current
    if (!ta) return
    const s = ta.selectionStart
    const e = ta.selectionEnd
    const sel = value.slice(s, e) || ph
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    const cs = s + before.length
    pendingSel.current = [cs, cs + sel.length]
    onChange(next)
  }

  /** Rewrite every line the selection touches, keeping them selected after. */
  const mapLines = (fn: (line: string) => string) => {
    const ta = taRef.current
    if (!ta) return
    const start = value.lastIndexOf('\n', ta.selectionStart - 1) + 1
    let end = value.indexOf('\n', ta.selectionEnd)
    if (end === -1) end = value.length
    const replaced = value.slice(start, end).split('\n').map(fn).join('\n')
    const next = value.slice(0, start) + replaced + value.slice(end)
    pendingSel.current = [start, start + replaced.length]
    onChange(next)
  }

  const prefixLines = (prefix: string) => mapLines((l) => (l.trim() ? prefix + l : l))

  // Two spaces is what the renderer reads as a sub-point (see RichText).
  const indent = () => prefixLines('  ')
  const outdent = () => mapLines((l) => l.replace(/^ {1,2}/, ''))

  const insertLink = () => {
    const ta = taRef.current
    if (!ta) return
    const s = ta.selectionStart
    const e = ta.selectionEnd
    const sel = value.slice(s, e) || 'link text'
    const url = window.prompt('Link URL', 'https://')
    if (url === null) return
    const snippet = `[${sel}](${url || 'https://'})`
    const next = value.slice(0, s) + snippet + value.slice(e)
    const cs = s + 1
    pendingSel.current = [cs, cs + sel.length]
    onChange(next)
  }

  // Traditional footnote: a [^n] reference at the cursor plus a definition stub
  // at the foot of the text, cursor left ready to type the note.
  const insertFootnote = () => {
    const ta = taRef.current
    const s = ta ? ta.selectionStart : value.length
    const nums = [...value.matchAll(/\[\^(\d+)\]/g)].map((m) => +m[1])
    const n = (nums.length ? Math.max(...nums) : 0) + 1
    const withRef = value.slice(0, s) + `[^${n}]` + value.slice(s)
    const next = withRef.replace(/\s*$/, '') + `\n\n[^${n}]: `
    pendingSel.current = [next.length, next.length]
    onChange(next)
  }

  // Inline click-to-reveal note: ^[selection|note] (anchored) or ^[note].
  const insertNote = () => {
    const ta = taRef.current
    if (!ta) return
    const s = ta.selectionStart
    const e = ta.selectionEnd
    const sel = value.slice(s, e)
    if (sel) {
      const snippet = `^[${sel}|note]`
      const next = value.slice(0, s) + snippet + value.slice(e)
      const notePos = s + 2 + sel.length + 1
      pendingSel.current = [notePos, notePos + 4]
      onChange(next)
    } else {
      const next = value.slice(0, s) + '^[note]' + value.slice(e)
      pendingSel.current = [s + 2, s + 6]
      onChange(next)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 mb-1">
        <ToolButton disabled={preview} onClick={() => surround('**', '**', 'bold text')} title="Bold"><b>B</b></ToolButton>
        <ToolButton disabled={preview} onClick={() => surround('*', '*', 'italic text')} title="Italic"><i>I</i></ToolButton>
        <ToolButton
          disabled={preview}
          onClick={() => surround('***', '***', 'bold italic text')}
          title="Bold and italic — the same as clicking Bold then Italic"
        >
          <b><i>BI</i></b>
        </ToolButton>
        <ToolButton
          disabled={preview}
          onClick={() => surround('<u>', '</u>', 'underlined text')}
          title="Underline. Readers expect underlined text to be a link, so use it sparingly"
        >
          <u>U</u>
        </ToolButton>
        <ToolButton
          disabled={preview}
          onClick={() => prefixLines('# ')}
          title="Heading — a section heading within the post. Type ## instead for a smaller one"
        >
          <b>H</b>
        </ToolButton>
        <ToolButton disabled={preview} onClick={insertLink} title="Insert link">Link</ToolButton>
        <ToolButton disabled={preview} onClick={() => prefixLines('- ')} title="Bulleted list">&bull; List</ToolButton>
        <ToolButton
          disabled={preview}
          onClick={indent}
          title="Indent — a point indented under the one above becomes a sub-point of it"
        >
          &#8594;
        </ToolButton>
        <ToolButton disabled={preview} onClick={outdent} title="Outdent — back out one level">&#8592;</ToolButton>
        <ToolButton disabled={preview} onClick={() => prefixLines('> ')} title="Quote — sets the selected lines in a panel of their own">
          &ldquo; Quote
        </ToolButton>
        <ToolButton disabled={preview} onClick={insertFootnote} title="Numbered footnote — listed at the foot of the post">
          Footnote
        </ToolButton>
        <ToolButton disabled={preview} onClick={insertNote} title="Click-to-reveal note — an inline tooltip">Note</ToolButton>
        <ToolButton
          className="ml-auto"
          onClick={() => setPreview((p) => !p)}
          title={preview ? 'Back to editing' : 'See it as a reader will'}
        >
          {preview ? 'Edit' : 'Preview'}
        </ToolButton>
      </div>

      {preview ? (
        <div
          className="w-full border rounded-md px-3 py-2 text-[15px] leading-relaxed"
          style={{ borderColor: COLORS.border, minHeight, color: COLORS.ink }}
        >
          {value.trim()
            ? <RichText text={value} />
            : <span style={{ color: COLORS.faint }}>Nothing to preview</span>}
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={spellCheck}
          className="w-full border rounded-md px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2"
          style={{ borderColor: COLORS.border, minHeight, resize: 'none', overflow: 'hidden' }}
        />
      )}
    </div>
  )
}

/**
 * One toolbar button.
 *
 * Defined at module level, not inside MarkdownField: a component declared in a
 * render body is a new type on every render, so React unmounts and remounts the
 * whole toolbar each keystroke rather than updating it.
 */
function ToolButton({ onClick, title, disabled, className = '', children }: {
  onClick: () => void
  title: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`text-xs px-2 py-1 rounded border cursor-pointer bg-white hover:bg-gray-50 disabled:opacity-40 ${className}`}
      style={{ borderColor: COLORS.border, color: COLORS.ink }}
    >
      {children}
    </button>
  )
}
