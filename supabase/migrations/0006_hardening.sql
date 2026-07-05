-- Facet — pre-launch hardening (migration 0006).
--
-- Covers: agent RPC lockdown (T1#1), user reporting (T1#2), content
-- deletion (T1#3), override-loop fixes (T2#5, T2#6), admin room management
-- (T3#9), notifications (T3#11), agent-activity rollup (T2#8), and the
-- 0005 grant-leak cleanup (T1-bonus).
--
-- Trust model is unchanged: every write RPC is SECURITY DEFINER, re-derives
-- the caller's root from auth.uid(), and re-verifies ownership/ban state.
-- The one signature change is cast_override_vote (redefined to close the
-- self-override bug + symmetric learning step).

-- ============================================================
-- SECTION A — Grant cleanup (T1-bonus).
-- 0005's blanket `grant execute on all functions to authenticated` re-grants
-- the private_* helpers that 0003/0004 explicitly revoked. Re-revoke them so
-- authenticated users can't probe internal helpers (which leak info via
-- raised exceptions). record_agent_action is locked separately in SECTION B.
-- ============================================================

revoke execute on function private_assert_not_platform_banned(uuid) from authenticated, public;
revoke execute on function private_assert_not_room_banned(uuid, uuid) from authenticated, public;
revoke execute on function private_own_active_persona(uuid) from authenticated, public;
revoke execute on function private_assert_admin() from authenticated, public;

-- ============================================================
-- SECTION B — Lock record_agent_action to the service role (T1#1).
-- The agent now runs in a Supabase Edge Function holding the service key.
-- Authenticated users can no longer write/collapse/flag directly. The Edge
-- Function authenticates via a shared secret header and writes as service_role.
-- ============================================================

revoke execute on function record_agent_action(uuid, uuid, text, text, text, uuid, text, jsonb)
  from authenticated, public;
-- service_role bypasses RLS and GRANT checks entirely (it's a BYPASSRLS
-- superuser-equivalent), so the explicit GRANT is belt-and-suspenders +
-- documentation of intent; the REVOKE above is what enforces the lockdown.
grant execute on function record_agent_action(uuid, uuid, text, text, text, uuid, text, jsonb)
  to service_role;

-- ============================================================
-- SECTION C — User-initiated reports (T1#2).
-- One report per root per target (deduped like votes — no ballot stuffing).
-- Reports are moderation-private: only the reporter and admins can see them.
-- ============================================================

create table public.reports (
  id                   uuid primary key default gen_random_uuid(),
  reporter_root_id     uuid not null references auth.users(id) on delete cascade,
  reporter_persona_id  uuid not null references public.personas(id) on delete cascade,
  room_id              uuid not null references public.rooms(id) on delete cascade,
  target_type          text not null check (target_type in ('post','comment')),
  target_id            uuid not null,
  category             text not null check (category in ('harassment','spam','off_topic','illegal','other')),
  reason               text not null default '' check (char_length(reason) <= 500),
  status               text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at           timestamptz not null default now(),
  reviewed_at          timestamptz,
  -- Dedup: one report per root per target.
  unique (reporter_root_id, target_type, target_id)
);

create index reports_status_idx on public.reports (status, created_at desc);
create index reports_room_idx on public.reports (room_id, created_at desc);

alter table public.reports enable row level security;
-- Reporters see their own reports (for "you already reported this" UI state).
create policy reports_own_select on public.reports
  for select using (reporter_root_id = auth.uid());
-- No insert/update/delete policies: all writes go through security-definer RPCs.

create or replace function create_report(
  p_persona uuid, p_target_type text, p_target_id uuid,
  p_category text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_root uuid;
  v_room uuid;
  v_id uuid;
begin
  v_root := private_own_active_persona(p_persona);
  if p_target_type not in ('post','comment') then
    raise exception 'Bad target type.';
  end if;
  if p_category not in ('harassment','spam','off_topic','illegal','other') then
    raise exception 'Bad category.';
  end if;

  if p_target_type = 'post' then
    select room_id into v_room from posts
     where id = p_target_id and status = 'active';
  else
    select room_id into v_room from comments
     where id = p_target_id and status = 'active';
  end if;
  if v_room is null then raise exception 'Target not found.'; end if;

  perform private_assert_not_room_banned(v_root, v_room);

  insert into reports (reporter_root_id, reporter_persona_id, room_id,
                       target_type, target_id, category, reason)
  values (v_root, p_persona, v_room, p_target_type, p_target_id, p_category, p_reason)
  on conflict (reporter_root_id, target_type, target_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'You have already reported this content.';
  end if;
  return v_id;
end $$;

-- Admin read of the report queue. p_status of null/empty = all open.
create or replace function admin_list_reports(p_status text default 'open')
returns table (
  id uuid, room_id uuid, room_slug text,
  reporter_handle text, reporter_persona_id uuid,
  target_type text, target_id text,
  category text, reason text, status text, created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  return query
    select r.id, r.room_id, rm.slug,
           p.handle, r.reporter_persona_id,
           r.target_type::text, r.target_id::text,
           r.category, r.reason, r.status, r.created_at
      from reports r
      join rooms rm on rm.id = r.room_id
      join personas p on p.id = r.reporter_persona_id
     where p_status is null or p_status = '' or r.status = p_status
     order by r.created_at desc
     limit 200;
end $$;

create or replace function admin_resolve_report(p_report uuid, p_disposition text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  if p_disposition not in ('reviewed','dismissed') then
    raise exception 'Bad disposition.';
  end if;
  update reports set status = p_disposition, reviewed_at = now()
   where id = p_report;
  if not found then raise exception 'Report not found.'; end if;
end $$;

-- ============================================================
-- SECTION D — Content deletion / erasure (T1#3).
-- Soft-delete: status='removed', body/title replaced with '[removed]'.
-- Keeps the row for thread integrity; lists filter on status='active'.
-- Karma already accrued is NOT clawed back (matches Reddit semantics).
-- ============================================================

create or replace function delete_post(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_root uuid; v_author_root uuid;
begin
  v_root := auth.uid();
  if v_root is null then raise exception 'Not authenticated.'; end if;
  select p2.root_user_id into v_author_root
    from posts p1 join personas p2 on p2.id = p1.author_persona_id
   where p1.id = p_post;
  if v_author_root is null then raise exception 'Post not found.'; end if;
  if v_author_root <> v_root then
    raise exception 'You can only delete your own posts.';
  end if;
  update posts
     set status = 'removed', body = '[removed]', title = '[removed]'
   where id = p_post;
  -- Remove the author's votes on this post (other users' votes/karma stay).
  delete from votes
   where target_type = 'post' and target_id = p_post and voter_root_id = v_root;
end $$;

create or replace function delete_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_root uuid; v_author_root uuid; v_post uuid;
begin
  v_root := auth.uid();
  if v_root is null then raise exception 'Not authenticated.'; end if;
  select p2.root_user_id, c1.post_id into v_author_root, v_post
    from comments c1 join personas p2 on p2.id = c1.author_persona_id
   where c1.id = p_comment;
  if v_author_root is null then raise exception 'Comment not found.'; end if;
  if v_author_root <> v_root then
    raise exception 'You can only delete your own comments.';
  end if;
  update comments
     set status = 'removed', body = '[removed]', collapsed = false, collapse_reason = null
   where id = p_comment;
  update posts set comment_count = greatest(0, comment_count - 1) where id = v_post;
  delete from votes
   where target_type = 'comment' and target_id = p_comment and voter_root_id = v_root;
end $$;

-- Moderator removal of any content (founder-or-admin scoped, matching
-- ban_persona_from_room / resolve_flag).
create or replace function admin_remove_post(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_room uuid;
begin
  select room_id into v_room from posts where id = p_post;
  if v_room is null then raise exception 'Post not found.'; end if;
  if not exists (select 1 from rooms where id = v_room and created_by_root = auth.uid())
     and not exists (select 1 from platform_admins where root_user_id = auth.uid()) then
    raise exception 'Only the Room founder or a platform admin can remove content.';
  end if;
  update posts set status = 'removed', body = '[removed]', title = '[removed]'
   where id = p_post;
end $$;

create or replace function admin_remove_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_post uuid; v_room uuid;
begin
  select post_id, room_id into v_post, v_room from comments where id = p_comment;
  if v_post is null then raise exception 'Comment not found.'; end if;
  if not exists (select 1 from rooms where id = v_room and created_by_root = auth.uid())
     and not exists (select 1 from platform_admins where root_user_id = auth.uid()) then
    raise exception 'Only the Room founder or a platform admin can remove content.';
  end if;
  update comments
     set status = 'removed', body = '[removed]', collapsed = false, collapse_reason = null
   where id = p_comment;
  update posts set comment_count = greatest(0, comment_count - 1) where id = v_post;
end $$;

-- ============================================================
-- SECTION E — Override-loop fixes (T2#5, T2#6).
-- Redefine cast_override_vote:
--   #5  block self-override (you can't vote on actions against your own content)
--   #6  symmetric learning step (was 4x faster desensitizing; now neutral-drift)
-- Signature is unchanged: (p_persona uuid, p_action uuid, p_vote text) returns text.
-- ============================================================

create or replace function cast_override_vote(
  p_persona uuid, p_action uuid, p_vote text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_root uuid;
  v_act agent_actions%rowtype;
  v_quorum int;
  v_target_root uuid;   -- T2#5: author of the targeted content
  v_lr real;
  v_dir real;
  v_col text;
  v_old real;
  v_new real;
begin
  v_root := private_own_active_persona(p_persona);
  if p_vote not in ('uphold','override') then raise exception 'Bad vote.'; end if;

  select * into v_act from agent_actions where id = p_action for update;
  if v_act.id is null then raise exception 'Action not found.'; end if;
  if v_act.status <> 'pending' then return v_act.status; end if;
  perform private_assert_not_room_banned(v_root, v_act.room_id);

  -- T2#5: the author of the targeted content cannot vote on actions against it.
  -- (Dogpile/thread nudges have no single author target, so they're exempt.)
  if v_act.target_type in ('post','comment') and v_act.target_id is not null then
    if v_act.target_type = 'post' then
      select p2.root_user_id into v_target_root
        from posts p1 join personas p2 on p2.id = p1.author_persona_id
       where p1.id = v_act.target_id;
    else
      select p2.root_user_id into v_target_root
        from comments c1 join personas p2 on p2.id = c1.author_persona_id
       where c1.id = v_act.target_id;
    end if;
    if v_target_root = v_root then
      raise exception 'You cannot vote on actions against your own content.';
    end if;
  end if;

  insert into override_votes (action_id, voter_root_id, voter_persona_id, vote)
  values (p_action, v_root, p_persona, p_vote)
  on conflict (action_id, voter_root_id) do update
    set vote = excluded.vote, voter_persona_id = excluded.voter_persona_id;

  select count(*) filter (where vote = 'uphold'),
         count(*) filter (where vote = 'override')
    into v_act.votes_uphold, v_act.votes_override
    from override_votes where action_id = p_action;

  update agent_actions
     set votes_uphold = v_act.votes_uphold, votes_override = v_act.votes_override
   where id = p_action;

  select coalesce((agent_config->>'quorum')::int, 1) into v_quorum
    from rooms where id = v_act.room_id;

  if v_act.votes_uphold + v_act.votes_override < v_quorum
     or v_act.votes_uphold = v_act.votes_override then
    return 'pending';
  end if;

  -- Resolve.
  if v_act.votes_override > v_act.votes_uphold then
    update agent_actions set status = 'overridden', resolved_at = now(),
           review_status = case when review_status = 'open' then 'dismissed' else review_status end
     where id = p_action;
    if v_act.action_type = 'collapse' and v_act.target_type = 'comment' then
      update comments set collapsed = false, collapse_reason = null where id = v_act.target_id;
    end if;
    v_dir := 1.0;   -- overridden: raise threshold (agent less sensitive)
  else
    update agent_actions set status = 'upheld', resolved_at = now() where id = p_action;
    v_dir := -1.0;  -- T2#6: upheld now lowers threshold symmetrically (was -0.25)
  end if;

  -- T2#6: learning step is now symmetric (±lr, ×10 for dogpile since its
  -- param scale differs). Clamped to the same bounds as before.
  select learning_rate into v_lr from agent_calibration where room_id = v_act.room_id;
  v_col := v_act.trigger_param;

  execute format(
    'update agent_calibration set %I = greatest(0.20, least(%s, %I + $1)), updated_at = now()
      where room_id = $2 returning %I',
    v_col, case when v_col = 'dogpile_count' then '12.0' else '0.98' end, v_col, v_col)
  using v_dir * v_lr * (case when v_col = 'dogpile_count' then 10 else 1 end), v_act.room_id
  into v_new;

  update agent_calibration
     set history = history || jsonb_build_object(
       'at', now(), 'action_id', p_action, 'param', v_col,
       'outcome', case when v_dir > 0 then 'overridden' else 'upheld' end,
       'new_value', v_new)
   where room_id = v_act.room_id;

  return case when v_dir > 0 then 'overridden' else 'upheld' end;
end $$;

-- ============================================================
-- SECTION F — Notifications (T3#11).
-- Owner-readable; written by security-definer side effects inside
-- create_comment, record_agent_action, and ban_persona_from_room.
-- ============================================================

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  root_user_id  uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in
                  ('reply','collapse','agent_flag','ban','report_resolved')),
  actor_persona_id uuid references public.personas(id) on delete set null,
  room_id       uuid references public.rooms(id) on delete cascade,
  post_id       uuid references public.posts(id) on delete cascade,
  comment_id    uuid references public.comments(id) on delete cascade,
  payload       jsonb not null default '{}'::jsonb,
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);

create index notifications_root_idx on public.notifications (root_user_id, created_at desc);
create index notifications_unread_idx on public.notifications (root_user_id, created_at desc)
  where not read;

alter table public.notifications enable row level security;
create policy notifications_own_select on public.notifications
  for select using (root_user_id = auth.uid());
-- No insert/update/delete policies: writes go through security-definer RPCs.

-- Inline insert helper (private; called from other security-definer functions).
create or replace function private_notify(
  p_root uuid, p_type text, p_actor uuid, p_room uuid, p_post uuid,
  p_comment uuid, p_payload jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Never notify yourself.
  if p_root is null or p_root = auth.uid() then return; end if;
  insert into notifications (root_user_id, type, actor_persona_id, room_id, post_id, comment_id, payload)
  values (p_root, p_type, p_actor, p_room, p_post, p_comment, coalesce(p_payload, '{}'::jsonb));
end $$;
revoke execute on function private_notify(uuid, text, uuid, uuid, uuid, uuid, jsonb) from authenticated, public;

-- Mark all of the caller's notifications read.
create or replace function mark_notifications_read()
returns void language plpgsql security definer set search_path = public as $$
declare v_root uuid := auth.uid();
begin
  if v_root is null then raise exception 'Not authenticated.'; end if;
  update notifications set read = true where root_user_id = v_root and read = false;
end $$;

-- Redefine create_comment to fire a reply notification to the parent author
-- (or the post author for top-level comments). Signature unchanged.
create or replace function create_comment(
  p_persona uuid, p_post uuid, p_body text, p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_root uuid; v_room uuid; v_id uuid;
  v_parent_author uuid; v_post_author uuid;
begin
  v_root := private_own_active_persona(p_persona);
  select room_id into v_room from posts where id = p_post and status = 'active';
  if v_room is null then raise exception 'Post not found.'; end if;
  perform private_assert_not_room_banned(v_root, v_room);

  insert into comments (post_id, room_id, parent_comment_id, author_persona_id, body)
  values (p_post, v_room, p_parent, p_persona, p_body)
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

-- Redefine record_agent_action to fire a notification when the agent collapses
-- or flags a comment/post (the author deserves to know). Signature unchanged.
create or replace function record_agent_action(
  p_room uuid, p_post uuid, p_action text, p_trigger text,
  p_target_type text, p_target uuid, p_reason text, p_metrics jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_author_root uuid;
  v_notif_type text;
begin
  -- Caller must be the service role (the Edge Function). auth.uid() is null
  -- for service-role calls; the EXECUTE grant (service_role only) is the
  -- real gate, so we don't re-check auth.uid() here.
  insert into agent_actions
    (room_id, post_id, action_type, trigger_param, target_type, target_id, reason, metrics, review_status)
  values
    (p_room, p_post, p_action, p_trigger, p_target_type, p_target, p_reason, p_metrics,
     case when p_action = 'flag' then 'open' end)
  returning id into v_id;

  if p_action = 'collapse' and p_target_type = 'comment' then
    update comments set collapsed = true, collapse_reason = p_reason where id = p_target;
  end if;

  -- Notify the author of the targeted content on collapse/flag.
  if p_action in ('collapse','flag') and p_target_type in ('post','comment') and p_target is not null then
    if p_target_type = 'post' then
      select p2.root_user_id into v_author_root
        from posts p1 join personas p2 on p2.id = p1.author_persona_id
       where p1.id = p_target;
    else
      select p2.root_user_id into v_author_root
        from comments c1 join personas p2 on p2.id = c1.author_persona_id
       where c1.id = p_target;
    end if;
    v_notif_type := case when p_action = 'collapse' then 'collapse' else 'agent_flag' end;
    perform private_notify(v_author_root, v_notif_type, null, p_room, p_post, p_target,
                           jsonb_build_object('action_id', v_id, 'reason', p_reason));
  end if;

  return v_id;
end $$;

-- Redefine ban_persona_from_room to notify the banned root. Signature unchanged.
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
  perform private_notify(v_target_root, 'ban', null, p_room, null, null,
                         jsonb_build_object('persona_id', p_persona, 'reason', p_reason));
end $$;

-- ============================================================
-- SECTION G — Admin room management (T3#9).
-- Soft-remove (removed_at) preserves history; queries filter it out.
-- ============================================================

alter table public.rooms add column removed_at timestamptz;

create or replace function admin_rename_room(p_room uuid, p_slug text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  if p_slug !~ '^[a-z0-9-]{2,32}$' then
    raise exception 'Invalid slug (use 2-32 of a-z, 0-9, -).';
  end if;
  if char_length(p_name) < 1 or char_length(p_name) > 64 then
    raise exception 'Name must be 1-64 characters.';
  end if;
  update rooms set slug = lower(p_slug), name = p_name where id = p_room;
  if not found then raise exception 'Room not found.'; end if;
end $$;

create or replace function admin_remove_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_assert_admin();
  update rooms set removed_at = now() where id = p_room;
  if not found then raise exception 'Room not found.'; end if;
end $$;

-- ============================================================
-- SECTION H — Admin stats + agent activity rollup (T2#8).
-- ============================================================

create or replace function admin_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform private_assert_admin();
  select jsonb_build_object(
    'roots', (select count(*) from auth.users),
    'personas_active', (select count(*) from personas where status = 'active'),
    'personas_retired', (select count(*) from personas where status = 'retired'),
    'rooms', (select count(*) from rooms where removed_at is null),
    'posts', (select count(*) from posts),
    'comments', (select count(*) from comments),
    'open_flags', (select count(*) from agent_actions where action_type = 'flag' and review_status = 'open'),
    'pending_votes', (select count(*) from agent_actions where status = 'pending'),
    'open_reports', (select count(*) from reports where status = 'open'),
    'room_bans', (select count(*) from room_bans),
    'platform_bans', (select count(*) from platform_bans)
  ) into v;
  return v;
end $$;

create or replace function admin_agent_activity(p_hours int default 24)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform private_assert_admin();
  select jsonb_build_object(
    'window_hours', p_hours,
    'total', (select count(*) from agent_actions
               where created_at > now() - (p_hours || ' hours')::interval),
    'by_action', coalesce((
      select jsonb_object_agg(action_type, cnt) from (
        select action_type, count(*) as cnt from agent_actions
         where created_at > now() - (p_hours || ' hours')::interval
         group by action_type) s), '{}'::jsonb),
    'by_trigger', coalesce((
      select jsonb_object_agg(trigger_param, cnt) from (
        select trigger_param, count(*) as cnt from agent_actions
         where created_at > now() - (p_hours || ' hours')::interval
         group by trigger_param) s), '{}'::jsonb),
    'overrides', (select count(*) from agent_actions
                   where status <> 'pending'
                     and resolved_at > now() - (p_hours || ' hours')::interval)
  ) into v;
  return v;
end $$;

-- ============================================================
-- SECTION I — Default privileges for future functions.
-- Reaffirm: anon gets nothing, public gets nothing, authenticated gets
-- everything EXCEPT the private_* helpers (handled above explicitly).
-- ============================================================

alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated;
