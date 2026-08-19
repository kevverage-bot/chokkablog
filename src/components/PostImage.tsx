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
  const { src, width, height, outlined } = parseImageUrl(url)

  const img = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className="block w-full rounded-lg"
      style={{
        height: 'auto',
        maxWidth: '100%',
        // Opt-in, per image, from a `+outline` flag in the URL fragment. It
        // earns its keep on a chart exported with a white background, which
        // otherwise bleeds into the page and looks like a layout bug; a
        // photograph with its own edges usually reads better without one. Hence
        // a choice rather than a rule.
        //
        // ⚠ `outline`, not `border` and not an inset `box-shadow`. A border
        // would add a pixel to each side and undo the space the width/height
        // attributes reserved, so the picture would still nudge the page as it
        // loads — which is the whole thing those attributes exist to prevent.
        // An inset box-shadow takes no space either, but on a replaced element
        // the image content paints over it, so it simply would not be visible.
        // An outline takes no layout space, follows the border radius, and is
        // drawn on top. `-1px` offset tucks it just inside the edge.
        ...(outlined
          ? { outline: `1px solid ${COLORS.border}`, outlineOffset: '-1px' }
          : {}),
      }}
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
