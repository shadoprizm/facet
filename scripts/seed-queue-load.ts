/* eslint-disable no-console */
/**
 * Loads the `drip` and `late_comments` arrays from scripts/seed/content/*.json
 * into public.seed_queue with organic-looking not_before timestamps spread
 * over days 0–6 (America/Toronto slots + jitter). pg_cron drains the queue
 * every 13 minutes via public.seed_tick() (migration 0010), so activity keeps
 * flowing with no machine involved. Also enqueues votes for drip content and
 * a slow trickle of extra votes onto bootstrap posts.
 *
 * Requires: migration 0010 applied, seed-bootstrap.ts already run (state file).
 * Run: npx tsx scripts/seed-queue-load.ts [--force]
 * Refuses to run if the queue still has pending rows unless --force.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const seedDir = path.join(root, "scripts", "seed");
const contentDir = path.join(seedDir, "content");
const state = JSON.parse(readFileSync(path.join(seedDir, ".state.json"), "utf8"));
const personasCfg = JSON.parse(readFileSync(path.join(seedDir, "personas.json"), "utf8"));

type Facet = { handle: string; rooms: string[] };
const allFacets: (Facet & { rootId: string })[] = personasCfg.roots.flatMap(
  (r: { id: string; facets: Facet[] }) => r.facets.map((f) => ({ ...f, rootId: r.id })));
const lc = (s: string) => s.toLowerCase();
const rootOfHandle = new Map(allFacets.map((f) => [lc(f.handle), f.rootId]));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const MIN = 60_000, HOUR = 3600_000;

// Slot windows in America/Toronto (EDT, UTC-4 in July), expressed as local hours.
const SLOTS: Record<string, [number, number]> = {
  morning: [7, 9.5], lunch: [11.5, 13.5], evening: [18, 23], late: [23, 25.5],
};
const EDT_OFFSET = 4 * HOUR;
function slotTime(day: number, slot: string): number {
  const [a, b] = SLOTS[slot] ?? SLOTS.evening;
  const localMidnight = new Date();
  localMidnight.setUTCHours(4, 0, 0, 0); // 00:00 EDT today, expressed in UTC
  if (localMidnight.getTime() > Date.now()) localMidnight.setUTCDate(localMidnight.getUTCDate() - 1);
  const t = localMidnight.getTime() + day * 24 * HOUR + rand(a, b) * HOUR;
  // anything already in the past shifts to the near future
  return t < Date.now() + 10 * MIN ? Date.now() + rand(15, 120) * MIN : t;
}

// regular personas per room, for picking voters
const regulars = (slug: string) => allFacets.filter((f) => f.rooms.includes(slug));

async function insertQueue(rows: object[]): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await db.from("seed_queue").insert(rows.slice(i, i + 200)).select("id");
    if (error) throw new Error(`seed_queue insert: ${error.message}`);
    ids.push(...data!.map((r) => r.id));
  }
  return ids;
}

function voteRowsFor(slug: string, authorHandle: string, parentQueueId: number,
  tBase: number, count: number): object[] {
  const authorRoot = rootOfHandle.get(lc(authorHandle));
  const pool = regulars(slug).filter((f) => f.rootId !== authorRoot);
  const fallback = allFacets.filter((f) => f.rootId !== authorRoot);
  const seenRoots = new Set<string>();
  const rows: object[] = [];
  for (let i = 0; i < count * 3 && rows.length < count; i++) {
    const voter = pool.length && Math.random() < 0.85 ? pick(pool) : pick(fallback);
    if (seenRoots.has(voter.rootId)) continue;
    seenRoots.add(voter.rootId);
    rows.push({
      kind: "vote", room_slug: slug, author_handle: lc(voter.handle),
      parent_queue_id: parentQueueId,
      vote_value: rows.length < 2 || Math.random() > 0.07 ? 1 : -1,
      not_before: new Date(tBase + rand(30 * MIN, 20 * HOUR)).toISOString(),
    });
  }
  return rows;
}

async function main() {
  const force = process.argv.includes("--force");
  const { count, error: qErr } = await db.from("seed_queue")
    .select("id", { count: "exact", head: true }).is("published_at", null).is("error", null);
  if (qErr) {
    console.error(`seed_queue not reachable (${qErr.message}) — is migration 0010 applied?`);
    process.exit(1);
  }
  if ((count ?? 0) > 0 && !force) {
    console.error(`seed_queue already holds ${count} pending items. Re-run with --force to add more.`);
    process.exit(1);
  }

  let posts = 0, comments = 0, votes = 0;
  for (const file of readdirSync(contentDir).filter((f) => f.endsWith(".json"))) {
    const content = JSON.parse(readFileSync(path.join(contentDir, file), "utf8"));
    const slug: string = content.room;
    if (!state.rooms[slug]) { console.log(`! ${file}: unknown room, skipped`); continue; }

    for (const post of content.drip ?? []) {
      const t = slotTime(post.day ?? 1, post.slot ?? "evening");
      const [postQueueId] = await insertQueue([{
        kind: "post", room_slug: slug, author_handle: lc(post.author),
        title: post.title, body: post.body ?? "", not_before: new Date(t).toISOString(),
      }]);
      posts++;

      const commentRows: object[] = [];
      const commentMeta: { author: string; t: number; replies: { author: string; body: string; t: number }[] }[] = [];
      let tc = t;
      for (const c of post.comments ?? []) {
        tc = t + (c.afterMinutes ? c.afterMinutes * MIN : rand(15 * MIN, 9 * HOUR));
        commentRows.push({
          kind: "comment", room_slug: slug, author_handle: lc(c.author),
          body: c.body, parent_queue_id: postQueueId,
          not_before: new Date(tc).toISOString(),
        });
        commentMeta.push({
          author: c.author, t: tc,
          replies: (c.replies ?? []).map((r: { author: string; body: string; afterMinutes?: number }, j: number) => ({
            author: r.author, body: r.body,
            t: tc + (r.afterMinutes ? r.afterMinutes * MIN : rand(20 * MIN, 6 * HOUR)) + j * 5 * MIN,
          })),
        });
      }
      const commentIds = await insertQueue(commentRows);
      comments += commentRows.length;

      const replyRows: object[] = [];
      commentMeta.forEach((meta, idx) => {
        for (const r of meta.replies) {
          replyRows.push({
            kind: "comment", room_slug: slug, author_handle: lc(r.author),
            body: r.body, parent_queue_id: commentIds[idx],
            not_before: new Date(r.t).toISOString(),
          });
        }
      });
      if (replyRows.length) { await insertQueue(replyRows); comments += replyRows.length; }

      // votes on the drip post and some of its comments
      const pv = voteRowsFor(slug, post.author, postQueueId, t, 2 + Math.floor(rand(0, 6)));
      const cv = commentMeta.flatMap((meta, idx) =>
        Math.random() < 0.45 ? voteRowsFor(slug, meta.author, commentIds[idx], meta.t, 1 + Math.floor(rand(0, 2))) : []);
      await insertQueue([...pv, ...cv]);
      votes += pv.length + cv.length;
    }

    // late comments landing on bootstrap threads
    const lateRows: object[] = [];
    for (const c of content.late_comments ?? []) {
      const postId = state.bootstrapPosts[`${slug}:${c.on_bootstrap_index}`];
      if (!postId) continue;
      lateRows.push({
        kind: "comment", room_slug: slug, author_handle: lc(c.author), body: c.body,
        target_post_id: postId,
        not_before: new Date(slotTime(c.day ?? 1, c.slot ?? "evening")).toISOString(),
      });
    }
    if (lateRows.length) { await insertQueue(lateRows); comments += lateRows.length; }

    // slow vote trickle onto bootstrap posts across the week
    const bootKeys = Object.keys(state.bootstrapPosts).filter((k) => k.startsWith(`${slug}:`));
    const trickle: object[] = [];
    for (const key of bootKeys) {
      if (Math.random() > 0.5) continue;
      const day = 1 + Math.floor(rand(0, 6));
      const voterPool = regulars(slug);
      if (!voterPool.length) continue;
      trickle.push({
        kind: "vote", room_slug: slug, author_handle: lc(pick(voterPool).handle),
        target_post_id: state.bootstrapPosts[key], vote_value: 1,
        not_before: new Date(slotTime(day, pick(["lunch", "evening", "late"]))).toISOString(),
      });
    }
    if (trickle.length) { await insertQueue(trickle); votes += trickle.length; }
    console.log(`+ r/${slug}: queued`);
  }
  console.log(`done: ${posts} posts, ${comments} comments, ${votes} votes queued over days 0-6`);
}

main().catch((e) => { console.error(e); process.exit(1); });
