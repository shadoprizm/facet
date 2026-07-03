-- Fix two issues surfaced by the security advisor after 0004:
--
-- 1. Postgres grants EXECUTE to the PUBLIC pseudo-role on every new function
--    by default. Revoking from `anon` directly (0003, 0004) doesn't remove
--    that PUBLIC-inherited grant — anon is still a member of PUBLIC. The fix
--    is to revoke from PUBLIC itself, then explicitly grant to authenticated,
--    and fix default privileges so future functions follow the same rule.
--
-- 2. Public-bucket objects don't need a SELECT RLS policy on storage.objects
--    for getPublicUrl() to work — public buckets are served through a CDN
--    path that bypasses RLS entirely. A SELECT policy only adds the ability
--    to list/enumerate bucket contents via the API, which nothing here needs.

revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated;

drop policy if exists persona_avatars_public_read on storage.objects;
drop policy if exists room_avatars_public_read on storage.objects;
