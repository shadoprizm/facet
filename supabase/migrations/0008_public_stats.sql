-- Public, anonymous-safe aggregate counters for the landing page and the
-- daily marketing routine (/api/stats). Exposes only counts — never rows.

create or replace function public.public_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'members',  (select count(*) from auth.users),
    'personas', (select count(*) from public.personas),
    'rooms',    (select count(*) from public.rooms),
    'posts',    (select count(*) from public.posts where status = 'active'),
    'comments', (select count(*) from public.comments)
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
