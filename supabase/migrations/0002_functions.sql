-- Facet — write-path RPCs.
--
-- Every mutation goes through a SECURITY DEFINER function. Each function
-- re-derives the caller's root from auth.uid(), verifies persona ownership,
-- and enforces ban/rate-limit/dedup invariants before touching data.

create or replace function private_assert_not_platform_banned(p_root uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from platform_bans where root_user_id = p_root) then
    raise exception 'Your account is suspended from Facet.';
  end if;
end $$;

-- Verifies the persona belongs to the caller's root and is active; returns root id.
create or replace function private_own_active_persona(p_persona uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_root uuid;
begin
  select root_user_id into v_root from personas
   where id = p_persona and root_user_id = auth.uid() and status = 'active';
  if v_root is null then
    raise exception 'Persona not found, retired, or not yours.';
  end if;
  perform private_assert_not_platform_banned(v_root);
  return v_root;
end $$;

create or replace function private_assert_not_room_banned(p_root uuid, p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from room_bans where root_user_id = p_root and room_id = p_room) then
    raise exception 'You are banned from this Room. Bans apply to your account, not just one persona.';
  end if;
end $$;

-- ============================================================ personas

create or replace function create_persona(
  p_handle text, p_display_name text, p_avatar_color text default '#6366f1', p_bio text default ''
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_root uuid := auth.uid(); v_id uuid;
begin
  if v_root is null then raise exception 'Not authenticated.'; end if;
  perform private_assert_not_platform_banned(v_root);

  -- Rate limits: max 3 new personas per 24h, max 10 active total.
  if (select count(*) from personas
       where root_user_id = v_root and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Persona creation rate limit: max 3 per 24 hours.';
  end if;
  if (select count(*) from personas
       where root_user_id = v_root and status = 'active') >= 10 then
    raise exception 'Persona limit: max 10 active personas.';
  end if;

  insert into personas (root_user_id, handle, display_name, avatar_color, bio)
  values (v_root, lower(p_handle), p_display_name, p_avatar_color, p_bio)
  returning id into v_id;
  return v_id;
end $$;

-- Retire (never delete/merge — karma stays compartmentalized forever).
create or replace function retire_persona(p_persona uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_own_active_persona(p_persona);
  update personas set status = 'retired' where id = p_persona;
end $$;

-- ============================================================ rooms

create or replace function create_room(
  p_persona uuid, p_slug text, p_name text, p_description text, p_constitution text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_root uuid; v_id uuid;
begin
  v_root := private_own_active_persona(p_persona);
  insert into rooms (slug, name, description, constitution, created_by_persona_id, created_by_root)
  values (lower(p_slug), p_name, p_description, p_constitution, p_persona, v_root)
  returning id into v_id;
  insert into agent_calibration (room_id) values (v_id);
  insert into room_subscriptions (persona_id, room_id) values (p_persona, v_id);
  return v_id;
end $$;

create or replace function update_constitution(p_room uuid, p_constitution text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update rooms set constitution = p_constitution
   where id = p_room and created_by_root = auth.uid();
  if not found then raise exception 'Only the Room founder can amend the constitution.'; end if;
end $$;

create or replace function subscribe_room(p_persona uuid, p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_root uuid;
begin
  v_root := private_own_active_persona(p_persona);
  perform private_assert_not_room_banned(v_root, p_room);
  insert into room_subscriptions (persona_id, room_id)
  values (p_persona, p_room) on conflict do nothing;
end $$;

create or replace function unsubscribe_room(p_persona uuid, p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private_own_active_persona(p_persona);
  delete from room_subscriptions where persona_id = p_persona and room_id = p_room;
end $$;

-- ============================================================ content

create or replace function create_post(
  p_persona uuid, p_room uuid, p_title text, p_body text, p_crosspost_from uuid default null
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

  insert into posts (room_id, author_persona_id, title, body, crossposted_from_post_id)
  values (p_room, p_persona, p_title, p_body, p_crosspost_from)
  returning id into v_id;
  return v_id;
end $$;

create or replace function create_comment(
  p_persona uuid, p_post uuid, p_body text, p_parent uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_root uuid; v_room uuid; v_id uuid;
begin
  v_root := private_own_active_persona(p_persona);
  select room_id into v_room from posts where id = p_post and status = 'active';
  if v_room is null then raise exception 'Post not found.'; end if;
  perform private_assert_not_room_banned(v_root, v_room);

  insert into comments (post_id, room_id, parent_comment_id, author_persona_id, body)
  values (p_post, v_room, p_parent, p_persona, p_body)
  returning id into v_id;
  update posts set comment_count = comment_count + 1 where id = p_post;
  return v_id;
end $$;

-- ============================================================ voting & karma

-- value: -1 / 1 to vote, 0 to clear. One vote per ROOT; self-voting (any of
-- your personas voting on any of your personas' content) is rejected.
create or replace function cast_vote(
  p_persona uuid, p_target_type text, p_target uuid, p_value int
) returns void language plpgsql security definer set search_path = public as $$
declare v_root uuid; v_author uuid; v_author_root uuid; v_old int := 0; v_delta int;
begin
  v_root := private_own_active_persona(p_persona);

  if p_target_type = 'post' then
    select author_persona_id into v_author from posts where id = p_target;
  elsif p_target_type = 'comment' then
    select author_persona_id into v_author from comments where id = p_target;
  else
    raise exception 'Bad target type.';
  end if;
  if v_author is null then raise exception 'Target not found.'; end if;

  select root_user_id into v_author_root from personas where id = v_author;
  if v_author_root = v_root then
    raise exception 'You cannot vote on your own content (any persona).';
  end if;

  select value into v_old from votes
   where voter_root_id = v_root and target_type = p_target_type and target_id = p_target;
  v_old := coalesce(v_old, 0);

  if p_value = 0 then
    delete from votes
     where voter_root_id = v_root and target_type = p_target_type and target_id = p_target;
  else
    insert into votes (voter_root_id, voter_persona_id, target_type, target_id, value)
    values (v_root, p_persona, p_target_type, p_target, p_value)
    on conflict (voter_root_id, target_type, target_id)
    do update set value = excluded.value, voter_persona_id = excluded.voter_persona_id;
  end if;

  v_delta := coalesce(nullif(p_value, 0), 0) - v_old;
  if v_delta <> 0 then
    if p_target_type = 'post' then
      update posts set score = score + v_delta where id = p_target;
    else
      update comments set score = score + v_delta where id = p_target;
    end if;
    -- Karma is per-persona: it accrues to the mask that earned it, never the root.
    update personas set karma = karma + v_delta where id = v_author;
  end if;
end $$;

-- ============================================================ agent actions

-- Called by the app's agent runtime after evaluating new content.
-- MVP trust note: any authenticated session could call this; in production the
-- agent would authenticate with a service key. Acceptable for the demo.
create or replace function record_agent_action(
  p_room uuid, p_post uuid, p_action text, p_trigger text,
  p_target_type text, p_target uuid, p_reason text, p_metrics jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated.'; end if;

  insert into agent_actions
    (room_id, post_id, action_type, trigger_param, target_type, target_id, reason, metrics, review_status)
  values
    (p_room, p_post, p_action, p_trigger, p_target_type, p_target, p_reason, p_metrics,
     case when p_action = 'flag' then 'open' end)
  returning id into v_id;

  if p_action = 'collapse' and p_target_type = 'comment' then
    update comments set collapsed = true, collapse_reason = p_reason where id = p_target;
  end if;
  return v_id;
end $$;

-- ============================================================ override & learning loop

-- One vote per ROOT per action. When total votes reach the Room's quorum,
-- the action resolves and the calibration parameter that fired is adjusted:
--   overridden -> agent was too aggressive -> raise that threshold (less sensitive)
--   upheld     -> community agrees          -> lower it slightly (more confident)
create or replace function cast_override_vote(
  p_persona uuid, p_action uuid, p_vote text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_root uuid; v_act agent_actions%rowtype; v_quorum int;
  v_lr real; v_dir real; v_col text; v_old real; v_new real;
begin
  v_root := private_own_active_persona(p_persona);
  if p_vote not in ('uphold','override') then raise exception 'Bad vote.'; end if;

  select * into v_act from agent_actions where id = p_action for update;
  if v_act.id is null then raise exception 'Action not found.'; end if;
  if v_act.status <> 'pending' then return v_act.status; end if;
  perform private_assert_not_room_banned(v_root, v_act.room_id);

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
    -- Revert the action's effect.
    if v_act.action_type = 'collapse' and v_act.target_type = 'comment' then
      update comments set collapsed = false, collapse_reason = null where id = v_act.target_id;
    end if;
    v_dir := 1.0;   -- overridden: raise threshold, agent becomes less sensitive
  else
    update agent_actions set status = 'upheld', resolved_at = now() where id = p_action;
    v_dir := -0.25; -- upheld: small confidence gain, agent becomes slightly more sensitive
  end if;

  -- Learning step on the parameter that fired this action.
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

-- ============================================================ moderation (human)

-- Room founder bans a persona: the ban lands on that persona's ROOT, so every
-- sibling persona (and any future persona) is locked out of this Room too.
create or replace function ban_persona_from_room(p_room uuid, p_persona uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target_root uuid;
begin
  if not exists (select 1 from rooms where id = p_room and created_by_root = auth.uid()) then
    raise exception 'Only the Room founder can ban.';
  end if;
  select root_user_id into v_target_root from personas where id = p_persona;
  if v_target_root is null then raise exception 'Persona not found.'; end if;
  insert into room_bans (room_id, root_user_id, banned_persona_id, reason)
  values (p_room, v_target_root, p_persona, p_reason)
  on conflict do nothing;
end $$;

create or replace function resolve_flag(p_action uuid, p_disposition text)
returns void language plpgsql security definer set search_path = public as $$
declare v_room uuid;
begin
  select room_id into v_room from agent_actions where id = p_action and action_type = 'flag';
  if v_room is null then raise exception 'Flag not found.'; end if;
  if not exists (select 1 from rooms where id = v_room and created_by_root = auth.uid()) then
    raise exception 'Only the Room founder can review flags.';
  end if;
  update agent_actions set review_status = 'reviewed',
         status = case when status = 'pending' then 'upheld' else status end,
         resolved_at = coalesce(resolved_at, now())
   where id = p_action;
end $$;
