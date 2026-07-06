/* eslint-disable no-console */
/**
 * One-time handoff from the local-cron drip (mechanism A) to pg_cron (mechanism
 * B). Loads every NOT-yet-published item from the local queue in
 * scripts/seed/.state.json into public.seed_queue, preserving parent chains and
 * scheduled times, so seed_tick() (migration 0010) drains them from here on.
 * Items the local cron already published are skipped, so nothing double-posts.
 *
 * Prereqs: migration 0010 applied; local crontab entry removed first.
 * Run: npx tsx scripts/seed-queue-from-local.ts [--force]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const statePath = path.join(root, "scripts", "seed", ".state.json");
if (!existsSync(statePath)) { console.error("no .state.json"); process.exit(1); }
const state = JSON.parse(readFileSync(statePath, "utf8"));
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));

type QItem = {
  key: string; kind: "post" | "comment" | "vote"; roomSlug: string; authorHandle: string;
  title?: string; body?: string; parentKey?: string; targetPostId?: string;
  voteValue?: number; notBefore: number; publishedId?: string | null; publishedAt?: number; error?: string;
};

async function main() {
  const force = process.argv.includes("--force");
  if (state.handedOffToSeedQueue && !force) {
    console.error("Already handed off (state.handedOffToSeedQueue). Use --force to repeat."); process.exit(1);
  }
  const { count } = await db.from("seed_queue").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0 && !force) {
    console.error(`seed_queue already has ${count} rows. Use --force if you really mean to add more.`); process.exit(1);
  }

  const q: QItem[] = state.dripQueue ?? [];
  const byKey = new Map(q.map((i) => [i.key, i]));
  const seedId = new Map<string, number>(); // local key -> seed_queue id
  const toLoad = q.filter((i) => !i.publishedAt && !i.error);
  console.log(`loading ${toLoad.length} unpublished items (of ${q.length}) into seed_queue`);

  let n = 0, errored = 0;
  for (const item of q) {                       // queue order => parents precede children
    if (item.publishedAt || item.error) continue;
    const parent = item.parentKey ? byKey.get(item.parentKey) : undefined;

    const row: Record<string, unknown> = {
      kind: item.kind, room_slug: item.roomSlug, author_handle: item.authorHandle,
      title: item.title ?? null, body: item.body ?? null,
      vote_value: item.kind === "vote" ? item.voteValue : null,
      not_before: new Date(item.notBefore).toISOString(),
    };
    if (item.targetPostId) {
      row.target_post_id = item.targetPostId;
    } else if (parent) {
      if (parent.publishedAt && parent.publishedId) {      // parent already live (posted by cron A)
        if (parent.kind === "post") row.target_post_id = parent.publishedId;
        else row.target_comment_id = parent.publishedId;
      } else if (seedId.has(parent.key)) {                 // parent queued in this pass
        row.parent_queue_id = seedId.get(parent.key);
      } else {
        item.error = "parent neither published nor queued";
        errored++; continue;
      }
    }
    const { data, error } = await db.from("seed_queue").insert(row).select("id").single();
    if (error) { item.error = `seed_queue: ${error.message}`; errored++; continue; }
    seedId.set(item.key, data!.id);
    n++;
    if (n % 200 === 0) { console.log(`  ${n} loaded`); save(); }
  }
  state.handedOffToSeedQueue = true;
  save();
  console.log(`done: ${n} rows loaded into seed_queue, ${errored} errored. pg_cron (facet-seed-tick) will drain them.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
