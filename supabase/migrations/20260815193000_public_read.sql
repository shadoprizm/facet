-- Open the reading surface to logged-out visitors and search crawlers.
--
-- Facet launched fully gated: every Room, post, and profile 307'd to /login,
-- including for Googlebot, so the only indexable URLs were the landing pages.
-- That capped organic discovery at zero. This migration makes reading public
-- while leaving every write path exactly as it was.
--
-- What does NOT change:
--   * Writes still go only through audited SECURITY DEFINER RPCs, which all
--     require an authenticated root. anon receives SELECT and nothing else.
--   * Root identity stays private. anon never touches personas.root_user_id
--     or rooms.created_by_root — reads go through the root-free projections,
--     and the base-table grants below are column-scoped to match.
--   * Ballots stay private. anon gets no privilege on votes, override_votes,
--     room_subscriptions, reports, notifications, bans, or platform_admins.
--
-- Public reads are deliberately NARROWER than authenticated reads: removed
-- Rooms and removed posts/comments stay invisible to anon, so moderated
-- content cannot be resurrected through a crawler.

-- ============================================================ row-level policies

-- RLS policies are permissive and OR together, so these sit alongside the
-- existing authenticated policies rather than replacing them.

create policy rooms_public_read on public.rooms
  for select to anon
  using (removed_at is null);

create policy posts_public_read on public.posts
  for select to anon
  using (
    status = 'active'
    and exists (
      select 1 from public.rooms r
      where r.id = posts.room_id and r.removed_at is null
    )
  );

create policy comments_public_read on public.comments
  for select to anon
  using (
    status = 'active'
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id and p.status = 'active'
    )
  );

-- Agent actions are shown publicly on purpose: "AI moderation you can audit"
-- is the product's central claim, and a visitor who cannot see the agent's
-- reasoning cannot evaluate it. Scoped to actions on still-visible posts.
create policy agent_actions_public_read on public.agent_actions
  for select to anon
  using (
    post_id is null
    or exists (
      select 1 from public.posts p
      where p.id = agent_actions.post_id and p.status = 'active'
    )
  );

-- ============================================================ table privileges

-- personas_public and room_subscriber_counts are SECURITY DEFINER views, so a
-- grant on the view is sufficient and the base tables stay unreachable.
grant select on public.personas_public to anon;
grant select on public.room_subscriber_counts to anon;

-- rooms_public is security_invoker, so anon needs column privileges on the
-- underlying table. created_by_root is deliberately absent from this list.
grant select on public.rooms_public to anon;
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
) on public.rooms to anon;

grant select on public.posts to anon;
grant select on public.comments to anon;
grant select on public.agent_actions to anon;
