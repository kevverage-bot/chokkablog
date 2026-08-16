import { COLORS } from '../constants/colors'
import { parseImageUrl } from '../lib/postImage'

/**
 * A picture in a post.
 *
 * `width` and `height` come from the `#WxH` fragment the uploader appends (see
 * lib/postImage). They are set as HTML attributes, not CSS: together with
 * `height: auto` in the style, they give the browser the aspect ratio before a
 * single byte of the image has arrived, so it reserves the right space and
 * nothing below shifts when the picture lands. That is the whole reason the
 * fragment exists.
 *
 * An image saved before the fragment existed, or one the browser could not
 * measure, still renders — it just cannot reserve its space.
 */
export function PostImage({ url, alt, caption }: {
  url: string
  alt: string
  caption?: string | null
}) {
  const { src, width, height } = parseImageUrl(url)

  const img = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className="block w-full rounded-lg"
      style={{ height: 'auto', maxWidth: '100%' }}
    />
  )

  // No caption, no <figure>: a figure with an empty figcaption is noise for a
  // screen reader, and an <img> alone is valid inside a paragraph where a
  // <figure> is not.
  if (!caption) return img

  return (
    <figure className="my-6">
      {img}
      <figcaption className="text-xs mt-2 leading-relaxed" style={{ color: COLORS.faint }}>
        {caption}
      </figcaption>
    </figure>
  )
}
