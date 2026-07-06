-- Community seed engine: a content queue drained by pg_cron so seeded
-- personas post/comment/vote on an organic-looking schedule around the clock,
-- independent of any local machine. Queue rows are written by
-- scripts/seed-queue-load.ts; personas/rooms/backfill are created by
-- scripts/seed-bootstrap.ts. Seed roots all use @seed.facet.social emails so
-- they are identifiable and can be excluded/purged in one predicate.

create extension if not exists pg_cron;

-- ============================================================ queue

create table if not exists public.seed_queue (
  id                 bigint generated always as identity primary key,
  kind               text not null check (kind in ('post','comment','vote')),
  room_slug          text not null,
  author_handle      text not null,
  title              text,
  body               text,
  -- comment/vote targets: either another queue row (drip content that doesn't
  -- have a real id until published) or a concrete post/comment id (backfill).
  parent_queue_id    bigint references public.seed_queue(id),
  target_post_id     uuid,
  target_comment_id  uuid,
  vote_value         smallint check (vote_value in (-1, 1)),
  not_before         timestamptz not null,
  published_at       timestamptz,
  published_id       uuid,
  error              text,
  created_at         timestamptz not null default now()
);

create index if not exists seed_queue_due_idx
  on public.seed_queue (not_before)
  where published_at is null and error is null;

alter table public.seed_queue enable row level security;
revoke all on table public.seed_queue from anon, authenticated;

-- ============================================================ tick

-- Publishes due queue items. Content is timestamped at its scheduled
-- not_before (not the cron tick) so created_at doesn't cluster on the cron
-- cadence. Mirrors the bookkeeping of create_post/create_comment/cast_vote;
-- skips notifications and the moderation agent on purpose (seed-to-seed
-- traffic shouldn't pile up notifications or agent actions).
create or replace function public.seed_tick(p_batch int default 8)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_room uuid;
  v_persona uuid;
  v_root uuid;
  v_new_id uuid;
  v_target_post uuid;
  v_target_comment uuid;
  v_parent_kind text;
  v_parent_pub uuid;
  v_target_type text;
  v_target_id uuid;
  v_author_persona uuid;
  v_author_root uuid;
  n int := 0;
begin
  for r in
    select q.*
      from seed_queue q
     where q.published_at is null
       and q.error is null
       and q.not_before <= now()
       and (q.parent_queue_id is null or exists (
             select 1 from seed_queue p
              where p.id = q.parent_queue_id
                and p.published_at is not null
                and p.error is null))
     order by q.not_before
     limit p_batch
     for update skip locked
  loop
    begin
      select id into v_room
        from rooms where slug = r.room_slug and removed_at is null;
      select id, root_user_id into v_persona, v_root
        from personas where handle = r.author_handle and status = 'active';
      if v_room is null then raise exception 'room % not found', r.room_slug; end if;
      if v_persona is null then raise exception 'persona % not found', r.author_handle; end if;

      -- resolve queue-relative targets
      v_target_post := r.target_post_id;
      v_target_comment := r.target_comment_id;
      if r.parent_queue_id is not null then
        select kind, published_id into v_parent_kind, v_parent_pub
          from seed_queue where id = r.parent_queue_id;
        if v_parent_kind = 'post' then
          v_target_post := v_parent_pub;
        elsif v_parent_kind = 'comment' then
          v_target_comment := v_parent_pub;
        end if;
      end if;
      if v_target_comment is not null and v_target_post is null then
        select post_id into v_target_post from comments where id = v_target_comment;
      end if;

      if r.kind = 'post' then
        insert into posts (room_id, author_persona_id, title, body, created_at)
        values (v_room, v_persona, r.title, coalesce(r.body, ''), r.not_before)
        returning id into v_new_id;

      elsif r.kind = 'comment' then
        if v_target_post is null then raise exception 'comment has no target post'; end if;
        insert into comments (post_id, room_id, parent_comment_id, author_persona_id, body, created_at)
        values (v_target_post, v_room, v_target_comment, v_persona, r.body, r.not_before)
        returning id into v_new_id;
        update posts set comment_count = comment_count + 1 where id = v_target_post;

      elsif r.kind = 'vote' then
        if v_target_comment is not null then
          v_target_type := 'comment'; v_target_id := v_target_comment;
          select author_persona_id into v_author_persona from comments where id = v_target_id;
        elsif v_target_post is not null then
          v_target_type := 'post'; v_target_id := v_target_post;
          select author_persona_id into v_author_persona from posts where id = v_target_id;
        else
          raise exception 'vote has no target';
        end if;
        select root_user_id into v_author_root from personas where id = v_author_persona;

        -- same invariants as cast_vote: one vote per root, never on your own root
        if v_author_root is not null and v_author_root <> v_root and not exists (
             select 1 from votes
              where voter_root_id = v_root
                and target_type = v_target_type and target_id = v_target_id) then
          insert into votes (voter_root_id, voter_persona_id, target_type, target_id, value)
          values (v_root, v_persona, v_target_type, v_target_id, r.vote_value);
          if v_target_type = 'post' then
            update posts set score = score + r.vote_value where id = v_target_id;
          else
            update comments set score = score + r.vote_value where id = v_target_id;
          end if;
          update personas set karma = karma + r.vote_value where id = v_author_persona;
        end if;
        v_new_id := null;
      end if;

      update seed_queue
         set published_at = now(), published_id = v_new_id
       where id = r.id;
      n := n + 1;
    exception when others then
      update seed_queue set error = sqlerrm where id = r.id;
    end;
  end loop;
  return n;
end $fn$;

revoke all on function public.seed_tick(int) from public, anon, authenticated;

-- ============================================================ schedule

do $$
begin
  perform cron.unschedule('facet-seed-tick');
exception when others then
  null; -- not scheduled yet
end $$;

select cron.schedule('facet-seed-tick', '*/13 * * * *', 'select public.seed_tick()');

-- ============================================================ honest KPI

-- public_stats: the `members` counter feeds the 100-user launch goal, so seed
-- roots are excluded from it. Content counters stay inclusive (they count
-- rows that genuinely exist). seed_members is reported separately.
create or replace function public.public_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'members',      (select count(*) from auth.users where email not like '%@seed.facet.social'),
    'seed_members', (select count(*) from auth.users where email like '%@seed.facet.social'),
    'personas',     (select count(*) from public.personas),
    'rooms',        (select count(*) from public.rooms where removed_at is null),
    'posts',        (select count(*) from public.posts where status = 'active'),
    'comments',     (select count(*) from public.comments where status = 'active')
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
