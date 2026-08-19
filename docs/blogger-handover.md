# Handing the old blog over to /archive

The 229 posts that were on `chokkablog.blogspot.com` now live at
`chokkablog.com/archive/YYYY/MM/slug`. This is how the old addresses come with
them, and why it is done in two steps rather than one.

## The constraint

**Blogger cannot 301 to another domain.** Its Custom Redirects (Settings →
Errors and redirects) only redirect within the same blog — it rejects an
external target, deliberately, because the feature was abused. Setting a custom
domain on the blog would give real 301s, but only onto a domain that Blogger
itself then serves, which does not get anyone here.

So the strongest signals available are the two below, both set from the theme:

- **a cross-domain `rel="canonical"`** — Google's own mechanism for saying "this
  page and that page are the same thing; index that one";
- **a JavaScript redirect** — followed by readers immediately, and by Google
  when it renders the page.

Weaker than a 301. It is what Blogger allows.

## Why the URLs match

Every new address is the old path with `/archive` in front of it. Nothing on the
Blogger side has to know a slug or hold a lookup table — it concatenates a
string. `vercel.json` does the rest:

| Old | New |
| --- | --- |
| `chokkablog.blogspot.com/2015/03/gers-2015.html` | `chokkablog.com/2015/03/gers-2015.html` |
| → 308 | `chokkablog.com/archive/2015/03/gers-2015` |

Both the `.html` form and the bare path redirect, so a mistyped or half-updated
link still lands.

## Step 1 — the canonical (do this once /archive is live)

Blogger → Theme → the ▾ beside Customise → **Edit HTML**. Paste this immediately
before `</head>`, then Save.

```html
<!-- chokkablog: the archive now lives at chokkablog.com/archive -->
<script type='text/javascript'>
//<![CDATA[
(function () {
  // Post pages only: /YYYY/MM/slug.html. The home page, labels and archives
  // are Blogger's own and are not being moved.
  if (!/^\/\d{4}\/\d{2}\/[^\/]+\.html$/.test(location.pathname)) return;
  var target = 'https://chokkablog.com' + location.pathname;

  // Blogger emits its own canonical, pointing at itself. Two canonicals saying
  // different things is the same as none, so every one is removed and exactly
  // one added back. Run twice — now, and once the document has finished — so
  // it does not matter whether Blogger's tag is written before or after this.
  function claim() {
    var existing = document.querySelectorAll('link[rel="canonical"]');
    for (var i = 0; i < existing.length; i++) {
      existing[i].parentNode.removeChild(existing[i]);
    }
    var link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', target);
    document.head.appendChild(link);
  }
  claim();
  document.addEventListener('DOMContentLoaded', claim);

  // STEP 2 — uncomment this one line when the new pages are indexed.
  // location.replace(target);
})();
//]]>
</script>
```

There is no `<b:if>` around it on purpose: the path test does the same job
without depending on Blogger's template language, which on this blog is the
older v2 dialect (`b:version='2'`, confirmed in the theme export).

**Check it worked:** open any post on blogspot, right-click → Inspect → Console,
and paste:

```js
document.querySelectorAll('link[rel=canonical]').length
  + ' → ' + document.querySelector('link[rel=canonical]').href
```

It should say `1 → https://chokkablog.com/…`. One, not two. It will not show in
View Source — it is set after the page loads, which is also why Google sees it
only when it renders the page.

Then, in Search Console:

1. Add and verify `chokkablog.com` if it is not already there.
2. Submit `https://chokkablog.com/sitemap.xml`.
3. Leave the blogspot property in place. Google has to keep crawling the old
   pages to see the canonical; removing them from its index by hand would throw
   away the thing being transferred.

## Step 2 — the redirect (a few weeks later)

Once the new pages are showing up in Search Console's Pages report (search
`site:chokkablog.com/archive`), uncomment the `location.replace(target)` line
and save the theme again. From then on, anyone landing on an old blogspot link
arrives on the new page.

**Not before.** Redirecting to pages Google has not indexed yet means it follows
a redirect to something it does not know about, and there is nothing on the
other end to inherit the ranking.

## What must not happen

- **Do not delete the Blogger blog.** All 764 images in the archive are still
  served from `blogger.googleusercontent.com`, and the redirect above is served
  by the blog itself. Deleting it breaks both.
- **Do not `noindex` the old posts.** A noindexed page's canonical is ignored,
  so it would throw away the signal instead of passing it on.
- **Do not change the archive's URLs.** They are the old paths; that is the
  entire mechanism.

## Expect some wobble

A canonical plus a JS redirect recovers most of what a 301 would, and slowly —
weeks, not days. Rankings usually dip before they settle. The archive pages
themselves are prerendered with their original publication dates and full text,
so what Google finds on the other side is the same content at a faster address
on a domain that also carries the new writing.
