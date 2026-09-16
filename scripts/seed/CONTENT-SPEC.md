# Seed content spec

Content files live at `scripts/seed/content/<room-slug>.json`, one per room.
They are consumed by `scripts/seed-bootstrap.ts` (the `bootstrap` array — backfilled
with organic timestamps over the room's first days) and `scripts/seed-queue-load.ts`
(the `drip` and `late_comments` arrays — scheduled into `seed_queue` and published
by pg_cron over the next 7 days).

## File format

```jsonc
{
  "room": "<slug>",                     // must match rooms.json
  "bootstrap": [                        // published immediately, backdated
    {
      "author": "<persona handle>",     // from personas.json, verbatim
      "title": "…",                     // 1–200 chars
      "body": "…",                      // may be "" for title-only posts; plain text, \n\n between paragraphs
      "comments": [
        { "author": "…", "body": "…",
          "replies": [ { "author": "…", "body": "…" } ] }
      ]
    }
  ],
  "drip": [                             // trickles out over days 0–6
    {
      "day": 0,                         // 0 = today … 6
      "slot": "morning" | "lunch" | "evening" | "late",
      "author": "…", "title": "…", "body": "…",
      "comments": [
        { "author": "…", "body": "…", "afterMinutes": 45,   // delay after the post
          "replies": [ { "author": "…", "body": "…", "afterMinutes": 120 } ] }
      ]
    }
  ],
  "late_comments": [                    // fresh comments landing on bootstrap threads later
    { "on_bootstrap_index": 0, "day": 1, "slot": "evening", "author": "…", "body": "…" }
  ]
}
```

## Authorship rules

- Authors are handles from `scripts/seed/personas.json`, used verbatim. Pick
  personas whose `rooms` include this room; at most one "visitor" persona per
  thread whose interests plausibly overlap — two in Rooms with fewer than six
  regulars, which can't staff a thread otherwise. r/usa has no regulars, so
  its authors are all visitors whose bios fit.
- A post's OP may reply inside their own thread (that's natural); nobody else
  comments twice at the same level of the same thread unless replying to a reply.
- Personas belonging to the same root (same `id` group in personas.json) — keep
  to at most 2 per thread, and they never reply to each other.
- Stay in character: each persona's `voice` tags and `bio` govern register,
  interests, and quirks. The same persona must feel like the same person
  across every file.

## Content rules

- Varied length: some one-liners, some 2–3 short paragraphs. Real forums are
  uneven. Comment threads should read as conversation, not as N independent
  reactions — later comments react to earlier ones.
- Internet-casual register. Occasional lowercase openers and mild slang are
  good; keyboard-smash, hashtag, and emoji spam are not. At most one emoji in
  a long while.
- Canadian spelling for Canadian personas. The montreal room is roughly half
  French/franglais (tourtiere, bagelfaction, midnightpoutine are regulars).
- Evergreen only: no dated news events, elections, wars, disasters, or
  anything time-pegged. Seasonal references must fit July.
- Facts must be true: TIL posts and ELI5 answers are verifiable and correct;
  name a source in prose ("according to …") without URLs.
- PG-13. No hot-button politics/religion, no medical/legal/financial advice
  framed as professional, no real private individuals, no celebrity gossip,
  nothing defamatory about real companies (mild consumer grumbling is fine).
- amithejerk stories are mundane, plausible, low-stakes; verdicts in comments
  should genuinely disagree sometimes.
- Never reference the platform being new or quiet, seeding, bots, or AI
  authorship. No self-promotion of Facet itself.
- Plain text only — no markdown links, images, or formatting syntax.

## Volume tiers (per room)

| Tier | bootstrap posts | drip posts | comments per post | late_comments |
|------|-----------------|-----------|-------------------|---------------|
| A    | 6               | 7 (≈1/day, spread days 0–6) | 3–7 top-level, 0–3 replies | 4–6 |
| B    | 4               | 4 (spread days 0–6)         | 3–6 top-level, 0–2 replies | 3–4 |
| C    | 3               | 2–3 (spread days 1–6)       | 2–5 top-level, 0–2 replies | 2–3 |

Drip `afterMinutes`: first comment 10–90 min after the post, later ones spaced
out to as much as 12 h; replies come after their parent. Slot mix: mostly
`evening` and `lunch`, some `morning`, occasional `late`.

Validate before finishing: `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"`.

## Later generations (refills)

The launch corpus above was consumed once, 2026-07-06 → 07-14. Every refill is a
new directory: `scripts/seed/content/<generation>/<room-slug>.json` (`gen2`,
`gen3`, …). `seed-bootstrap.ts` only reads top-level files, so generation
directories are never backfilled by accident.

Differences from the launch format:

- **No `bootstrap` array.** Only `room`, `drip`, and `late_comments`.
- **`day` runs 0–13** — two weeks, at roughly half the launch week's daily
  density, which reads more like a real young community than a burst.
- **Seasonal references fit the load date, not July.** Each generation's brief
  states day 0's calendar date and weekday.
- **Never repeat earlier content.** No reused titles or comment bodies from any
  generation; don't retell a story or joke already told in the Room, even
  reworded. Read the Room's earlier files before writing.
- **No reference to time away.** Personas don't mention having been gone, the
  Room being quiet, or "it's been a while". A persona may naturally follow up on
  something it said before ("update on the sourdough") — that is continuity, not
  a gap.
- `late_comments` still target the Room's launch `bootstrap` threads by index.
  Those threads are weeks old by now, so late comments read as someone finding
  an older thread ("found this searching for…", "tried this after reading it").

| Tier | drip posts | comments per post | late_comments |
|------|-----------|-------------------|---------------|
| A    | 8 (days 0–13) | 3–6 top-level, 0–3 replies | 3 |
| B    | 5 (days 0–13) | 3–5 top-level, 0–2 replies | 2 |
| C    | 3 (days 0–13) | 2–4 top-level, 0–2 replies | 1 |

Validate, then dry-run, then load:

```bash
node scripts/seed-validate.mjs gen2                              # must report 0 errors
npx tsx scripts/seed-queue-load.ts --generation gen2 --dry-run   # what would be queued
npx tsx scripts/seed-queue-load.ts --generation gen2
```

The loader skips any post title or late-comment body the Room has already
queued or published, so a re-run (or an accidental run on an old generation)
queues nothing rather than duplicating it.
