-- Lock down RPC execution:
--  * anon can execute nothing (every write requires a signed-in root anyway)
--  * the private_* helpers are internal plumbing — not callable via the API
--
-- Note: personas_public and room_subscriber_counts are intentionally
-- SECURITY DEFINER views — that is the mechanism that hides root_user_id
-- while the base table's RLS restricts raw rows to their owner. They expose
-- only safe columns and are granted to `authenticated` only.

revoke execute on all functions in schema public from anon;

revoke execute on function public.private_assert_not_platform_banned(uuid) from authenticated, anon, public;
revoke execute on function public.private_assert_not_room_banned(uuid, uuid) from authenticated, anon, public;
revoke execute on function public.private_own_active_persona(uuid) from authenticated, anon, public;

-- Future functions: don't auto-grant to anon.
alter default privileges in schema public revoke execute on functions from anon;
