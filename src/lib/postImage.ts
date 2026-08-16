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
export function parseImageUrl(raw: string): { src: string; width?: number; height?: number } {
  const m = raw.match(/^(.*)#(\d+)x(\d+)$/)
  if (!m) return { src: raw }
  return { src: m[1], width: Number(m[2]), height: Number(m[3]) }
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
