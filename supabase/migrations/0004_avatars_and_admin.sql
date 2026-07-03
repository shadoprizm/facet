-- Image avatars (Supabase Storage) for personas and rooms, plus a platform
-- admin backend. Admin powers are the one deliberate exception to "root is
-- hidden": admins can resolve a persona to its root for abuse enforcement,
-- exactly as the product spec's "known only to the platform" clause implies.

alter table public.personas add column avatar_url text;
alter table public.rooms add column avatar_url text;

create or replace view public.personas_public
  with (security_invoker = false) as
  select id, handle, display_name, avatar_color, bio, karma, status, created_at, avatar_url
  from public.personas;

-- ============================================================ platform admins

create table public.platform_admins (
  root_user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy platform_admins_self_select on public.platform_admins
  for select using (root_user_id = auth.uid());

create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where root_user_id = auth.uid());
$$;

create or replace function private_assert_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from platform_admins where root_user_id = auth.uid()) then
    raise exception 'Admin access required.';
  end if;
end $$;

-- ============================================================ Storage buckets

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('persona-avatars', 'persona-avatars', true, 3145728,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-avatars', 'room-avatars', true, 3145728,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read for both (avatars are meant to be seen).
create policy persona_avatars_public_read on storage.objects
  for select using (bucket_id = 'persona-avatars');
create policy room_avatars_public_read on storage.objects
  for select using (bucket_id = 'room-avatars');

-- Persona avatars: writable only under a folder matching a persona you own.
-- Object path convention: {persona_id}/{random}.{ext}
create policy persona_avatars_owner_write on storage.objects
  for insert with check (
    bucket_id = 'persona-avatars'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );
create policy persona_avatars_owner_update on storage.objects
  for update using (
    bucket_id = 'persona-avatars'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );
create policy persona_avatars_owner_delete on storage.objects
  for delete using (
    bucket_id = 'persona-avatars'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.personas where root_user_id = auth.uid()
    )
  );

-- Room avatars: writable by the Room founder OR a platform admin.
-- Object path convention: {room_id}/{random}.{ext}
create policy room_avatars_owner_write on storage.objects
  for insert with check (
    bucket_id = 'room-avatars'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from public.rooms where created_by_root = auth.uid()
      )
      or exists (select 1 from public.platform_admins where root_user_id = auth.uid())
    )
  );
create policy room_avatars_owner_update on storage.objects
  for update using (
    bucket_id = 'room-avatars'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from public.rooms where created_by_root = auth.uid()
      )
      or exists (select 1 from public.platform_admins where root_user_id = auth.uid())
    )
  );
create policy room_avatars_owner_delete on storage.objects
  for delete using (
    bucket_id = 'room-avatars'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from public.rooms where created_by_root = auth.uid()
      )
      or exists (select 1 from public.platform_admins where root_user_id = auth.uid())
    )
  );

-- ============================================================ avatar setters

create or replace function set_persona_avatar(p_persona uuid, p_avatar_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_own_active_persona(p_persona);
  update personas set avatar_url = p_avatar_url where id = p_persona;
end $$;

create or replace function set_room_avatar(p_room uuid, p_avatar_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and created_by_root = auth.uid())
     and not exists (select 1 from platform_admins where root_user_id = auth.uid()) then
    raise exception 'Only the Room founder or a platform admin can set the Room avatar.';
  end if;
  update rooms set avatar_url = p_avatar_url where id = p_room;
end $$;

-- ============================================================ admin RPCs

-- Resolve a persona handle to its root — the deliberate root-visibility
-- exception for abuse enforcement, restricted to admins.
create or replace function admin_lookup_persona(p_handle text)
returns table (
  persona_id uuid, handle text, display_name text, status text,
  karma int, root_user_id uuid, root_email text, created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  return query
    select p.id, p.handle, p.display_name, p.status, p.karma, p.root_user_id, u.email, p.created_at
    from personas p join auth.users u on u.id = p.root_user_id
    where p.handle = lower(p_handle);
end $$;

create or replace function admin_ban_root(p_root uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  insert into platform_bans (root_user_id, reason) values (p_root, p_reason)
  on conflict (root_user_id) do update set reason = excluded.reason;
end $$;

create or replace function admin_unban_root(p_root uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  delete from platform_bans where root_user_id = p_root;
end $$;

create or replace function admin_unban_room(p_room uuid, p_root uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  delete from room_bans where room_id = p_room and root_user_id = p_root;
end $$;

create or replace function admin_list_platform_bans()
returns table (root_user_id uuid, email text, reason text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  return query
    select b.root_user_id, u.email, b.reason, b.created_at
    from platform_bans b join auth.users u on u.id = b.root_user_id
    order by b.created_at desc;
end $$;

create or replace function admin_list_room_bans()
returns table (
  room_id uuid, room_slug text, root_user_id uuid, root_email text,
  banned_persona_id uuid, banned_handle text, reason text, created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  return query
    select rb.room_id, r.slug, rb.root_user_id, u.email, rb.banned_persona_id, p.handle, rb.reason, rb.created_at
    from room_bans rb
    join rooms r on r.id = rb.room_id
    join auth.users u on u.id = rb.root_user_id
    left join personas p on p.id = rb.banned_persona_id
    order by rb.created_at desc;
end $$;

create or replace function admin_list_admins()
returns table (root_user_id uuid, email text, granted_by uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  return query
    select pa.root_user_id, u.email, pa.granted_by, pa.created_at
    from platform_admins pa join auth.users u on u.id = pa.root_user_id
    order by pa.created_at;
end $$;

create or replace function admin_grant(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_root uuid;
begin
  perform private_assert_admin();
  select id into v_root from auth.users where email = lower(p_email);
  if v_root is null then raise exception 'No account with that email.'; end if;
  insert into platform_admins (root_user_id, granted_by) values (v_root, auth.uid())
  on conflict do nothing;
end $$;

create or replace function admin_revoke(p_root uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  if (select count(*) from platform_admins) <= 1 then
    raise exception 'Cannot remove the last remaining admin.';
  end if;
  delete from platform_admins where root_user_id = p_root;
end $$;

create or replace function admin_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform private_assert_admin();
  select jsonb_build_object(
    'roots', (select count(*) from auth.users),
    'personas_active', (select count(*) from personas where status = 'active'),
    'personas_retired', (select count(*) from personas where status = 'retired'),
    'rooms', (select count(*) from rooms),
    'posts', (select count(*) from posts),
    'comments', (select count(*) from comments),
    'open_flags', (select count(*) from agent_actions where action_type = 'flag' and review_status = 'open'),
    'pending_votes', (select count(*) from agent_actions where status = 'pending'),
    'room_bans', (select count(*) from room_bans),
    'platform_bans', (select count(*) from platform_bans)
  ) into v;
  return v;
end $$;

-- Broaden founder-only moderation to founder-or-admin.
create or replace function resolve_flag(p_action uuid, p_disposition text)
returns void language plpgsql security definer set search_path = public as $$
declare v_room uuid;
begin
  select room_id into v_room from agent_actions where id = p_action and action_type = 'flag';
  if v_room is null then raise exception 'Flag not found.'; end if;
  if not exists (select 1 from rooms where id = v_room and created_by_root = auth.uid())
     and not exists (select 1 from platform_admins where root_user_id = auth.uid()) then
    raise exception 'Only the Room founder or a platform admin can review flags.';
  end if;
  update agent_actions set review_status = 'reviewed',
         status = case when status = 'pending' then 'upheld' else status end,
         resolved_at = coalesce(resolved_at, now())
   where id = p_action;
end $$;

create or replace function ban_persona_from_room(p_room uuid, p_persona uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target_root uuid;
begin
  if not exists (select 1 from rooms where id = p_room and created_by_root = auth.uid())
     and not exists (select 1 from platform_admins where root_user_id = auth.uid()) then
    raise exception 'Only the Room founder or a platform admin can ban.';
  end if;
  select root_user_id into v_target_root from personas where id = p_persona;
  if v_target_root is null then raise exception 'Persona not found.'; end if;
  insert into room_bans (room_id, root_user_id, banned_persona_id, reason)
  values (p_room, v_target_root, p_persona, p_reason)
  on conflict do nothing;
end $$;

-- Keep the anon lockdown from 0003 in force for every function added above.
revoke execute on all functions in schema public from anon;
revoke execute on function private_assert_admin() from authenticated, anon, public;
