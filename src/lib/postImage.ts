import { supabase } from './supabase'

/**
 * Uploading a picture, and remembering how big it is.
 *
 * ⚠ THE DIMENSIONS ARE THE POINT. An <img> with no width and height is a
 * zero-height box until the file arrives, and then it shoves everything below it
 * down the page — the single largest source of Cumulative Layout Shift on a
 * content site, and CLS is a ranking signal. But a post is a Markdown string, so
 * there is nowhere to put the numbers.
 *
 * So they go in the URL, as a fragment: `…/deficit.png#1200x800`. A fragment is
 * never sent to the server and is ignored by the storage layer, so this is inert
 * everywhere except in our own renderer, which reads it back and sets the
 * attributes. No second table, nothing to keep in step, and the number travels
 * with the link if the author copies it into another post.
 *
 * An image without the fragment still renders — it just can't reserve its space.
 */

const BUCKET = 'post-images'

/** Anything larger is a photo straight off a camera. Compress it first: the
 *  reader pays for every byte, and a 12MP JPEG in a blog post is 4MB of nothing. */
const MAX_BYTES = 5 * 1024 * 1024

/** Raster formats every browser renders, plus SVG for charts exported as vector. */
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])

export interface UploadResult {
  /** The public URL, with the `#WxH` fragment appended when measurable. */
  url: string
  width: number | null
  height: number | null
}

/** Read an image file's natural size in the browser, so nothing has to be typed
 *  in. Returns nulls rather than throwing: an unmeasurable image is worth
 *  uploading anyway, it just cannot reserve its space. */
function measure(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null })
    }
    img.onerror = () => {
      // An SVG with no intrinsic size lands here, which is expected rather than
      // exceptional.
      URL.revokeObjectURL(url)
      resolve({ width: null, height: null })
    }
    img.src = url
  })
}

/** A storage key that cannot collide and cannot be surprising: the author's
 *  filename, reduced to safe characters, behind a random prefix. Keeping a
 *  readable tail makes the bucket browsable months later. */
function storageKey(name: string): string {
  const safe = name
    .toLowerCase()
    .replace(/\.[^.]+$/, (ext) => ext)      // keep the extension
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-60)
  return `${crypto.randomUUID()}-${safe || 'image'}`
}

/**
 * Upload one image and return the URL to put in a post.
 *
 * Throws with a message meant for the author — it is shown next to the button
 * they just pressed, so it has to say what to do rather than what went wrong.
 */
export async function uploadPostImage(file: File): Promise<UploadResult> {
  if (!ALLOWED.has(file.type)) {
    throw new Error(`${file.type || 'That file'} is not an image format the site can show. Use PNG, JPEG, GIF, WebP or SVG.`)
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Compress it below 5MB first — readers pay for every byte.`)
  }

  const { width, height } = await measure(file)

  const key = storageKey(file.name)
  const { error } = await supabase.storage.from(BUCKET).upload(key, file, {
    cacheControl: '31536000',  // a year: the key is unique, so the bytes never change
    upsert: false,
  })
  if (error) {
    if (/row-level security|Unauthorized/i.test(error.message)) {
      throw new Error('Upload refused. Your session may have expired — reload and sign in again.')
    }
    throw new Error(error.message)
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key)
  const url = width && height ? `${data.publicUrl}#${width}x${height}` : data.publicUrl
  return { url, width, height }
}

/**
 * Split a stored image URL into the address and the size the fragment recorded.
 *
 * Kept next to the code that writes the fragment, so the two halves of this
 * convention cannot drift apart.
 */
export function parseImageUrl(raw: string): {
  src: string
  width?: number
  height?: number
  outlined?: boolean
} {
  // ⚠ THE OUTLINE FLAG LIVES IN THE FRAGMENT, beside the size, because the
  // fragment is already where per-image RENDER metadata goes and a fragment is
  // never sent to the server — so nothing about how a picture is framed can
  // change which bytes are fetched. It also survives copy-pasting the whole
  // `![...](...)` from one post to another, which a separate syntax would not.
  //
  // Written out as `+outline` rather than a one-letter flag: this appears in the
  // Markdown Kevin edits by hand, and `#1200x800o` is a puzzle in six months.
  const outlined = raw.endsWith(OUTLINE_FLAG)
  const url = outlined ? raw.slice(0, -OUTLINE_FLAG.length) : raw

  const m = url.match(/^(.*)#(\d+)x(\d+)$/)
  if (!m) {
    // `#+outline` with no size: the flag on an image saved before sizes existed.
    return { src: url.endsWith('#') ? url.slice(0, -1) : url, outlined }
  }
  return { src: m[1], width: Number(m[2]), height: Number(m[3]), outlined }
}

/** The suffix that asks for an outline. Appended to the fragment, so an image
 *  with no recorded size reads `…/x.png#+outline`. */
export const OUTLINE_FLAG = '+outline'

/**
 * Add or remove the outline flag on one image URL.
 *
 * Tolerant of a URL with no fragment at all: the `#` is added, because the flag
 * has to live in a fragment or it would become part of the request.
 */
export function toggleOutline(rawUrl: string): string {
  if (rawUrl.endsWith(OUTLINE_FLAG)) {
    const without = rawUrl.slice(0, -OUTLINE_FLAG.length)
    // Drop the `#` this function added if nothing else is left inside it —
    // otherwise toggling on and off again leaves a trailing hash behind every
    // time, and the URL grows a little more untidy with each change of mind.
    return without.endsWith('#') ? without.slice(0, -1) : without
  }
  return (rawUrl.includes('#') ? rawUrl : rawUrl + '#') + OUTLINE_FLAG
}

/**
 * The `![alt](url)` whose markdown contains `caret`, or null.
 *
 * Used by the editor's Outline button so the author can put the caret anywhere
 * in an image — the caption, the alt text, the URL — rather than having to
 * select it precisely.
 */
export function imageAtCaret(text: string, caret: number): { start: number; end: number; url: string } | null {
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const start = m.index
    const end = start + m[0].length
    // Inclusive of both edges, so a caret resting just after the closing
    // bracket still counts — which is where it lands after an insert.
    if (caret >= start && caret <= end) return { start, end, url: m[1] }
  }
  return null
}

/**
 * Split an image's text into its visible caption and its alt text.
 *
 * No pipe means plain Markdown: the text is alt, and there is no caption. With a
 * pipe the visible caption comes first — matching `^[anchor|note]`, where the
 * part a reader sees also leads. An empty alt after the pipe falls back to the
 * caption, because an image with no alt at all is worse than a repetitive one.
 */
export function splitImageText(text: string): { caption: string | null; alt: string } {
  const pipe = text.indexOf('|')
  if (pipe < 0) return { caption: null, alt: text }
  const caption = text.slice(0, pipe).trim()
  const alt = text.slice(pipe + 1).trim()
  return { caption: caption || null, alt: alt || caption }
}
