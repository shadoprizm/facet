# ◆ Facet

A Reddit-like forum platform built on two ideas:

1. **Contextual identity trees.** You have one verified *root* account, known only to the platform. In public you act through *personas* — separate masks, each with its own name, avatar, karma, subscriptions, and history. Nobody can link your personas to each other or to you. The platform can: bans land on the root.
2. **Agent-moderated communities.** Every community (a *Room*) is tended by an autonomous AI Agent Moderator governed by a community-written **constitution**. The agent nudges, collapses, or escalates — it never bans. Every action it takes is put to a community vote, and the agent **recalibrates from the outcomes**.

Demo target: `facet.social` (domain not yet attached; runs locally today).

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | **Next.js 16** (App Router, React 19, server actions) | One deployable, zero client state management for an MVP; deploys straight to Vercel |
| Database + Auth | **Supabase** (Postgres 17, RLS, email/password + magic link) | The persona tree is deeply relational; RLS + security-definer views are the natural mechanism for "root is enforceable but invisible"; magic-link auth out of the box |
| Agent engine | **Local, deterministic TypeScript** (lexicon heat scoring + hashed bag-of-words vectors) | Runs on every post/comment in microseconds with **zero API calls**; fully testable; the vector interface is a drop-in seam for a real embedding model later |
| Styling | Tailwind v4 + a small CSS design system | Minimal, responsive, dark |

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

Database setup (one-time, against a fresh Supabase project):

1. Apply `supabase/migrations/*.sql` in order (SQL editor, `psql`, or `supabase db push`).
2. Optionally run `supabase/seed.sql` — it creates a demo root
   (**demo@facet.social / facet-demo-2026**, pre-confirmed), two personas
   (*Aurora* and *Grumpy Badger*), and a starter Room (`r/trailtalk`).

Then sign in and try the loop: switch masks in the nav → comment something
hostile in a thread → watch the agent act → override it → check
`r/<room>/agent` to see the calibration move.

Sanity-check the moderation engine without a browser:

```bash
npx tsx scripts/agent-sanity.ts
```

## Architecture

```
src/
  proxy.ts                 Session refresh + login gate (Next 16 proxy)
  lib/
    supabase/server.ts     Per-request Supabase client (cookie-bound)
    persona.ts             Active-persona cookie resolution
    actions.ts             All server actions (forms + votes) → Postgres RPCs
    data.ts                personas_public batch reads
    agent/
      lexicon.ts           Hostility lexicon with calibrated weights
      text.ts              Tokenizer, hashed BoW vectors, cosine (the "embedding")
      constitution.ts      Parses constitution directives + values prose
      engine.ts            analyzeContent / decide / detectDogpile (pure functions)
      run.ts               Agent runtime: evaluates new posts/comments in-request
  app/                     Routes: /, /login, /me, /p/[handle], /r/[slug],
                           /r/[slug]/submit, /r/[slug]/agent, /post/[id]
supabase/
  migrations/0001_init.sql             Schema, RLS, views
  migrations/0002_functions.sql        All write-path RPCs (security definer)
  migrations/0003_harden_rpc_grants.sql
  seed.sql                             Demo data
```

### The identity tree

- `auth.users` **is** the root. It never appears in any API response.
- `personas.root_user_id` links a mask to its root. RLS on `personas` lets a
  root read only its **own** rows; everyone else reads through
  **`personas_public`**, a security-definer view that simply has no root
  column. That view is the *only* public read path for persona data.
- Karma lives on the persona and is updated transactionally with votes.
  Personas can be **retired** (frozen with their history) but never deleted
  or merged — karma is compartmentalized forever.
- Every write goes through a `SECURITY DEFINER` Postgres function that
  re-derives the caller's root from `auth.uid()` and re-verifies persona
  ownership. The client never states who it is; the database always checks.

### Abuse safeguards (all enforced in Postgres, not app code)

- **One root, one vote.** Content votes and override votes are unique per
  *root*, not per persona — five masks still cast one ballot, and you can
  never vote on any of your own personas' content.
- **Root-scoped bans.** Banning a persona in a Room writes the ban against
  its *root*. Every sibling persona — and any persona created later — is
  locked out of that Room. A platform ban kills all personas at once.
- **Rate limits.** Max 3 new personas per root per 24 h, max 10 active.
- **Cross-posting** between your own personas is allowed (and labelled),
  verified server-side to be same-root only.

### The Agent Moderator

Each Room's agent evaluates every new post and comment **in the request
path** — pure local math, no LLM API calls:

- **Heat** — a hostility score from a weighted lexicon, boosted for
  *directed* attacks ("you…"), ALL-CAPS, and exclamation storms, then scaled
  by the constitution's `agent.strictness`.
- **Topic drift** — cosine distance between hashed bag-of-words vectors of
  the comment vs. the post + the constitution's values prose. Only applied
  to comments with ≥ 12 content words, with a conservative default threshold
  (0.97): the crude-but-free vector model stays quiet unless a comment shares
  essentially no vocabulary with the thread. `text.ts` exposes
  `textVector`/`cosine` as the seam where a real embedding model
  (transformers.js MiniLM, Ollama, etc.) can be swapped in.
- **Dogpile detection** — N distinct personas piling hostile replies onto
  one member within 30 minutes triggers a thread-level nudge.
- **Constitution directives** — `agent.strictness: relaxed|normal|strict`
  and `agent.forbid: term, term` are machine-read; the rest of the
  constitution is prose that feeds drift detection and is quoted in nudges.

The agent's possible actions, in escalating order:

| Action | Effect |
|---|---|
| 🕊️ **nudge** | A public note in the thread ("this is running hot — cool down") |
| 🫧 **collapse** | Folds a comment behind an explanation (still readable on click) |
| 🚩 **flag** | Escalates to the human moderator queue on `/r/<room>/agent` |

### The override & learning loop

Every action opens a community vote (uphold/override), deduplicated by root.
When a Room's quorum is reached (default **1** for easy solo demo — raise
`agent_config.quorum` for real communities):

- **Overridden** → the action's effect is reverted (comments uncollapse,
  flags are dismissed) and the calibration parameter that fired is **raised**
  — the agent becomes less sensitive on that axis.
- **Upheld** → the parameter tightens slightly — the agent gains confidence.

Calibration is per-Room (`agent_calibration`), the adjustment history is
append-only, and both are shown on the Room's agent page. This was verified
live: a comment that scored heat 0.822 was collapsed at threshold 0.80; after
one community override the threshold moved to 0.86, and an equally hostile
comment then received only a nudge.

### Trust-boundary notes (MVP)

- `record_agent_action` is callable by any authenticated session because the
  agent runs inside the user's request. In production the agent runtime
  would authenticate with a service key (or run as a Supabase Edge
  Function/queue consumer) and the RPC would be restricted to it.
- The two security-definer views (`personas_public`,
  `room_subscriber_counts`) are flagged by Supabase's linter by design —
  they are the mechanism that hides `root_user_id` while RLS keeps raw rows
  private.
- Enable "leaked password protection" in Supabase Auth settings for real
  deployments; it can't be toggled via SQL.

## Deployment

The app is Vercel-ready (`next build` is clean): import the repo, set
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`NEXT_PUBLIC_SITE_URL`, and point `facet.social` at the deployment. Update
the Supabase Auth site URL + redirect allow-list to match.
