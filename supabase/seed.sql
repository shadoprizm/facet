-- Demo seed for local evaluation.
-- Creates: root demo@facet.social (password: facet-demo-2026, pre-confirmed),
-- two personas under it, and a starter Room with a constitution.
-- Run against your Supabase project's SQL editor (or psql) once after migrations.

do $$
declare
  v_user uuid := gen_random_uuid();
  v_aurora uuid;
  v_badger uuid;
  v_room uuid;
  v_post uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'demo@facet.social', crypt('facet-demo-2026', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user,
    jsonb_build_object('sub', v_user::text, 'email', 'demo@facet.social', 'email_verified', true),
    'email', v_user::text, now(), now(), now()
  );

  insert into public.personas (root_user_id, handle, display_name, avatar_color, bio)
  values (v_user, 'aurora_polaris', 'Aurora', '#ec4899', 'Chasing lights and long trails.')
  returning id into v_aurora;

  insert into public.personas (root_user_id, handle, display_name, avatar_color, bio)
  values (v_user, 'grumpy_badger', 'Grumpy Badger', '#f59e0b', 'Here to disagree, politely-ish.')
  returning id into v_badger;

  insert into public.rooms (slug, name, description, constitution, created_by_persona_id, created_by_root)
  values (
    'trailtalk', 'Trail Talk', 'Hiking, backpacking, and the outdoors.',
    E'Be excellent to each other. Debate ideas, not people.\nStay on topic — trails, gear, and the outdoors.\nAssume good faith until proven otherwise.\n\nagent.strictness: normal\nagent.forbid: crypto',
    v_aurora, v_user
  ) returning id into v_room;

  insert into public.agent_calibration (room_id) values (v_room);
  insert into public.room_subscriptions (persona_id, room_id) values (v_aurora, v_room);

  insert into public.posts (room_id, author_persona_id, title, body)
  values (
    v_room, v_aurora,
    'Best fall loops in Gatineau Park?',
    'Looking for moderate loops with good lookout views for October. Wolf Trail is my current favourite — what else should be on the list?'
  ) returning id into v_post;
end $$;
