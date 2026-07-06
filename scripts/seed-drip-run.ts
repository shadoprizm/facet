/* eslint-disable no-console */
/**
 * Drip drainer — the no-migration alternative to the pg_cron seed_queue.
 *
 * On first run it materializes every `drip` post/comment/reply, `late_comments`
 * entry, and their votes from scripts/seed/content/*.json into a local queue in
 * scripts/seed/.state.json, each stamped with an absolute `notBefore` spread
 * across days 0–6 (America/Toronto slots + jitter, anchored to first-run day).
 * Every run publishes the items whose time has come — via the Supabase service
 * role, exactly like seed-bootstrap.ts — and records them so re-runs never
 * double-post. Parent posts publish before their comments; comments before
 * their votes.
 *
 * Run once now, and on a schedule (cron / launchd) for ongoing trickle:
 *   npx tsx scripts/seed-drip-run.ts
 *
 * This runs only while the host is awake. For always-on 24/7 delivery instead,
 * apply supabase/migrations/0010_seed_engine.sql (pg_cron) and use
 * seed-queue-load.ts — the two mechanisms are mutually exclusive; pick one.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
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
const statePath = path.join(seedDir, ".state.json");
if (!existsSync(statePath)) { console.error("Run seed-bootstrap.ts first."); process.exit(1); }
const state = JSON.parse(readFileSync(statePath, "utf8"));
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));

const personasCfg = JSON.parse(readFileSync(path.join(seedDir, "personas.json"), "utf8"));
type Facet = { handle: string; rooms: string[] };
const allFacets: (Facet & { rootId: string })[] = personasCfg.roots.flatMap(
  (r: { id: string; facets: Facet[] }) => r.facets.map((f) => ({ ...f, rootId: r.id })));
const lc = (s: string) => s.toLowerCase();
const rootOfHandle = new Map(allFacets.map((f) => [lc(f.handle), f.rootId]));
const regulars = (slug: string) => allFacets.filter((f) => f.rooms.includes(slug));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const MIN = 60_000, HOUR = 3600_000;

const SLOTS: Record<string, [number, number]> = {
  morning: [7, 9.5], lunch: [11.5, 13.5], evening: [18, 23], late: [23, 25.5],
};
// day 0 anchored to local midnight (EDT = UTC-4 in July) of first-run day.
function anchorMidnightUTC(): number {
  if (state.dripAnchor) return state.dripAnchor;
  const d = new Date();
  d.setUTCHours(4, 0, 0, 0);
  if (d.getTime() > Date.now()) d.setUTCDate(d.getUTCDate() - 1);
  state.dripAnchor = d.getTime();
  return state.dripAnchor;
}
function slotTime(day: number, slot: string): number {
  const [a, b] = SLOTS[slot] ?? SLOTS.evening;
  return anchorMidnightUTC() + day * 24 * HOUR + rand(a, b) * HOUR;
}

// ---- queue item: {key, kind, roomSlug, authorHandle, title?, body?, parentKey?,
//                   targetPostId?, voteValue?, notBefore, publishedId?, publishedAt?, error?}
type QItem = {
  key: string; kind: "post" | "comment" | "vote"; roomSlug: string; authorHandle: string;
  title?: string; body?: string; parentKey?: string; targetPostId?: string;
  voteValue?: number; notBefore: number; publishedId?: string | null; publishedAt?: number; error?: string;
};

function buildQueue(): QItem[] {
  const q: QItem[] = [];
  let seq = 0;
  const k = () => `d${seq++}`;
  const voteItems = (slug: string, authorHandle: string, parentKey: string, tBase: number, count: number) => {
    const authorRoot = rootOfHandle.get(lc(authorHandle));
    const pool = regulars(slug).filter((f) => f.rootId !== authorRoot);
    const fallback = allFacets.filter((f) => f.rootId !== authorRoot);
    const seen = new Set<string>();
    for (let i = 0; i < count * 3 && seen.size < count; i++) {
      const v = pool.length && Math.random() < 0.85 ? pick(pool) : pick(fallback);
      if (seen.has(v.rootId)) continue;
      seen.add(v.rootId);
      q.push({ key: k(), kind: "vote", roomSlug: slug, authorHandle: lc(v.handle),
        parentKey, voteValue: seen.size <= 2 || Math.random() > 0.07 ? 1 : -1,
        notBefore: tBase + rand(30 * MIN, 20 * HOUR) });
    }
  };

  for (const file of readdirSync(contentDir).filter((f) => f.endsWith(".json"))) {
    const c = JSON.parse(readFileSync(path.join(contentDir, file), "utf8"));
    const slug: string = c.room;
    if (!state.rooms[slug]) continue;

    for (const post of c.drip ?? []) {
      const t = slotTime(post.day ?? 1, post.slot ?? "evening");
      const postKey = k();
      q.push({ key: postKey, kind: "post", roomSlug: slug, authorHandle: lc(post.author),
        title: post.title, body: post.body ?? "", notBefore: t });
      voteItems(slug, post.author, postKey, t, 2 + Math.floor(rand(0, 6)));
      let tc = t;
      for (const cm of post.comments ?? []) {
        tc = t + (cm.afterMinutes ? cm.afterMinutes * MIN : rand(15 * MIN, 9 * HOUR));
        const cKey = k();
        q.push({ key: cKey, kind: "comment", roomSlug: slug, authorHandle: lc(cm.author),
          body: cm.body, parentKey: postKey, notBefore: tc });
        if (Math.random() < 0.45) voteItems(slug, cm.author, cKey, tc, 1 + Math.floor(rand(0, 2)));
        let tr = tc;
        for (const rep of cm.replies ?? []) {
          tr = tc + (rep.afterMinutes ? rep.afterMinutes * MIN : rand(20 * MIN, 6 * HOUR));
          q.push({ key: k(), kind: "comment", roomSlug: slug, authorHandle: lc(rep.author),
            body: rep.body, parentKey: cKey, notBefore: tr });
        }
      }
    }
    for (const cm of c.late_comments ?? []) {
      const postId = state.bootstrapPosts[`${slug}:${cm.on_bootstrap_index}`];
      if (!postId) continue;
      q.push({ key: k(), kind: "comment", roomSlug: slug, authorHandle: lc(cm.author),
        body: cm.body, targetPostId: postId, notBefore: slotTime(cm.day ?? 1, cm.slot ?? "evening") });
    }
  }
  return q;
}

async function drain() {
  const now = Date.now();
  const q: QItem[] = state.dripQueue;
  const byKey = new Map(q.map((i) => [i.key, i]));
  let published = 0, skipped = 0;

  for (const item of q) {
    if (item.publishedAt || item.error) continue;
    if (item.notBefore > now) continue;
    const parent = item.parentKey ? byKey.get(item.parentKey) : undefined;
    if (parent && !parent.publishedAt) continue; // parent not live yet

    try {
      const roomId = state.rooms[item.roomSlug];
      const persona = state.personas[item.authorHandle];
      const personaRoot = rootOfHandle.get(item.authorHandle)
        ? state.roots[rootOfHandle.get(item.authorHandle)!].id : undefined;
      if (!roomId || !persona) throw new Error(`missing room/persona ${item.roomSlug}/${item.authorHandle}`);

      // resolve target
      let targetPost = item.targetPostId ?? null;
      let targetComment: string | null = null;
      if (parent) {
        if (parent.kind === "post") targetPost = parent.publishedId!;
        else if (parent.kind === "comment") { targetComment = parent.publishedId!; }
      }
      if (targetComment && !targetPost) {
        const { data } = await db.from("comments").select("post_id").eq("id", targetComment).single();
        targetPost = data?.post_id ?? null;
      }

      if (item.kind === "post") {
        // dedup: same room+persona+title already present?
        const { data: dup } = await db.from("posts").select("id")
          .eq("room_id", roomId).eq("author_persona_id", persona).eq("title", item.title!).maybeSingle();
        if (dup) { item.publishedId = dup.id; item.publishedAt = now; skipped++; continue; }
        const { data, error } = await db.from("posts").insert({
          room_id: roomId, author_persona_id: persona, title: item.title, body: item.body ?? "",
          created_at: new Date(item.notBefore).toISOString(),
        }).select("id").single();
        if (error) throw error;
        item.publishedId = data!.id;

      } else if (item.kind === "comment") {
        if (!targetPost) throw new Error("comment without target post");
        const { data: dup } = await db.from("comments").select("id")
          .eq("post_id", targetPost).eq("author_persona_id", persona).eq("body", item.body!).maybeSingle();
        if (dup) { item.publishedId = dup.id; item.publishedAt = now; skipped++; continue; }
        const { data, error } = await db.from("comments").insert({
          post_id: targetPost, room_id: roomId, parent_comment_id: targetComment,
          author_persona_id: persona, body: item.body,
          created_at: new Date(item.notBefore).toISOString(),
        }).select("id").single();
        if (error) throw error;
        item.publishedId = data!.id;
        const { data: pc } = await db.from("posts").select("comment_count").eq("id", targetPost).single();
        await db.from("posts").update({ comment_count: (pc?.comment_count ?? 0) + 1 }).eq("id", targetPost);

      } else if (item.kind === "vote") {
        const tType = targetComment ? "comment" : "post";
        const tId = targetComment ?? targetPost;
        if (!tId) throw new Error("vote without target");
        const { data: tgt } = await db.from(tType === "post" ? "posts" : "comments")
          .select("author_persona_id, score").eq("id", tId).single();
        if (!tgt) throw new Error("vote target gone");
        const { data: authorPersona } = await db.from("personas")
          .select("root_user_id, karma").eq("id", tgt.author_persona_id).single();
        // one vote per root, never self
        if (authorPersona && authorPersona.root_user_id !== personaRoot) {
          const { data: existing } = await db.from("votes").select("value")
            .eq("voter_root_id", personaRoot).eq("target_type", tType).eq("target_id", tId).maybeSingle();
          if (!existing) {
            const { error } = await db.from("votes").insert({
              voter_root_id: personaRoot, voter_persona_id: persona,
              target_type: tType, target_id: tId, value: item.voteValue,
            });
            if (!error) {
              await db.from(tType === "post" ? "posts" : "comments")
                .update({ score: tgt.score + item.voteValue! }).eq("id", tId);
              await db.from("personas")
                .update({ karma: authorPersona.karma + item.voteValue! }).eq("id", tgt.author_persona_id);
            }
          }
        }
        item.publishedId = null;
      }
      item.publishedAt = now;
      published++;
    } catch (e: unknown) {
      item.error = e instanceof Error ? e.message : String(e);
    }
    if (published % 20 === 0) save();
  }
  save();
  const pending = q.filter((i) => !i.publishedAt && !i.error).length;
  const errored = q.filter((i) => i.error).length;
  console.log(`drip: +${published} published, ${skipped} deduped, ${pending} pending, ${errored} errored`);
  if (errored) console.log("  first errors:", q.filter((i) => i.error).slice(0, 3).map((i) => `${i.kind}/${i.roomSlug}: ${i.error}`));
}

async function main() {
  if (!state.dripQueue) {
    state.dripQueue = buildQueue();
    save();
    console.log(`materialized drip queue: ${state.dripQueue.length} items over days 0-6 (anchor ${new Date(state.dripAnchor).toISOString()})`);
  }
  await drain();
}
main().catch((e) => { console.error(e); process.exit(1); });
