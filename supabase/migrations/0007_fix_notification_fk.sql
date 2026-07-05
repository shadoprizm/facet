-- Facet — fix notification FK violation in record_agent_action.
--
-- Bug surfaced by the post-launch smoke test: 0006's record_agent_action
-- always passed p_target as the p_comment argument to private_notify, even
-- when the target was a POST. The notifications.comment_id FK then rejected
-- the insert (post id not in comments), so every agent flag/collapse on a
-- post silently failed to record AND failed to notify.
--
-- Fix: route the target id to the correct notification slot (post_id vs
-- comment_id) based on p_target_type.

create or replace function record_agent_action(
  p_room uuid, p_post uuid, p_action text, p_trigger text,
  p_target_type text, p_target uuid, p_reason text, p_metrics jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_author_root uuid;
  v_notif_type text;
  v_notif_post uuid := null;
  v_notif_comment uuid := null;
begin
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
      v_notif_post := p_target;
    else
      select p2.root_user_id into v_author_root
        from comments c1 join personas p2 on p2.id = c1.author_persona_id
       where c1.id = p_target;
      v_notif_comment := p_target;
      v_notif_post := coalesce(p_post, null);
    end if;
    v_notif_type := case when p_action = 'collapse' then 'collapse' else 'agent_flag' end;
    perform private_notify(v_author_root, v_notif_type, null, p_room, v_notif_post, v_notif_comment,
                           jsonb_build_object('action_id', v_id, 'reason', p_reason));
  end if;

  return v_id;
end $$;
