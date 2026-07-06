-- Image attachments on comments (Supabase Storage). Mirrors the post-image
-- pattern from 0009: a public bucket, writes scoped to a folder named for a
-- persona the caller owns, and the resulting public URL stored on the comment.

alter table public.comments add column image_url text;

-- Relax the body-length check so an image-only comment (a GIF reaction with no
-- text) is legal: body must be 1–10000 chars UNLESS an image is attached, in
-- which case an empty body is allowed. Original check was `between 1 and 10000`.
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments add constraint comments_body_check
  check (char_length(body) <= 10000
         and (char_length(body) >= 1 or image_url is not null));

-- ============================================================ storage bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-images', 'comment-images', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read (comment images are meant to be seen).
create policy comment_images_public_read on storage.objects
  for select using (bucket_id = 'comment-images');

-- Object path convention: {author_persona_id}/{random}.{ext}. Writable only
-- under a folder matching a persona you own — the same gate as post images.
create policy comment_images_owner_write on storage.objects
  for insert with check (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );
create policy comment_images_owner_update on storage.objects
  for update using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );
create policy comment_images_owner_delete on storage.objects
  for delete using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );

-- ============================================================ create_comment

-- Extend create_comment with an optional image URL. Drop the old 4-arg
-- signature first: adding a defaulted parameter creates a NEW overload rather
-- than replacing, which would make the 3-named-arg PostgREST call ambiguous.
-- Preserves the reply-notification behaviour added in 0006.
drop function if exists create_comment(uuid, uuid, text, uuid);

create or replace function create_comment(
  p_persona uuid, p_post uuid, p_body text, p_parent uuid default null,
  p_image_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_root uuid; v_room uuid; v_id uuid;
  v_parent_author uuid; v_post_author uuid;
begin
  v_root := private_own_active_persona(p_persona);
  select room_id into v_room from posts where id = p_post and status = 'active';
  if v_room is null then raise exception 'Post not found.'; end if;
  perform private_assert_not_room_banned(v_root, v_room);

  insert into comments (post_id, room_id, parent_comment_id, author_persona_id, body, image_url)
  values (p_post, v_room, p_parent, p_persona, p_body, p_image_url)
  returning id into v_id;
  update posts set comment_count = comment_count + 1 where id = p_post;

  -- Notification: reply to a comment, else reply to the post.
  if p_parent is not null then
    select author_persona_id into v_parent_author from comments where id = p_parent;
    if v_parent_author is not null then
      select root_user_id into v_post_author from personas where id = v_parent_author;
      perform private_notify(v_post_author, 'reply', p_persona, v_room, p_post, v_id,
                             jsonb_build_object('parent_comment_id', p_parent));
    end if;
  else
    select p2.root_user_id into v_post_author
      from posts p1 join personas p2 on p2.id = p1.author_persona_id
     where p1.id = p_post;
    perform private_notify(v_post_author, 'reply', p_persona, v_room, p_post, v_id,
                           jsonb_build_object('top_level', true));
  end if;

  return v_id;
end $$;

-- Reaffirm the standing grant model (0003/0005/0006): anon locked out,
-- authenticated may execute. The dropped function's grants went with it.
revoke execute on function create_comment(uuid, uuid, text, uuid, text) from anon, public;
grant execute on function create_comment(uuid, uuid, text, uuid, text) to authenticated;
