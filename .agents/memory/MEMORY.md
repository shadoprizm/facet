# Memory — Facet Social

## About the project
Facet (facet.social) — a Reddit-like forum with two core ideas:
1. **Contextual identity trees.** One verified *root* (`auth.users`); user acts through *personas* (masks). Roots are invisible to other users but known to the platform (for abuse enforcement). Personas can be retired but never deleted/merged.
2. **Agent-moderated communities (Rooms).** Each Room has an autonomous AI Agent Moderator governed by a community-written **constitution**. Agent nudges/collapses/escalates (never bans). Every action goes to a community vote; the agent **recalibrates from outcomes**.

## Stack
- **Next.js 16** App Router, React 19, server actions. **Note: AGENTS.md warns this is NOT the Next.js from training data — read `node_modules/next/dist/docs/` before writing Next code.** Proxy (formerly middleware) is `src/proxy.ts`.
- **Supabase** (Postgres 17, RLS, email/password + magic link). Cookie-bound per-request client in `src/lib/supabase/server.ts`.
- **Local deterministic TS agent engine** (lexicon + hashed BoW vectors) — zero API calls. `text.ts` exposes `textVector`/`cosine` as the seam to swap in a real embedding model later.
- Tailwind v4 + small CSS design system (`globals.css`). Dark, minimal.
- Deploys to Vercel (project `facet`, team `shadoprizms-projects`); `facet.social` aliased to prod.

## Decisions
- [2026-07-03] All writes go through `SECURITY DEFINER` Postgres RPCs that re-derive caller's root from `auth.uid()` — client never states who it is.
- [2026-07-03] Public persona reads go ONLY through `personas_public` view (no `root_user_id` column). Raw `personas` rows are RLS-restricted to owning root.
- [2026-07-03] One vote per **root** (not per persona); self-voting across personas is blocked. Bans land on root. Rate limits: 3 personas/24h, 10 active max.
- [2026-07-03] Admin backend is the deliberate root-visibility exception (`admin_lookup_persona`), gated by `platform_admins` table + `is_platform_admin()` RPC, re-checked server-side on every page/action.
- [2026-07-03] Trust boundary (MVP): `record_agent_action` is callable by any authenticated session because the agent runs in-request. Acceptable for demo; production would use a service key / Edge Function.
- [2026-07-03] Security-definer views (`personas_public`, `room_subscriber_counts`) are intentionally flagged by Supabase linter — they are the hiding mechanism.

## Architecture map
- `src/proxy.ts` — Next 16 proxy: session refresh + login gate.
- `src/lib/`
  - `supabase/server.ts` — per-request client.
  - `persona.ts` — active-persona cookie resolution (`facet_persona` cookie, falls back to first active).
  - `admin.ts` — `isPlatformAdmin()` / `requireAdmin()`.
  - `actions.ts` — ALL user-facing server actions (auth, personas, rooms, content, votes, avatars) → RPCs. Uses `fail()` → redirect-with-error and `revalidatePath`.
  - `admin-actions.ts` — admin-only server actions.
  - `data.ts` — `fetchPersonaMap` (via `personas_public`) + `myPersonaIds`.
  - `agent/` — `lexicon.ts` (weighted hostility dict), `text.ts` (normalize/tokenize/hashed BoW vectors/cosine/driftDistance), `constitution.ts` (parses `agent.strictness` + `agent.forbid` directives), `engine.ts` (pure `analyzeContent`/`decide`/`detectDogpile`), `run.ts` (in-request runtime).
  - `types.ts` — TS types mirroring DB schema.
- `src/app/` — routes: `/`, `/login`, `/me`, `/p/[handle]`, `/r/[slug]`, `/r/[slug]/submit`, `/r/[slug]/agent`, `/post/[id]`, `/rooms/new`, `/admin` (+ `/admin/flags|bans|rooms|admins`), `/auth/confirm`.
- `supabase/migrations/` — `0001_init` (schema/RLS/views), `0002_functions` (write RPCs + learning loop), `0003_harden_rpc_grants`, `0004_avatars_and_admin` (Storage buckets, admin RPCs), `0005_fix_grants` (revoke PUBLIC execute, drop unneeded bucket-list policies). `seed.sql` has demo data.
- `scripts/agent-sanity.ts` — engine sanity harness (`npx tsx`).

## Agent engine mechanics
- **Heat** = weighted lexicon sum → `1 - exp(-sum)`. Boosted ×1.35 if directed ("you…"), +0.12 caps>40%, +0.08 for ≥3 exclaims. Scaled by `strictnessMultiplier` (relaxed 0.8 / normal 1.0 / strict 1.25). `FLAG_IMMEDIATE` set (currently just "kys") escalates straight to flag.
- **Decide** order: flag (immediate or heat≥`heat_flag`) > collapse (comments only, heat≥`heat_collapse`) > forbid-nudge > heat-nudge > drift-nudge.
- **Drift** = `1 - cosine(hashedBoW(comment), hashedBoW(post+values)))`; only checked for comments ≥12 content words; default threshold 0.97 (very conservative).
- **Dogpile** = N distinct hostile (heat≥0.35) personas replying to one author within 30 min → thread-level nudge; deduped to ≤1/hour/post.
- **Learning**: `cast_override_vote` resolves at quorum (default 1 for easy demo). Overridden → raises the fired threshold (agent less sensitive, `+lr`); upheld → lowers it slightly (`-0.25*lr`). Clamped to [0.20, 0.98] (or [≤12] for dogpile). Append-only `history` jsonb. Calibration shown on `/r/[slug]/agent`.

## Open questions
- 7 pre-existing lint errors in `src/app/r/[slug]/agent/page.tsx` and `r/[slug]/submit/page.tsx` (react/no-unescaped-entities — apostrophes in JSX text). NOT mine; were there before this session. Easy `--fix`.

## Pre-launch hardening (2026-07-04 session)
- Migrations `0006_hardening.sql` + `0007_fix_notification_fk.sql` applied to dev (`dpbpqutbqmrjmhsmjkpc`). Run `npm test` (vitest, 38 tests) + `npx tsx scripts/smoke-0006.ts` (26 RPC smoke tests) to verify.
- **Agent moved to Edge Function** `supabase/functions/evaluate-content`. Old `src/lib/agent/run.ts` deleted; replaced by `src/lib/agent/invoke.ts` (fetch wrapper). Engine vendored to `supabase/functions/_shared/agent/` — KEEP IN SYNC with `src/lib/agent/` (app copy authoritative). `record_agent_action` EXECUTE revoked from authenticated, granted to service_role only.
- Env vars now required: `SUPABASE_SERVICE_ROLE_KEY` (server-only) + `AGENT_INVOCATION_SECRET` (shared secret for the function). Both in `.env.local`; need adding to Vercel for prod.
- Dev shared secret is `dev-local-not-secret` — MUST be rotated for prod.
- `cast_override_vote` redefined: author can't vote on actions against own content (T2#5); learning step is now symmetric ±lr (was 4× faster desensitizing — T2#6).
- New tables: `reports`, `notifications`. New RPCs: `create_report`, `admin_list_reports`, `admin_resolve_report`, `delete_post`/`delete_comment` (+ admin variants), `admin_rename_room`, `admin_remove_room`, `admin_agent_activity`, `mark_notifications_read`, `private_notify`. Soft-delete: posts/comments set `status='removed'`, body='[removed]'. Rooms get `removed_at` column.
- `tsconfig.json` excludes `supabase/functions` (Deno) and `scripts` (dev harnesses) from app typecheck.
- CI: `.github/workflows/ci.yml` runs lint+tsc+vitest + applies migrations to ephemeral local DB.
