# Community seed engine

Owner-operated content seeding: 18 root accounts (`root01@seed.facet.social` …
`root18@seed.facet.social`) × 6 personas each = **108 seed personas** that
founded ~37 Rooms and post/comment/vote on an organic schedule. Built
2026-07-05 at the owner's direction to give the site living communities during
the launch window (supersedes the "no fake accounts *on our own site*" note in
LAUNCH-PLAYBOOK.md — the rules about *other* platforms still stand absolutely).

## Ground rules (what keeps this defensible)

- Seed roots all use `@seed.facet.social` emails → identifiable and purgeable
  in one query. **Never** count them as real users: `public_stats()` excludes
  them from `members` (reported separately as `seed_members`). Don't quote
  member numbers to anyone that include seed accounts.
- Seed personas never post testimonials about Facet, never vote on **real**
  users' content en masse, never DM/harass, and taper off as real users arrive.
- The 100-user launch goal is still measured in real members only.

## Moving parts

| Piece | What |
|---|---|
| `scripts/seed/personas.json` | The cast: 18 roots × 6 facets, each with voice + home rooms |
| `scripts/seed/rooms.json` | Room catalog (slug/name/description + content "vibe") |
| `scripts/seed/CONTENT-SPEC.md` | Format + quality rules for content files |
| `scripts/seed/content/<room>.json` | Authored content: `bootstrap` (backfilled), `drip` + `late_comments` (queued) |
| `scripts/seed-bootstrap.ts` | Creates roots/personas/rooms/subscriptions, backfills bootstrap content + votes. Idempotent; re-run after adding content files. |
| `scripts/seed-queue-load.ts` | Loads drip content into `seed_queue` with day/slot timestamps |
| `supabase/migrations/0010_seed_engine.sql` | `seed_queue` table, `seed_tick()`, pg_cron every 13 min, seed-aware `public_stats()` |
| `scripts/seed/.state.json` | (gitignored) root credentials + id maps. Needed by queue-load; keep it. |

## Two drip mechanisms (pick ONE — they'd double-post together)

**A. Local cron (active now, no migration needed).** `scripts/seed-drip-run.ts`
materializes the week of drip into a local queue inside `scripts/seed/.state.json`
and publishes due items via the service role. `scripts/seed-drip-cron.sh` is
installed in the user's crontab (`*/20 * * * *`) so it trickles out on schedule.
Runs only while this Mac is awake; macOS may require granting **Full Disk Access
to `/usr/sbin/cron`** (System Settings → Privacy & Security → Full Disk Access)
for the job to fire. Stop it with `crontab -e` (delete the `seed-drip-cron` line).

**B. pg_cron (always-on, needs the migration).** Apply
`supabase/migrations/0010_seed_engine.sql`, then `seed-queue-load.ts` fills
`seed_queue` and Postgres drains it every 13 min with no host involved. If you
switch to this, first disable mechanism A (remove the crontab line) so content
isn't published twice.

## Operating it

```bash
npx tsx scripts/seed-bootstrap.ts     # roots/personas/rooms/bootstrap — safe to re-run
npx tsx scripts/seed-drip-run.ts      # mechanism A: publish due drip items (cron calls this)
# --- OR, for mechanism B (after applying 0010) ---
npx tsx scripts/seed-queue-load.ts    # refuses if queue still pending; --force to append
```

Check on it (Supabase SQL editor or MCP):

```sql
select kind, count(*) filter (where published_at is null and error is null) as pending,
       count(*) filter (where published_at is not null) as done,
       count(*) filter (where error is not null) as errored
from seed_queue group by kind;
select * from seed_queue where error is not null;         -- should be empty
select * from cron.job_run_details order by start_time desc limit 5;
```

## Weekly top-up (the "routine")

The queue holds ~7 days of activity. To refill: open Claude Code in this repo
and ask it to *"top up the seed queue — author the next week of drip content
per scripts/seed/CONTENT-SPEC.md, then run seed-queue-load with --force"*.
Content agents write new `drip` arrays (replace the old ones or add a new file
generation), keeping each persona's voice consistent with what's already live.

## Tapering / kill switch

- Pause: `select cron.unschedule('facet-seed-tick');` (resume with the
  `cron.schedule` line from migration 0010).
- Slow down: load fewer drip days, or `update seed_queue set not_before = not_before + interval '2 days' where published_at is null;`
- Full purge (cascades to personas/posts/comments/votes):
  `delete from auth.users where email like '%@seed.facet.social';`
  Rooms survive (founder persona becomes null); remove any unwanted ones via
  the admin page. Then re-check `public_stats()`.

As real communities take hold room-by-room, retire that room's drip content
first; the goal is scaffolding, not a permanent puppet show.
