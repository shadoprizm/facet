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
  thread whose interests plausibly overlap.
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
