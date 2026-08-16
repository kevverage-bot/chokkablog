-- ============================================================
-- POST IMAGES
-- A public storage bucket for pictures dropped into posts.
--
-- Public READ is the point: these are illustrations in published writing, and
-- they have to load for anyone, including a crawler fetching the Open Graph
-- card with no session at all. Public WRITE would be an open file host — so
-- uploads go through the same public.is_admin() as everything else.
--
-- Run after 002_profiles.sql (needs is_admin()). Idempotent: safe to re-run.
-- ============================================================

-- The bucket. `public = true` makes objects readable at a plain, cacheable URL
-- with no signing, which is what lets the URL sit in a post's Markdown as an
-- ordinary link and survive being copied anywhere.
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do update set public = excluded.public;

-- ─── Policies on storage.objects, scoped to this bucket ───
-- storage.objects already has RLS enabled by Supabase; these add this bucket's
-- rules without touching any other bucket's.

drop policy if exists "Post images are publicly readable" on storage.objects;
create policy "Post images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'post-images');

drop policy if exists "Admins can upload post images" on storage.objects;
create policy "Admins can upload post images"
  on storage.objects for insert
  with check (bucket_id = 'post-images' and public.is_admin());

drop policy if exists "Admins can replace post images" on storage.objects;
create policy "Admins can replace post images"
  on storage.objects for update
  using (bucket_id = 'post-images' and public.is_admin());

-- Deliberately allowed, and deliberately not exposed in the editor: an image
-- deleted while a published post still references it leaves a broken picture on
-- a live page, and nothing here can know which posts point at which file. Tidy
-- up from the dashboard, and check the post first.
drop policy if exists "Admins can delete post images" on storage.objects;
create policy "Admins can delete post images"
  on storage.objects for delete
  using (bucket_id = 'post-images' and public.is_admin());
