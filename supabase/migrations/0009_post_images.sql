-- Image attachments on posts (Supabase Storage). Mirrors the avatar pattern
-- from 0004: a public bucket, writes scoped to a folder named for a persona
-- the caller owns, and the resulting public URL stored on the post row.

alter table public.posts add column image_url text;

-- ============================================================ storage bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read (post images are meant to be seen).
create policy post_images_public_read on storage.objects
  for select using (bucket_id = 'post-images');

-- Object path convention: {author_persona_id}/{random}.{ext}. Writable only
-- under a folder matching a persona you own — the same gate as persona
-- avatars, so a root can only attach images as one of its own masks.
create policy post_images_owner_write on storage.objects
  for insert with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );
create policy post_images_owner_update on storage.objects
  for update using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );
create policy post_images_owner_delete on storage.objects
  for delete using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );

-- ============================================================ create_post

-- Extend create_post with an optional image URL. Drop the old 5-arg signature
-- first: adding a defaulted parameter creates a NEW overload rather than
-- replacing, which would make the 4-named-arg PostgREST call ambiguous.
drop function if exists create_post(uuid, uuid, text, text, uuid);

create or replace function create_post(
  p_persona uuid, p_room uuid, p_title text, p_body text,
  p_crosspost_from uuid default null, p_image_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_root uuid; v_id uuid; v_src_root uuid;
begin
  v_root := private_own_active_persona(p_persona);
  perform private_assert_not_room_banned(v_root, p_room);

  -- Cross-posting is allowed only between personas of the SAME root.
  if p_crosspost_from is not null then
    select p2.root_user_id into v_src_root
      from posts p1 join personas p2 on p2.id = p1.author_persona_id
     where p1.id = p_crosspost_from;
    if v_src_root is distinct from v_root then
      raise exception 'You can only cross-post your own content.';
    end if;
  end if;

  insert into posts (room_id, author_persona_id, title, body, crossposted_from_post_id, image_url)
  values (p_room, p_persona, p_title, p_body, p_crosspost_from, p_image_url)
  returning id into v_id;
  return v_id;
end $$;

-- Reaffirm the standing grant model (0003/0005/0006): anon locked out,
-- authenticated may execute. The dropped function's grants went with it; the
-- Section I default privileges from 0006 already cover this, but stay explicit.
revoke execute on function create_post(uuid, uuid, text, text, uuid, text) from anon, public;
grant execute on function create_post(uuid, uuid, text, text, uuid, text) to authenticated;
