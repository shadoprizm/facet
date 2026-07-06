/* eslint-disable no-console */
/**
 * Community seed bootstrap — creates the seed roots (@seed.facet.social),
 * their personas, the room catalog, subscriptions, and backfills the
 * `bootstrap` content from scripts/seed/content/*.json with organic-looking
 * timestamps (rooms spread over the launch window, posts after their room,
 * comments after their post) plus votes that mirror cast_vote bookkeeping.
 *
 * Run: npx tsx scripts/seed-bootstrap.ts            (uses .env.local)
 * Idempotent: existing emails/handles/slugs are reused, already-seeded rooms
 * (state file) are skipped. Writes scripts/seed/.state.json (gitignored) with
 * ids + credentials — seed-queue-load.ts depends on it.
 *
 * Purge everything this created:
 *   delete from auth.users where email like '%@seed.facet.social';
 *   (cascades to personas/posts/comments/votes; rooms survive with
 *    created_by_persona_id null — remove via admin page if wanted)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

// ---------- env (.env.local, same convention as next dev)
const root = path.join(__dirname, "..");
for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !SERVICE) { console.error("Missing Supabase env."); process.exit(1); }
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

// ---------- data
const seedDir = path.join(root, "scripts", "seed");
const personasCfg = JSON.parse(readFileSync(path.join(seedDir, "personas.json"), "utf8"));
const roomsCfg = JSON.parse(readFileSync(path.join(seedDir, "rooms.json"), "utf8"));
const contentDir = path.join(seedDir, "content");
const statePath = path.join(seedDir, ".state.json");
const state: {
  roots: Record<string, { id: string; email: string; password: string }>;
  personas: Record<string, string>;           // lower(handle) -> persona id
  rooms: Record<string, string>;              // slug -> room id
  bootstrapPosts: Record<string, string>;     // "slug:index" -> post id
  seededRooms: string[];                      // content already backfilled
} = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : { roots: {}, personas: {}, rooms: {}, bootstrapPosts: {}, seededRooms: [] };
const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2));

const now = () => Date.now();
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3600_000, MIN = 60_000;

const PALETTE = ["#6366f1", "#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6",
  "#ec4899", "#84cc16", "#f97316", "#14b8a6", "#a855f7", "#0ea5e9", "#e11d48", "#65a30d"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

type Facet = { handle: string; name: string; bio: string; rooms: string[]; activity: string };
const allFacets: (Facet & { rootId: string })[] = personasCfg.roots.flatMap(
  (r: { id: string; facets: Facet[] }) => r.facets.map((f) => ({ ...f, rootId: r.id })));
const lc = (h: string) => h.toLowerCase();
const rootOfHandle = new Map(allFacets.map((f) => [lc(f.handle), f.rootId]));

async function main() {
  // ---------- 1. roots
  console.log("== roots");
  const { data: page } = await db.auth.admin.listUsers({ page: 1, perPage: 500 });
  const byEmail = new Map((page?.users ?? []).map((u) => [u.email, u.id]));
  for (const r of personasCfg.roots) {
    if (state.roots[r.id]) continue;
    const existing = byEmail.get(r.email);
    if (existing) {
      state.roots[r.id] = { id: existing, email: r.email, password: "(preexisting)" };
      continue;
    }
    const password = `Sf-${randomBytes(12).toString("base64url")}`;
    const { data, error } = await db.auth.admin.createUser({
      email: r.email, password, email_confirm: true,
    });
    if (error) throw new Error(`createUser ${r.email}: ${error.message}`);
    state.roots[r.id] = { id: data.user.id, email: r.email, password };
    console.log(`  + ${r.email}`);
  }
  saveState();

  // ---------- 2. personas (direct insert: service role, backdated created_at;
  // the create_persona RPC's 3-per-24h rate limit doesn't apply to us and the
  // RPC has no other side effects)
  console.log("== personas");
  const { data: existingPersonas } = await db.from("personas").select("id, handle");
  const handleToId = new Map((existingPersonas ?? []).map((p) => [p.handle, p.id]));
  const launch = new Date("2026-07-03T22:00:00Z").getTime();
  const toInsert = allFacets
    .filter((f) => !handleToId.has(lc(f.handle)))
    .map((f) => ({
      root_user_id: state.roots[f.rootId].id,
      handle: lc(f.handle),
      display_name: f.name,
      bio: f.bio,
      avatar_color: PALETTE[hash(f.handle) % PALETTE.length],
      created_at: iso(rand(launch, now() - 2 * HOUR)),
    }));
  if (toInsert.length) {
    const { data, error } = await db.from("personas").insert(toInsert).select("id, handle");
    if (error) throw new Error(`personas insert: ${error.message}`);
    for (const p of data!) handleToId.set(p.handle, p.id);
    console.log(`  + ${toInsert.length} personas`);
  }
  for (const f of allFacets) state.personas[lc(f.handle)] = handleToId.get(lc(f.handle))!;
  saveState();

  // ---------- 3. rooms (backdated over the launch window, founder = a regular)
  console.log("== rooms");
  const { data: existingRooms } = await db.from("rooms").select("id, slug, created_at");
  const roomBySlug = new Map((existingRooms ?? []).map((r) => [r.slug, r]));
  const newRooms = roomsCfg.rooms.filter((r: { slug: string }) => !roomBySlug.has(r.slug));
  let t = launch + 30 * MIN;
  const step = newRooms.length ? (now() - 5 * HOUR - t) / newRooms.length : 0;
  for (const r of newRooms) {
    const regulars = allFacets.filter((f) => f.rooms.includes(r.slug));
    const founder = regulars.find((f) => f.activity === "high") ?? regulars[0]
      ?? allFacets[hash(r.slug) % allFacets.length];
    const founderId = state.personas[lc(founder.handle)];
    const createdAt = iso(t + rand(0, step * 0.8));
    t += step;
    const { data, error } = await db.from("rooms").insert({
      slug: r.slug, name: r.name, description: r.description,
      created_by_persona_id: founderId,
      created_by_root: rootOfHandle.get(lc(founder.handle))
        ? state.roots[rootOfHandle.get(lc(founder.handle))!].id
        : Object.values(state.roots)[0].id,
      created_at: createdAt,
    }).select("id, slug, created_at").single();
    if (error) throw new Error(`room ${r.slug}: ${error.message}`);
    roomBySlug.set(r.slug, data!);
    await db.from("agent_calibration").insert({ room_id: data!.id });
    await db.from("room_subscriptions").insert({ persona_id: founderId, room_id: data!.id });
    console.log(`  + r/${r.slug} (founder ${founder.handle})`);
  }
  for (const [slug, r] of roomBySlug) state.rooms[slug] = r.id;
  saveState();

  // ---------- 4. subscriptions (home rooms + a couple of deterministic extras)
  console.log("== subscriptions");
  const catalogSlugs = roomsCfg.rooms.map((r: { slug: string }) => r.slug);
  const subs: { persona_id: string; room_id: string }[] = [];
  for (const f of allFacets) {
    const extras = [catalogSlugs[hash(f.handle + "x") % catalogSlugs.length],
      catalogSlugs[hash(f.handle + "y") % catalogSlugs.length]];
    for (const slug of new Set([...f.rooms, ...extras])) {
      const roomId = state.rooms[slug];
      if (roomId) subs.push({ persona_id: state.personas[lc(f.handle)], room_id: roomId });
    }
  }
  const { error: subErr } = await db.from("room_subscriptions")
    .upsert(subs, { onConflict: "persona_id,room_id", ignoreDuplicates: true });
  if (subErr) throw new Error(`subscriptions: ${subErr.message}`);
  console.log(`  ~ ${subs.length} subscriptions ensured`);

  // subscriber roots per room (vote pools)
  const roomSubs = new Map<string, Set<string>>(); // slug -> root ids
  for (const f of allFacets) {
    for (const slug of f.rooms) {
      if (!roomSubs.has(slug)) roomSubs.set(slug, new Set());
      roomSubs.get(slug)!.add(state.roots[f.rootId].id);
    }
  }

  // ---------- 5. bootstrap content
  console.log("== bootstrap content");
  if (!existsSync(contentDir)) { console.log("  (no content dir yet — skipping)"); return; }
  const rootIdOf = (handle: string) => {
    const rid = rootOfHandle.get(lc(handle));
    return rid ? state.roots[rid].id : undefined;
  };
  const personaOfRootInRoom = (rootUid: string, slug: string) => {
    const candidates = allFacets.filter(
      (f) => state.roots[f.rootId].id === rootUid && f.rooms.includes(slug));
    const f = candidates[0] ?? allFacets.find((x) => state.roots[x.rootId].id === rootUid)!;
    return state.personas[lc(f.handle)];
  };
  const karmaDelta = new Map<string, number>();
  const voteRows: object[] = [];
  const scoreUpdates: { table: "posts" | "comments"; id: string; score: number }[] = [];

  const voteOn = (targetType: "post" | "comment", targetId: string,
    authorHandle: string, slug: string, target: number) => {
    const authorRoot = rootIdOf(authorHandle);
    const pool = [...(roomSubs.get(slug) ?? [])].filter((rid) => rid !== authorRoot);
    const all = Object.values(state.roots).map((r) => r.id).filter((rid) => rid !== authorRoot);
    const voters = new Set<string>();
    while (voters.size < Math.min(target, all.length)) {
      voters.add(pool.length && Math.random() < 0.8 ? pick(pool) : pick(all));
    }
    let score = 0; let i = 0;
    for (const rid of voters) {
      const value = i++ < 2 || Math.random() > 0.06 ? 1 : -1;
      score += value;
      const personaId = personaOfRootInRoom(rid, slug);
      voteRows.push({ voter_root_id: rid, voter_persona_id: personaId,
        target_type: targetType, target_id: targetId, value });
      const authorPersona = state.personas[lc(authorHandle)];
      if (authorPersona) karmaDelta.set(authorPersona, (karmaDelta.get(authorPersona) ?? 0) + value);
    }
    if (score !== 0) scoreUpdates.push({ table: targetType === "post" ? "posts" : "comments", id: targetId, score });
  };

  for (const file of readdirSync(contentDir).filter((f) => f.endsWith(".json"))) {
    const content = JSON.parse(readFileSync(path.join(contentDir, file), "utf8"));
    const slug: string = content.room;
    const roomId = state.rooms[slug];
    if (!roomId) { console.log(`  ! ${file}: room ${slug} unknown, skipped`); continue; }
    if (state.seededRooms.includes(slug)) continue;
    const room = roomBySlug.get(slug)!;
    const roomCreated = new Date(room.created_at).getTime();
    const windowStart = Math.max(roomCreated + 10 * MIN, now() - 60 * HOUR);
    const cap = now() - 90_000;

    for (let i = 0; i < (content.bootstrap ?? []).length; i++) {
      const post = content.bootstrap[i];
      const author = state.personas[lc(post.author)];
      if (!author) { console.log(`  ! ${slug}[${i}]: unknown author ${post.author}`); continue; }
      const tPost = rand(windowStart, Math.max(windowStart + MIN, cap - 30 * MIN));
      const { data: p, error } = await db.from("posts").insert({
        room_id: roomId, author_persona_id: author,
        title: post.title, body: post.body ?? "", created_at: iso(tPost),
      }).select("id").single();
      if (error) { console.log(`  ! ${slug}[${i}]: ${error.message}`); continue; }
      state.bootstrapPosts[`${slug}:${i}`] = p!.id;

      let commentCount = 0;
      let tc = tPost;
      for (const c of post.comments ?? []) {
        const cAuthor = state.personas[lc(c.author)];
        if (!cAuthor) continue;
        tc = Math.min(tc + rand(8 * MIN, 4 * HOUR), cap);
        const { data: cm, error: ce } = await db.from("comments").insert({
          post_id: p!.id, room_id: roomId, author_persona_id: cAuthor,
          body: c.body, created_at: iso(tc),
        }).select("id").single();
        if (ce) continue;
        commentCount++;
        if (Math.random() < 0.5) voteOn("comment", cm!.id, c.author, slug, 1 + Math.floor(rand(0, 3)));
        let tr = tc;
        for (const rep of c.replies ?? []) {
          const rAuthor = state.personas[lc(rep.author)];
          if (!rAuthor) continue;
          tr = Math.min(tr + rand(5 * MIN, 5 * HOUR), cap);
          const { data: rm, error: re } = await db.from("comments").insert({
            post_id: p!.id, room_id: roomId, parent_comment_id: cm!.id,
            author_persona_id: rAuthor, body: rep.body, created_at: iso(tr),
          }).select("id").single();
          if (re) continue;
          commentCount++;
          if (Math.random() < 0.3) voteOn("comment", rm!.id, rep.author, slug, 1 + Math.floor(rand(0, 2)));
        }
      }
      await db.from("posts").update({ comment_count: commentCount }).eq("id", p!.id);
      voteOn("post", p!.id, post.author, slug,
        Math.min(14, 1 + Math.floor(commentCount * 0.7 + rand(0, 4))));
    }
    state.seededRooms.push(slug);
    saveState();
    console.log(`  + r/${slug}: ${(content.bootstrap ?? []).length} posts backfilled`);
  }

  // ---------- 6. votes, scores, karma
  console.log(`== votes (${voteRows.length})`);
  for (let i = 0; i < voteRows.length; i += 400) {
    const { error } = await db.from("votes").insert(voteRows.slice(i, i + 400));
    if (error) console.log(`  ! votes batch: ${error.message}`);
  }
  for (const u of scoreUpdates) {
    await db.from(u.table).update({ score: u.score }).eq("id", u.id);
  }
  console.log("== karma");
  const personaIds = [...karmaDelta.keys()];
  const { data: karmaRows } = await db.from("personas").select("id, karma").in("id", personaIds);
  for (const row of karmaRows ?? []) {
    await db.from("personas").update({ karma: row.karma + (karmaDelta.get(row.id) ?? 0) }).eq("id", row.id);
  }
  saveState();
  console.log("done. state -> scripts/seed/.state.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
