-- Facet — initial schema
--
-- Database choice: PostgreSQL (Supabase). Rationale: the persona tree demands
-- relational integrity (root → personas → content → votes), root-identity
-- hiding maps cleanly onto RLS + security-definer views, and all abuse
-- invariants (root-scoped bans, one-root-one-vote, rate limits) are enforced
-- atomically in the database rather than trusted to app code.
--
-- Trust model:
--   * auth.users is the ROOT identity. It is never exposed to other users.
--   * All reads of persona data by others go through personas_public (no root column).
--   * All writes go through SECURITY DEFINER functions that re-derive the
--     caller's root from auth.uid() and enforce every invariant server-side.

-- ============================================================ personas

create table public.personas (
  id            uuid primary key default gen_random_uuid(),
  root_user_id  uuid not null references auth.users(id) on delete cascade,
  handle        text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name  text not null check (char_length(display_name) between 1 and 48),
  avatar_color  text not null default '#6366f1',
  bio           text not null default '' check (char_length(bio) <= 500),
  karma         integer not null default 0,
  status        text not null default 'active' check (status in ('active','retired')),
  created_at    timestamptz not null default now()
);

create index personas_root_idx on public.personas (root_user_id);

-- Public projection: everything EXCEPT root_user_id. Other users only ever see this.
create view public.personas_public
  with (security_invoker = false) as
  select id, handle, display_name, avatar_color, bio, karma, status, created_at
  from public.personas;

-- ============================================================ rooms

create table public.rooms (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]{2,32}$'),
  name                  text not null check (char_length(name) between 1 and 64),
  description           text not null default '',
  constitution          text not null default '',
  -- agent_config: community-tunable knobs (quorum for override votes, etc.)
  agent_config          jsonb not null default '{"quorum": 1, "vote_window_minutes": 1440}'::jsonb,
  created_by_persona_id uuid references public.personas(id),
  created_by_root       uuid not null references auth.users(id),
  created_at            timestamptz not null default now()
);

-- Per-room agent calibration. These parameters ARE the agent's learned state:
-- thresholds move when the community overrides or upholds its actions.
create table public.agent_calibration (
  room_id         uuid primary key references public.rooms(id) on delete cascade,
  heat_nudge      real not null default 0.55,  -- heat score that triggers a public nudge
  heat_collapse   real not null default 0.80,  -- heat score that collapses a comment
  heat_flag       real not null default 0.92,  -- heat score that escalates to human review
  drift_nudge     real not null default 0.97,  -- topic-drift distance that triggers a nudge
  dogpile_count   real not null default 3.0,   -- hostile replies to one persona before intervening
  learning_rate   real not null default 0.06,
  history         jsonb not null default '[]'::jsonb,  -- append-only adjustment log
  updated_at      timestamptz not null default now()
);

create table public.room_subscriptions (
  persona_id uuid not null references public.personas(id) on delete cascade,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (persona_id, room_id)
);

-- ============================================================ content

create table public.posts (
  id                       uuid primary key default gen_random_uuid(),
  room_id                  uuid not null references public.rooms(id) on delete cascade,
  author_persona_id        uuid not null references public.personas(id),
  title                    text not null check (char_length(title) between 1 and 200),
  body                     text not null default '' check (char_length(body) <= 20000),
  crossposted_from_post_id uuid references public.posts(id),
  score                    integer not null default 0,
  comment_count            integer not null default 0,
  status                   text not null default 'active' check (status in ('active','removed')),
  created_at               timestamptz not null default now()
);

create index posts_room_idx on public.posts (room_id, created_at desc);
create index posts_author_idx on public.posts (author_persona_id, created_at desc);

create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts(id) on delete cascade,
  room_id           uuid not null references public.rooms(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  author_persona_id uuid not null references public.personas(id),
  body              text not null check (char_length(body) between 1 and 10000),
  score             integer not null default 0,
  collapsed         boolean not null default false,
  collapse_reason   text,
  status            text not null default 'active' check (status in ('active','removed')),
  created_at        timestamptz not null default now()
);

create index comments_post_idx on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_persona_id, created_at desc);

-- One vote per ROOT per target (not per persona): a root with five personas
-- still gets exactly one vote, and can never vote on its own content.
create table public.votes (
  voter_root_id    uuid not null references auth.users(id) on delete cascade,
  voter_persona_id uuid not null references public.personas(id),
  target_type      text not null check (target_type in ('post','comment')),
  target_id        uuid not null,
  value            smallint not null check (value in (-1, 1)),
  created_at       timestamptz not null default now(),
  primary key (voter_root_id, target_type, target_id)
);

-- ============================================================ agent actions & override loop

create table public.agent_actions (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms(id) on delete cascade,
  post_id        uuid references public.posts(id) on delete cascade,
  action_type    text not null check (action_type in ('nudge','collapse','flag')),
  -- which calibration parameter fired; this is what learning adjusts on override
  trigger_param  text not null check (trigger_param in
                   ('heat_nudge','heat_collapse','heat_flag','drift_nudge','dogpile_count')),
  target_type    text not null check (target_type in ('post','comment','thread')),
  target_id      uuid,
  reason         text not null,
  metrics        jsonb not null default '{}'::jsonb,
  status         text not null default 'pending' check (status in ('pending','upheld','overridden')),
  review_status  text check (review_status in ('open','reviewed','dismissed')),  -- human mod queue (flags)
  votes_uphold   integer not null default 0,
  votes_override integer not null default 0,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create index agent_actions_room_idx on public.agent_actions (room_id, created_at desc);
create index agent_actions_post_idx on public.agent_actions (post_id, created_at);

-- One override vote per ROOT per action (multi-persona ballot stuffing is impossible).
create table public.override_votes (
  action_id        uuid not null references public.agent_actions(id) on delete cascade,
  voter_root_id    uuid not null references auth.users(id) on delete cascade,
  voter_persona_id uuid not null references public.personas(id),
  vote             text not null check (vote in ('uphold','override')),
  created_at       timestamptz not null default now(),
  primary key (action_id, voter_root_id)
);

-- ============================================================ bans (root-scoped enforcement)

-- Banning a persona in a room bans its ROOT: no sibling persona can post there,
-- and no new persona can be created to evade it. The root id never leaves the DB.
create table public.room_bans (
  room_id           uuid not null references public.rooms(id) on delete cascade,
  root_user_id      uuid not null references auth.users(id) on delete cascade,
  banned_persona_id uuid not null references public.personas(id),
  reason            text not null default '',
  created_at        timestamptz not null default now(),
  primary key (room_id, root_user_id)
);

create table public.platform_bans (
  root_user_id uuid primary key references auth.users(id) on delete cascade,
  reason       text not null default '',
  created_at   timestamptz not null default now()
);

-- ============================================================ RLS

alter table public.personas           enable row level security;
alter table public.rooms              enable row level security;
alter table public.agent_calibration  enable row level security;
alter table public.room_subscriptions enable row level security;
alter table public.posts              enable row level security;
alter table public.comments           enable row level security;
alter table public.votes              enable row level security;
alter table public.agent_actions      enable row level security;
alter table public.override_votes     enable row level security;
alter table public.room_bans          enable row level security;
alter table public.platform_bans      enable row level security;

-- personas: only the owning root may read the raw row (which contains root_user_id).
create policy personas_own_select on public.personas
  for select using (root_user_id = auth.uid());

grant select on public.personas_public to authenticated;

create policy rooms_read on public.rooms
  for select using (auth.role() = 'authenticated');

create policy calibration_read on public.agent_calibration
  for select using (auth.role() = 'authenticated');

-- subscriptions: readable only by the owning root (a persona's subscription list
-- is its own business; counts are exposed via room_subscriber_counts).
create policy subs_own_select on public.room_subscriptions
  for select using (
    persona_id in (select id from public.personas where root_user_id = auth.uid())
  );

create policy posts_read on public.posts
  for select using (auth.role() = 'authenticated');

create policy comments_read on public.comments
  for select using (auth.role() = 'authenticated');

create policy votes_own_select on public.votes
  for select using (voter_root_id = auth.uid());

create policy agent_actions_read on public.agent_actions
  for select using (auth.role() = 'authenticated');

create policy override_votes_own_select on public.override_votes
  for select using (voter_root_id = auth.uid());

-- room_bans / platform_bans: no select policies. Enforcement happens inside
-- security-definer functions; ban state is reported only as an error message.

create view public.room_subscriber_counts
  with (security_invoker = false) as
  select room_id, count(*)::int as subscribers
  from public.room_subscriptions group by room_id;

grant select on public.room_subscriber_counts to authenticated;
