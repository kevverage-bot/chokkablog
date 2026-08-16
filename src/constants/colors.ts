/**
 * The chokkablog palette, taken from the design concept
 * (chokkablog-design-concept.html): a near-black ink on white, with a single
 * coral accent used for the wordmark dot, section labels, tags and links.
 *
 * Deliberately small. One accent colour is what makes the design read as
 * restrained rather than decorated — resist adding a second without a reason
 * that a reader would notice.
 *
 * Chart colours are NOT here. Charts arrive embedded from the tool sites
 * (GERS Explorer, CRA, OECD), each of which carries its own palette; this file
 * is the site chrome only.
 */
export const COLORS = {
  /** Body text, headings, the wordmark, the rule under the nav. */
  ink: '#1a1a1a',
  /** The accent. The dot, labels, tags, links, focus rings. */
  accent: '#D85A30',
  /** Accent at rest on a background — tag chips, subtle fills. */
  accentSoft: '#FBEEE9',
  /** Secondary text: excerpts, meta lines, captions. */
  muted: '#666666',
  /** Tertiary text: the footer, timestamps, disabled states. */
  faint: '#999999',
  /** Card and input borders, and the hairlines between list items. */
  border: '#e8e8e8',
  /** A flat wash for things set apart from the prose: pulled quotations, inline
   *  code. Warm rather than blue-grey, so it sits with the coral. */
  tint: '#F6F4F2',
  /** Row/card hover wash. */
  hoverBg: '#FAFAFA',
  /** Errors, failed saves, and the unpublished-draft outline. */
  negative: '#B71C1C',
  /** Confirmation — a saved edit, a published comment. */
  positive: '#1A7A3A',
} as const

/**
 * The outline on content only a signed-in admin can see because it isn't
 * published (see components/AdminPreview.tsx).
 *
 * `outline`, not `border`, so applying it never shifts the layout — the preview
 * must show the draft exactly where the published version will sit.
 *
 * Lives here rather than beside the badge so that file exports components only,
 * which is what keeps fast refresh working during editing.
 */
export const PREVIEW_OUTLINE = {
  outline: `2px dashed ${COLORS.negative}`,
  outlineOffset: 2,
} as const
