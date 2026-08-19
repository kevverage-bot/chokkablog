-- ============================================================
-- THE SIGN-UP BOX'S WORDS
-- The pitch on the email sign-up, editable in Admin rather than deployed.
--
-- Same shape and same reasoning as public.home_content (005_home.sql): the
-- wording is content, not code, and the box now appears in four places — under
-- every blog post, under every archive post, on the home page, and as a line
-- beside the comment form. Changing the pitch in four components and deploying
-- is exactly the friction that stops a pitch ever being improved.
--
-- ⚠ WHAT IS DELIBERATELY *NOT* HERE, and must not be moved here: the small
-- print beneath the field — that a confirmation email is coming, that the
-- address is never shared, that every email carries an unsubscribe link, and the
-- link to the privacy notice. That text is the disclosure UK GDPR expects AT THE
-- POINT OF COLLECTION, and it has to stay true regardless of what the pitch
-- above it says. It is hard-coded in src/components/SubscribeBox.tsx, and a test
-- fails if it stops being. An editable legal disclosure is one that can be
-- edited into a lie by a person in a hurry.
--
-- ⚠ AND THE PITCH ITSELF IS STILL LOAD-BEARING. `intro` is the basis on which
-- consent is given — today it promises only the pieces worth someone's
-- attention, not every post. If the sending pattern ever changes, this text has
-- to change FIRST. It being editable makes that easy; it does not make it
-- optional.
--
-- Run after 002_profiles.sql (needs is_admin() and update_updated_at()).
-- Idempotent: safe to re-run. The seed carries today's live wording and fires
-- only into an empty table, so re-running never overwrites an edit.
-- ============================================================

create table if not exists public.subscribe_content (
  -- One row, forever — see the note on home_content.id for why a boolean
  -- primary key with `check (id)` is the smallest way to say that.
  id             boolean primary key default true check (id),

  -- The label above the pitch. Blank hides it.
  heading        text not null default '',

  -- The pitch, in the same Markdown subset RichText renders everywhere else.
  intro          text not null default '',

  -- The submit button. Blank would leave an unlabelled button, so the app
  -- falls back rather than rendering one.
  button         text not null default '',

  -- The line beside the comment form's opt-in checkbox. A different sentence
  -- from `intro` on purpose: somebody who has just written a comment is already
  -- persuaded, and needs the offer rather than the argument.
  comment_optin  text not null default '',

  updated_at     timestamptz not null default now()
);

drop trigger if exists subscribe_content_updated_at on public.subscribe_content;
create trigger subscribe_content_updated_at
  before update on public.subscribe_content
  for each row execute procedure public.update_updated_at();

-- Today's wording, so applying this file changes nothing a visitor can see.
-- `do nothing` on conflict: the second run must not undo the first edit.
insert into public.subscribe_content (id, heading, intro, button, comment_optin)
values (
  true,
  'New posts by email',
  'I write when there is something to say, and I will only email you when I think a piece is worth your attention — not every time I post.',
  'Keep me posted',
  'Also email me when there is a new post worth reading'
)
on conflict (id) do nothing;

-- ─── RLS ───
-- Read by anyone, written by an admin — the same bargain as home_content. The
-- pitch is public text; it appears on the page whether or not anyone is signed
-- in.
alter table public.subscribe_content enable row level security;

drop policy if exists "Anyone can read the sign-up wording" on public.subscribe_content;
create policy "Anyone can read the sign-up wording"
  on public.subscribe_content for select
  using (true);

drop policy if exists "Admins can update the sign-up wording" on public.subscribe_content;
create policy "Admins can update the sign-up wording"
  on public.subscribe_content for update
  using (public.is_admin());
