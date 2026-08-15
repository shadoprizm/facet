-- Security-report follow-up: close privilege drift, remove a root-identity
-- disclosure from rooms, and stop public Storage bucket enumeration.

-- ============================================================ public room projection

-- A Room founder's root UUID is platform-private. Expose the founder persona,
-- which is intentionally public, but never created_by_root.
create view public.rooms_public
  with (security_invoker = true) as
  select
    id,
    slug,
    name,
    description,
    constitution,
    agent_config,
    created_by_persona_id,
    created_at,
    avatar_url,
    removed_at
  from public.rooms;

-- ============================================================ table privileges

-- Supabase's bootstrap grants are intentionally broad and rely on RLS. Facet
-- writes only through audited SECURITY DEFINER RPCs, so narrow the Data API to
-- the exact read surface the application uses.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

grant select on public.personas_public to authenticated;
grant select on public.rooms_public to authenticated;
grant select on public.room_subscriber_counts to authenticated;

-- Own-persona reads still use the base table so RLS can identify the caller's
-- masks. Column privileges make root_user_id unselectable even if an RLS policy
-- is loosened accidentally in the future.
grant select (
  id,
  handle,
  display_name,
  avatar_color,
  bio,
  karma,
  status,
  created_at,
  avatar_url
) on public.personas to authenticated;

-- PostgREST embedded relationships (for example posts -> rooms) resolve
-- against the base table. Grant only the same root-free projection columns.
grant select (
  id,
  slug,
  name,
  description,
  constitution,
  agent_config,
  created_by_persona_id,
  created_at,
  avatar_url,
  removed_at
) on public.rooms to authenticated;

grant select on public.agent_calibration to authenticated;
grant select on public.room_subscriptions to authenticated;
grant select on public.posts to authenticated;
grant select on public.comments to authenticated;
grant select on public.agent_actions to authenticated;
grant select (
  voter_persona_id,
  target_type,
  target_id,
  value,
  created_at
) on public.votes to authenticated;
grant select (
  action_id,
  voter_persona_id,
  vote,
  created_at
) on public.override_votes to authenticated;
grant select (
  id,
  type,
  actor_persona_id,
  room_id,
  post_id,
  comment_id,
  payload,
  read,
  created_at
) on public.notifications to authenticated;

-- New relations are closed until a later migration grants an explicit surface.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ============================================================ explicit RLS roles

-- auth.role() is deprecated and policies targeting PUBLIC also run for anon.
-- Restrict every application-read policy to authenticated and cache auth.uid()
-- once per statement where it participates in a row predicate.
alter policy personas_own_select on public.personas
  to authenticated
  using ((select auth.uid()) = root_user_id);

alter policy rooms_read on public.rooms
  to authenticated
  using (true);

alter policy calibration_read on public.agent_calibration
  to authenticated
  using (true);

alter policy subs_own_select on public.room_subscriptions
  to authenticated
  using (
    persona_id in (
      select id
      from public.personas
      where root_user_id = (select auth.uid())
    )
  );

alter policy posts_read on public.posts
  to authenticated
  using (true);

alter policy comments_read on public.comments
  to authenticated
  using (true);

alter policy votes_own_select on public.votes
  to authenticated
  using ((select auth.uid()) = voter_root_id);

alter policy agent_actions_read on public.agent_actions
  to authenticated
  using (true);

alter policy override_votes_own_select on public.override_votes
  to authenticated
  using ((select auth.uid()) = voter_root_id);

alter policy reports_own_select on public.reports
  to authenticated
  using ((select auth.uid()) = reporter_root_id);

alter policy notifications_own_select on public.notifications
  to authenticated
  using ((select auth.uid()) = root_user_id);

alter policy platform_admins_self_select on public.platform_admins
  to authenticated
  using ((select auth.uid()) = root_user_id);

-- Storage writes are authenticated-only. Public object URLs for public buckets
-- do not use storage.objects SELECT policies; dropping these two policies stops
-- clients from listing every uploaded post/comment image.
alter policy persona_avatars_owner_write on storage.objects to authenticated;
alter policy persona_avatars_owner_update on storage.objects to authenticated;
alter policy persona_avatars_owner_delete on storage.objects to authenticated;
alter policy room_avatars_owner_write on storage.objects to authenticated;
alter policy room_avatars_owner_update on storage.objects to authenticated;
alter policy room_avatars_owner_delete on storage.objects to authenticated;
alter policy post_images_owner_write on storage.objects to authenticated;
alter policy post_images_owner_update on storage.objects to authenticated;
alter policy post_images_owner_delete on storage.objects to authenticated;
alter policy comment_images_owner_write on storage.objects to authenticated;
alter policy comment_images_owner_update on storage.objects to authenticated;
alter policy comment_images_owner_delete on storage.objects to authenticated;

drop policy if exists post_images_public_read on storage.objects;
drop policy if exists comment_images_public_read on storage.objects;

-- ============================================================ mutation abuse controls

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.rate_limit_buckets (
  scope             text not null,
  root_user_id      uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count     integer not null check (request_count > 0),
  primary key (scope, root_user_id)
);

create or replace function private.consume_rate_limit(
  p_scope text,
  p_root uuid,
  p_limit integer,
  p_window_seconds integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if p_scope !~ '^[a-z_]{3,32}$'
     or p_root is null
     or p_limit not between 1 and 10000
     or p_window_seconds not between 10 and 86400 then
    raise exception 'Invalid rate-limit configuration.';
  end if;

  insert into private.rate_limit_buckets (
    scope, root_user_id, window_started_at, request_count
  ) values (
    p_scope, p_root, v_now, 1
  )
  on conflict (scope, root_user_id) do update
    set request_count = case
          when private.rate_limit_buckets.window_started_at
                 <= v_now - make_interval(secs => p_window_seconds)
            then 1
          else private.rate_limit_buckets.request_count + 1
        end,
        window_started_at = case
          when private.rate_limit_buckets.window_started_at
                 <= v_now - make_interval(secs => p_window_seconds)
            then v_now
          else private.rate_limit_buckets.window_started_at
        end
  returning request_count into v_count;

  if v_count > p_limit then
    raise exception 'Rate limit exceeded. Try again later.';
  end if;
end
$$;

create or replace function private.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_root uuid;
  v_room uuid;
  v_scope text;
  v_limit integer;
  v_window integer;
  v_target_type text;
  v_target_id uuid;
begin
  -- Trusted service/cron writes have no end-user JWT and are governed by their
  -- own credentials and schedules.
  if v_caller is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  case tg_table_name
    when 'personas' then
      v_root := new.root_user_id;
      v_scope := 'persona_create'; v_limit := 3; v_window := 86400;

      -- Serialize the active-persona cap as well as the per-day bucket.
      perform pg_advisory_xact_lock(
        hashtextextended('facet-persona:' || v_root::text, 0)
      );
      if (
        select count(*)
        from public.personas
        where root_user_id = v_root and status = 'active'
      ) >= 10 then
        raise exception 'Persona limit: max 10 active personas.';
      end if;

    when 'rooms' then
      v_root := new.created_by_root;
      v_scope := 'room_create'; v_limit := 5; v_window := 86400;

    when 'posts' then
      select root_user_id into v_root
      from public.personas where id = new.author_persona_id;
      v_room := new.room_id;
      v_scope := 'post_create'; v_limit := 30; v_window := 3600;

    when 'comments' then
      select root_user_id into v_root
      from public.personas where id = new.author_persona_id;
      v_room := new.room_id;
      v_scope := 'comment_create'; v_limit := 120; v_window := 3600;

    when 'reports' then
      v_root := new.reporter_root_id;
      v_scope := 'report_create'; v_limit := 10; v_window := 3600;

    when 'votes' then
      if tg_op = 'DELETE' then
        v_root := old.voter_root_id;
        v_target_type := old.target_type;
        v_target_id := old.target_id;
      else
        v_root := new.voter_root_id;
        v_target_type := new.target_type;
        v_target_id := new.target_id;
      end if;
      if v_target_type = 'post' then
        select room_id into v_room from public.posts where id = v_target_id;
      elsif v_target_type = 'comment' then
        select room_id into v_room from public.comments where id = v_target_id;
      end if;
      v_scope := 'content_vote'; v_limit := 600; v_window := 3600;

    when 'override_votes' then
      if tg_op = 'DELETE' then
        v_root := old.voter_root_id;
        select room_id into v_room
        from public.agent_actions where id = old.action_id;
      else
        v_root := new.voter_root_id;
        select room_id into v_room
        from public.agent_actions where id = new.action_id;
      end if;
      v_scope := 'override_vote'; v_limit := 120; v_window := 3600;

    else
      raise exception 'Unsupported rate-limited relation.';
  end case;

  if v_root is distinct from v_caller then
    raise exception 'Mutation root does not match the authenticated caller.';
  end if;

  -- A room ban covers participation, including voting. Clearing an existing
  -- vote remains allowed so a banned user can remove prior activity.
  if v_room is not null and tg_op <> 'DELETE' and exists (
    select 1 from public.room_bans
    where root_user_id = v_root and room_id = v_room
  ) then
    raise exception 'You are banned from this Room. Bans apply to your account, not just one persona.';
  end if;

  perform private.consume_rate_limit(v_scope, v_root, v_limit, v_window);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create trigger personas_write_rate_limit
  before insert on public.personas
  for each row execute function private.enforce_write_rate_limit();
create trigger rooms_write_rate_limit
  before insert on public.rooms
  for each row execute function private.enforce_write_rate_limit();
create trigger posts_write_rate_limit
  before insert on public.posts
  for each row execute function private.enforce_write_rate_limit();
create trigger comments_write_rate_limit
  before insert on public.comments
  for each row execute function private.enforce_write_rate_limit();
create trigger reports_write_rate_limit
  before insert on public.reports
  for each row execute function private.enforce_write_rate_limit();
create trigger votes_write_rate_limit
  before insert or update or delete on public.votes
  for each row execute function private.enforce_write_rate_limit();
create trigger override_votes_write_rate_limit
  before insert or update or delete on public.override_votes
  for each row execute function private.enforce_write_rate_limit();

revoke all on all tables in schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Keep fallback avatar colours to the fixed CSS palette. This prevents direct
-- RPC callers from smuggling arbitrary CSS tokens such as url(...).
alter table public.personas
  add constraint personas_avatar_color_allowed check (
    avatar_color in (
      '#6366f1', '#ef4444', '#f59e0b', '#10b981', '#06b6d4',
      '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
      '#a855f7', '#0ea5e9', '#e11d48', '#65a30d'
    )
  );

-- A reply parent must belong to the same post as the reply. The previous
-- single-column foreign key allowed cross-thread parent references.
alter table public.comments
  add constraint comments_id_post_key unique (id, post_id);
alter table public.comments
  drop constraint comments_parent_comment_id_fkey;
alter table public.comments
  add constraint comments_parent_same_post_fkey
  foreign key (parent_comment_id, post_id)
  references public.comments (id, post_id)
  on delete cascade;

-- Recheck persona limits after taking a per-root transaction lock; the original
-- count-then-insert sequence was raceable under concurrent requests.
create or replace function public.create_persona(
  p_handle text,
  p_display_name text,
  p_avatar_color text default '#6366f1',
  p_bio text default ''
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root uuid := (select auth.uid());
  v_id uuid;
begin
  if v_root is null then raise exception 'Not authenticated.'; end if;
  perform public.private_assert_not_platform_banned(v_root);
  perform pg_advisory_xact_lock(
    hashtextextended('facet-persona:' || v_root::text, 0)
  );

  if (
    select count(*) from public.personas
    where root_user_id = v_root
      and created_at > now() - interval '24 hours'
  ) >= 3 then
    raise exception 'Persona creation rate limit: max 3 per 24 hours.';
  end if;
  if (
    select count(*) from public.personas
    where root_user_id = v_root and status = 'active'
  ) >= 10 then
    raise exception 'Persona limit: max 10 active personas.';
  end if;

  insert into public.personas (
    root_user_id, handle, display_name, avatar_color, bio
  ) values (
    v_root, lower(p_handle), p_display_name, lower(p_avatar_color), p_bio
  ) returning id into v_id;

  return v_id;
end
$$;

-- ============================================================ function allowlist

-- Several functions added after the original lockdown inherited PostgreSQL's
-- default PUBLIC execute grant. Rebuild the API allowlist from scratch.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.public_stats() to anon, authenticated;

grant execute on function public.admin_agent_activity(integer) to authenticated;
grant execute on function public.admin_ban_root(uuid, text) to authenticated;
grant execute on function public.admin_grant(text) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_list_platform_bans() to authenticated;
grant execute on function public.admin_list_reports(text) to authenticated;
grant execute on function public.admin_list_room_bans() to authenticated;
grant execute on function public.admin_lookup_persona(text) to authenticated;
grant execute on function public.admin_remove_comment(uuid) to authenticated;
grant execute on function public.admin_remove_post(uuid) to authenticated;
grant execute on function public.admin_remove_room(uuid) to authenticated;
grant execute on function public.admin_rename_room(uuid, text, text) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
grant execute on function public.admin_revoke(uuid) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_unban_room(uuid, uuid) to authenticated;
grant execute on function public.admin_unban_root(uuid) to authenticated;
grant execute on function public.ban_persona_from_room(uuid, uuid, text) to authenticated;
grant execute on function public.cast_override_vote(uuid, uuid, text) to authenticated;
grant execute on function public.cast_vote(uuid, text, uuid, integer) to authenticated;
grant execute on function public.create_comment(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.create_persona(text, text, text, text) to authenticated;
grant execute on function public.create_post(uuid, uuid, text, text, uuid, text) to authenticated;
grant execute on function public.create_report(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.create_room(uuid, text, text, text, text) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.delete_post(uuid) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.resolve_flag(uuid, text) to authenticated;
grant execute on function public.retire_persona(uuid) to authenticated;
grant execute on function public.set_persona_avatar(uuid, text) to authenticated;
grant execute on function public.set_room_avatar(uuid, text) to authenticated;
grant execute on function public.subscribe_room(uuid, uuid) to authenticated;
grant execute on function public.unsubscribe_room(uuid, uuid) to authenticated;
grant execute on function public.update_constitution(uuid, text) to authenticated;

grant execute on function public.record_agent_action(
  uuid, uuid, text, text, text, uuid, text, jsonb
) to service_role;

-- Future functions are private until their creating migration explicitly grants
-- the intended caller role.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
