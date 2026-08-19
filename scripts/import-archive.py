#!/usr/bin/env python3
"""
Turn the Blogger Takeout export into SQL for public.archive_posts / archive_comments.

WHY THIS IS PYTHON, in a Node repo
It runs once, by hand, off a 9.9MB XML file. Node has no XML parser in its
standard library, so the alternative was a dependency in package.json that the
site itself would never use, or a hand-rolled parser over someone else's markup.
Python ships ElementTree and HTMLParser, and macOS ships Python. Nothing in the
build, the app or the tests runs this file.

WHAT IT PRODUCES
    supabase/data/archive_seed.sql      — every live post, and its live comments

Re-running is safe in both directions: the SQL is `on conflict do update`, keyed
on Blogger's own entry id, and it deliberately does NOT overwrite `note` —
that column holds what Kevin wrote about the post afterwards, and an import must
never eat it.

WHAT IT REFUSES TO DO
Exit non-zero rather than emit a partial archive: a post with no path, a
sanitiser that dropped everything, a dollar-quote tag that appears in the
content. A silently short import is the failure mode worth engineering against,
because 229 posts is more than anyone will eyeball.

USAGE
    python3 scripts/import-archive.py [path/to/feed.atom]
"""
import html as htmllib
import os
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ATOM = "http://www.w3.org/2005/Atom"
BLOGGER = "http://schemas.google.com/blogger/2018"
NS = {"a": ATOM, "b": BLOGGER}

DEFAULT_FEED = os.path.expanduser(
    "~/Downloads/Takeout/Blogger/Blogs/chokka blog/feed.atom"
)
OUT = "supabase/data/archive_seed.sql"

# The blog these posts were published on. Kept in the row so a reader — and a
# search engine — can always see where a piece originally appeared.
ORIGIN = "https://chokkablog.blogspot.com"

# ── The sanitiser ───────────────────────────────────────────────────────────
# The posts are Kevin's own, but the 3,207 COMMENTS are the public's, written
# into a form that allowed HTML, and they are about to be rendered as trusted
# markup by dangerouslySetInnerHTML. So both go through the same allowlist and
# comments get the stricter half of it.
#
# The output is also rebuilt rather than patched: every tag is re-emitted from a
# stack, unbalanced end tags are dropped and anything still open is closed at the
# end. Blogger's HTML is full of unclosed <div>s, and a stray one in a
# PRERENDERED page does not just break that post — it swallows everything the
# prerenderer wrote after it.

POST_TAGS = {
    "p", "br", "div", "span", "a", "b", "strong", "i", "em", "u", "s", "strike",
    "sup", "sub", "ul", "ol", "li", "blockquote", "hr", "h1", "h2", "h3", "h4",
    "h5", "h6", "img", "figure", "figcaption", "table", "thead", "tbody", "tr",
    "td", "th", "pre", "code", "small", "iframe", "center",
}
COMMENT_TAGS = {"a", "b", "strong", "i", "em", "u", "br", "blockquote", "p", "span"}
VOID = {"br", "hr", "img"}

# `class` survives because Blogger's own layout depends on it — `.separator` is
# what centres an image — and a class name cannot execute anything. `style` is
# filtered rather than dropped for the same reason: without it every image in the
# archive left-aligns, which is a visible regression in 229 posts.
ATTRS = {
    "a": {"href", "title", "name"},
    "img": {"src", "alt", "title", "width", "height"},
    "iframe": {"src", "width", "height", "title"},
}
GLOBAL_ATTRS = {"class", "style"}

# Layout only. `position`, `z-index` and anything that can escape the article's
# box are absent on purpose: an old post must not be able to cover the site's own
# chrome.
STYLE_PROPS = {
    "text-align", "font-style", "font-weight", "text-decoration", "font-size",
    "margin", "margin-left", "margin-right", "margin-top", "margin-bottom",
    "padding", "padding-left", "float", "clear", "width", "max-width", "height",
    "display", "border", "border-bottom", "line-height", "vertical-align",
    "background-color", "color", "list-style-type",
}

# 17 of the 21 iframes are YouTube; the rest (Vine, OneDrive, Giphy) are either
# dead services or a login wall, and become a plain link instead of an empty box.
YOUTUBE = re.compile(r"^(?:https?:)?//(?:www\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)/", re.I)


class Sanitiser(HTMLParser):
    def __init__(self, allowed):
        super().__init__(convert_charrefs=True)
        self.allowed = allowed
        self.out = []
        self.stack = []
        self.dropping = 0  # depth inside a <script>/<style>, whose text goes too

    # -- helpers
    def _url(self, value):
        v = (value or "").strip()
        if v.startswith("//"):
            v = "https:" + v
        if re.match(r"^https?://", v, re.I) or v.startswith("/") or v.startswith("#"):
            return v
        return None  # javascript:, data:, mailto: and anything else

    def _style(self, value):
        keep = []
        for decl in (value or "").split(";"):
            if ":" not in decl:
                continue
            prop, _, val = decl.partition(":")
            prop = prop.strip().lower()
            val = val.strip()
            if prop in STYLE_PROPS and "url(" not in val.lower() and "expression" not in val.lower():
                keep.append(f"{prop}: {val}")
        return "; ".join(keep)

    def _attrs(self, tag, attrs):
        allowed = ATTRS.get(tag, set()) | GLOBAL_ATTRS
        out = []
        for name, value in attrs:
            name = name.lower()
            if name.startswith("on") or name not in allowed:
                continue
            if name in ("href", "src"):
                value = self._url(value)
                if value is None:
                    return None  # a link or image we cannot vouch for: drop the tag
            elif name == "style":
                value = self._style(value)
                if not value:
                    continue
            elif value is None:
                continue
            out.append(f' {name}="{htmllib.escape(str(value), quote=True)}"')
        if tag == "a":
            # Every link in the archive leaves for somewhere written years ago.
            out.append(' rel="nofollow noopener" target="_blank"')
        if tag == "iframe":
            out.append(' loading="lazy" allowfullscreen=""')
        if tag == "img":
            out.append(' loading="lazy"')
        return "".join(out)

    # -- HTMLParser interface
    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ("script", "style"):
            self.dropping += 1
            return
        if self.dropping:
            return
        if tag == "iframe" and not YOUTUBE.match(dict(attrs).get("src") or ""):
            src = self._url(dict(attrs).get("src") or "")
            if src:
                self.out.append(f'<p><a href="{htmllib.escape(src)}" rel="nofollow noopener" target="_blank">{htmllib.escape(src)}</a></p>')
            return
        if tag not in self.allowed:
            return  # unknown tag: keep the words, lose the wrapper
        rendered = self._attrs(tag, attrs)
        if rendered is None:
            return
        self.out.append(f"<{tag}{rendered}>")
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        tag = tag.lower()
        if self.dropping or tag not in self.allowed:
            return
        rendered = self._attrs(tag, attrs)
        if rendered is None:
            return
        if tag in VOID:
            self.out.append(f"<{tag}{rendered}>")
        else:
            self.out.append(f"<{tag}{rendered}></{tag}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("script", "style"):
            self.dropping = max(0, self.dropping - 1)
            return
        if self.dropping or tag in VOID or tag not in self.allowed:
            return
        if tag not in self.stack:
            return  # an end tag with no start: Blogger emits these
        # Close anything opened inside it that was never closed, innermost first.
        while self.stack:
            open_tag = self.stack.pop()
            self.out.append(f"</{open_tag}>")
            if open_tag == tag:
                break

    def handle_data(self, data):
        if not self.dropping:
            self.out.append(htmllib.escape(data, quote=False))

    def result(self):
        while self.stack:
            self.out.append(f"</{self.stack.pop()}>")
        text = "".join(self.out)
        text = re.sub(r"(?:\s*<br>\s*){3,}", "<br><br>", text)  # Blogger loves <br>
        return text.strip()


def sanitise(raw, allowed):
    s = Sanitiser(allowed)
    s.feed(raw or "")
    s.close()
    return s.result()


def to_text(raw):
    """Plain prose from HTML, for excerpts and the full-text index."""
    text = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", raw or "", flags=re.I)
    text = re.sub(r"<br\s*/?>|</(p|div|li|h[1-6]|blockquote)>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", htmllib.unescape(text)).strip()


def excerpt(text, limit=240):
    """Whole sentences up to `limit`, else a clean word break. Twin in spirit of
    src/lib/postExcerpt.ts — the archive stores its excerpt rather than deriving
    it in the browser, because the browser never has these bodies."""
    if len(text) <= limit:
        return text
    window = text[: limit + 1]
    stop = max(window.rfind(". "), window.rfind("? "), window.rfind("! "))
    if stop > limit * 0.4:
        return text[: stop + 1]
    space = window.rfind(" ")
    return text[: space if space > 0 else limit].rstrip() + "…"


# ── SQL emission ────────────────────────────────────────────────────────────
def quoted(value, tag="arc"):
    """Dollar-quoted literal. Checked, not trusted: a body containing the tag
    would end the string early and turn the rest of a post into SQL."""
    if f"${tag}$" in value:
        raise SystemExit(f"content contains the dollar-quote tag ${tag}$ — pick another")
    return f"${tag}${value}${tag}$"


def array_literal(items):
    if not items:
        return "'{}'"
    inner = ",".join('"' + i.replace("\\", "\\\\").replace('"', '\\"') + '"' for i in items)
    return quoted("{" + inner + "}")


def main():
    feed = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_FEED
    if not os.path.exists(feed):
        raise SystemExit(f"no feed at {feed}")
    root = ET.parse(feed).getroot()

    def field(entry, name, ns="b"):
        return (entry.findtext(f"{ns}:{name}", default="", namespaces=NS) or "").strip()

    # ⚠ The export mixes namespaces inside one entry: `type`, `status`,
    # `filename` and `parent` are Blogger's, while `id`, `title`, `content` and
    # `published` stay Atom's. Reading a date from the wrong one returns '' —
    # silently, because findtext has a default.
    def atom(entry, name):
        return field(entry, name, ns="a")

    entries = root.findall("a:entry", NS)
    posts, comments = [], []
    for e in entries:
        kind, status = field(e, "type"), field(e, "status")
        if kind == "POST" and status == "LIVE":
            posts.append(e)
        elif kind == "COMMENT" and status == "LIVE":
            comments.append(e)

    by_post = {}
    for c in comments:
        by_post.setdefault(field(c, "parent"), []).append(c)

    rows, comment_rows = [], []
    dropped_comments = 0
    for e in posts:
        blogger_id = (e.findtext("a:id", default="", namespaces=NS) or "").strip()
        filename = field(e, "filename")          # '/2021/04/mind-gap-....html'
        title = (e.findtext("a:title", default="", namespaces=NS) or "").strip()
        raw = e.findtext("a:content", default="", namespaces=NS) or ""
        published = atom(e, "published")
        if not filename or not blogger_id or not published:
            raise SystemExit(f"post {title!r} has no filename/id/published date")

        path = filename.lstrip("/")
        if path.endswith(".html"):
            path = path[: -len(".html")]
        if not re.fullmatch(r"\d{4}/\d{2}/[a-z0-9\-_.]+", path):
            raise SystemExit(f"unexpected Blogger path {path!r} for {title!r}")

        clean = sanitise(raw, POST_TAGS)
        text = to_text(clean)
        if raw.strip() and not clean:
            raise SystemExit(f"sanitiser emptied {title!r}")

        labels = [c.get("term") for c in e.findall("a:category", NS) if c.get("term")]
        mine = by_post.get(blogger_id, [])
        mine.sort(key=lambda c: atom(c, "published"))

        for c in mine:
            author = c.find("a:author", NS)
            kids = {k.tag.split("}")[-1]: (k.text or "").strip() for k in author} if author is not None else {}
            body = sanitise(c.findtext("a:content", default="", namespaces=NS) or "", COMMENT_TAGS)
            if not to_text(body):
                dropped_comments += 1
                continue
            comment_rows.append({
                "blogger_id": (c.findtext("a:id", default="", namespaces=NS) or "").strip(),
                "post_blogger_id": blogger_id,
                "reply_to": field(c, "inReplyTo") or None,
                "name": kids.get("name") or "",
                "uri": kids.get("uri") or None,
                "html": body,
                "published": atom(c, "published"),
            })

        rows.append({
            "blogger_id": blogger_id,
            "path": path,
            "title": title,
            "html": clean,
            "plain": text,
            "excerpt": excerpt(text),
            "labels": labels,
            "published": published,
            "original_url": ORIGIN + filename,
            "comment_count": len([c for c in mine if to_text(sanitise(c.findtext("a:content", default="", namespaces=NS) or "", COMMENT_TAGS))]),
        })

    if len(rows) != 229:
        print(f"  ⚠ {len(rows)} posts, expected 229 — the export may have changed", file=sys.stderr)
    seen = {}
    for r in rows:
        if r["path"] in seen:
            raise SystemExit(f"two posts share the path {r['path']}")
        seen[r["path"]] = True

    out = ["-- Generated by scripts/import-archive.py — do not edit by hand.",
           f"-- {len(rows)} posts and {len(comment_rows)} comments from the Blogger export.",
           "-- Re-runnable: keyed on Blogger's entry id, and `note` is never overwritten.",
           "begin;", ""]

    for r in rows:
        out.append(
            "insert into public.archive_posts "
            "(blogger_id, path, title, html, plain, excerpt, labels, published_at, original_url, comment_count) values ("
            f"{quoted(r['blogger_id'])}, {quoted(r['path'])}, {quoted(r['title'])}, {quoted(r['html'])}, "
            f"{quoted(r['plain'])}, {quoted(r['excerpt'])}, {array_literal(r['labels'])}::text[], "
            f"{quoted(r['published'])}::timestamptz, {quoted(r['original_url'])}, {r['comment_count']}) "
            "on conflict (blogger_id) do update set "
            "path = excluded.path, title = excluded.title, html = excluded.html, plain = excluded.plain, "
            "excerpt = excluded.excerpt, labels = excluded.labels, published_at = excluded.published_at, "
            "original_url = excluded.original_url, comment_count = excluded.comment_count;"
        )
    out.append("")

    for c in comment_rows:
        uri = quoted(c["uri"]) if c["uri"] else "null"
        reply = quoted(c["reply_to"]) if c["reply_to"] else "null"
        out.append(
            "insert into public.archive_comments "
            "(blogger_id, post_id, reply_to_blogger_id, author_name, author_uri, html, published_at) "
            f"select {quoted(c['blogger_id'])}, p.id, {reply}, {quoted(c['name'])}, {uri}, "
            f"{quoted(c['html'])}, {quoted(c['published'])}::timestamptz "
            f"from public.archive_posts p where p.blogger_id = {quoted(c['post_blogger_id'])} "
            "on conflict (blogger_id) do update set "
            "author_name = excluded.author_name, author_uri = excluded.author_uri, html = excluded.html, "
            "published_at = excluded.published_at, reply_to_blogger_id = excluded.reply_to_blogger_id;"
        )

    out += ["", "commit;", ""]
    sql = "\n".join(out)

    # A last look at what was actually produced. There is no Postgres on this
    # machine to run it against, and the person who applies it will be pasting
    # ten megabytes into a shell in one go — so the cheap structural checks that
    # catch a truncated or unbalanced file are worth making here.
    if sql.count("$arc$") % 2:
        raise SystemExit("unbalanced dollar quotes — a body would run on into SQL")
    statements = re.sub(r"\$arc\$[\s\S]*?\$arc\$", "''", sql)
    if statements.count(";") != len(rows) + len(comment_rows) + 2:  # + begin, commit
        raise SystemExit("statement count does not match the rows written")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write(sql)

    size = os.path.getsize(OUT) / 1e6
    years = sorted({r["path"][:4] for r in rows})
    print(f"wrote {OUT} — {size:.1f} MB")
    print(f"  {len(rows)} posts ({years[0]}–{years[-1]}), {len(comment_rows)} comments"
          f"{f', {dropped_comments} empty comments skipped' if dropped_comments else ''}")
    print(f"  longest body {max(len(r['html']) for r in rows) / 1000:.0f} kB, "
          f"total {sum(len(r['html']) for r in rows) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
