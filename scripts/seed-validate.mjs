/* eslint-disable no-console */
/**
 * Lints seed content against scripts/seed/CONTENT-SPEC.md before it goes
 * anywhere near seed_queue. Checks structure, authorship rules (home rooms,
 * one visitor per thread, same-root personas never talking to each other),
 * and — the one that matters most — that no post title or comment body
 * repeats anything from an earlier generation, since the queue republishes
 * whatever it is given.
 *
 * Run: node scripts/seed-validate.mjs [generation] [room ...]
 *   node scripts/seed-validate.mjs              launch corpus (content/*.json)
 *   node scripts/seed-validate.mjs gen2         content/gen2/*.json
 *   node scripts/seed-validate.mjs gen2 hockey  one room
 * Exits 1 on any error; warnings are advisory.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed");
const contentDir = path.join(seedDir, "content");
const [generation, ...onlyRooms] = process.argv.slice(2);
const genDir = generation ? path.join(contentDir, generation) : contentDir;
if (!existsSync(genDir)) { console.error(`no such generation: ${genDir}`); process.exit(1); }
const MAX_DAY = generation ? 13 : 6;
const SLOTS = new Set(["morning", "lunch", "evening", "late"]);

const personasCfg = JSON.parse(readFileSync(path.join(seedDir, "personas.json"), "utf8"));
const roomsCfg = JSON.parse(readFileSync(path.join(seedDir, "rooms.json"), "utf8"));
const facets = new Map(personasCfg.roots.flatMap((r) => r.facets.map((f) => [f.handle, { ...f, root: r.id }])));
const knownRooms = new Set(roomsCfg.rooms.map((r) => r.slug));
const regularsOf = (slug) => [...facets.values()].filter((f) => f.rooms.includes(slug)).length;

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const jsonFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith(".json") && statSync(path.join(dir, f)).isFile());

// Everything already written in other generations: titles and comment bodies.
const priorTitles = new Map(), priorBodies = new Map();
const generationDirs = [contentDir, ...readdirSync(contentDir)
  .map((d) => path.join(contentDir, d)).filter((d) => statSync(d).isDirectory())];
for (const dir of generationDirs) {
  if (dir === genDir) continue;
  const label = path.relative(contentDir, dir) || "launch";
  for (const file of jsonFiles(dir)) {
    const c = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const walk = (list) => (list ?? []).forEach((x) => {
      if (x.body && x.body.length > 25) priorBodies.set(norm(x.body), `${label}/${file}`);
      walk(x.replies);
    });
    for (const p of [...(c.bootstrap ?? []), ...(c.drip ?? [])]) {
      priorTitles.set(norm(p.title), `${label}/${file}`);
      walk(p.comments);
    }
    walk(c.late_comments);
  }
}

let errors = 0, warnings = 0;
const err = (where, msg) => { errors++; console.log(`  ERROR ${where}: ${msg}`); };
const warn = (where, msg) => { warnings++; console.log(`  warn  ${where}: ${msg}`); };

const EMOJI = /\p{Extended_Pictographic}/gu;
function lintText(where, text, field) {
  if (typeof text !== "string") return err(where, `${field} must be a string`);
  if (/https?:\/\/|www\.[a-z]/i.test(text)) err(where, `${field} contains a URL`);
  if (/\[[^\]]+\]\([^)]+\)|\*\*|^#{1,6} /m.test(text)) err(where, `${field} contains markdown`);
  if (/\bfacet(\.social)?\b|\bseed(ed|ing)?\b.*\b(account|persona|content)|\bchatgpt\b|as an ai\b/i.test(text))
    err(where, `${field} references the platform, seeding, or AI authorship`);
  if (/\b(july|canada day|fourth of july|4th of july|independence day|st-jean|saint-jean)\b/i.test(text) && generation)
    warn(where, `${field} has a July-pegged reference — seasonal content must fit the load date`);
  if (/\b20[12]\d\b/.test(text)) warn(where, `${field} names a year — keep content evergreen`);
}

for (const file of jsonFiles(genDir)) {
  const slug = file.replace(/\.json$/, "");
  if (onlyRooms.length && !onlyRooms.includes(slug)) continue;
  console.log(`${generation ?? "launch"}/${file}`);
  let c;
  try { c = JSON.parse(readFileSync(path.join(genDir, file), "utf8")); }
  catch (e) { err(file, `invalid JSON: ${e.message}`); continue; }
  if (c.room !== slug) err(file, `room "${c.room}" does not match filename`);
  if (!knownRooms.has(slug)) err(file, `room "${slug}" is not in rooms.json`);
  if (generation && c.bootstrap?.length) err(file, "later generations must not carry bootstrap posts");
  const launch = JSON.parse(readFileSync(path.join(contentDir, file), "utf8"));
  const bootstrapCount = launch.bootstrap?.length ?? 0;

  const seenTitles = new Set(), seenBodies = new Set(), emojiCount = { n: 0 };
  const checkAuthor = (where, handle) => {
    const f = facets.get(handle);
    if (!f) err(where, `unknown persona "${handle}" (handles are case-sensitive)`);
    return f;
  };
  const checkBody = (where, body) => {
    lintText(where, body, "body");
    if (typeof body !== "string") return;
    emojiCount.n += (body.match(EMOJI) ?? []).length;
    const key = norm(body);
    if (key.length > 25) {
      if (priorBodies.has(key)) err(where, `body repeats ${priorBodies.get(key)}`);
      if (seenBodies.has(key)) err(where, "body repeats another comment in this file");
      seenBodies.add(key);
    }
  };

  (c.drip ?? []).forEach((post, i) => {
    const where = `drip[${i}]`;
    if (!Number.isInteger(post.day) || post.day < 0 || post.day > MAX_DAY) err(where, `day must be 0–${MAX_DAY}`);
    if (!SLOTS.has(post.slot)) err(where, `slot "${post.slot}" invalid`);
    if (typeof post.title !== "string" || post.title.length < 1 || post.title.length > 200)
      err(where, "title must be 1–200 chars");
    else {
      lintText(where, post.title, "title");
      const key = norm(post.title);
      if (priorTitles.has(key)) err(where, `title repeats ${priorTitles.get(key)}`);
      if (seenTitles.has(key)) err(where, "title repeats another post in this file");
      seenTitles.add(key);
    }
    lintText(where, post.body ?? "", "body");

    const op = checkAuthor(where, post.author);
    const threadHandles = new Set([post.author]);
    const visitors = new Set();
    const note = (handle) => {
      threadHandles.add(handle);
      const f = facets.get(handle);
      if (f && !f.rooms.includes(slug)) visitors.add(handle);
    };
    // Rooms with a thin cast (r/usa has no regulars at all) can't staff a
    // thread from regulars alone, so the visitor allowance scales with the cast.
    const cast = regularsOf(slug);
    const maxVisitors = cast === 0 ? Infinity : cast < 6 ? 2 : 1;
    if (op && cast > 0 && !op.rooms.includes(slug)) err(where, `OP ${post.author} is not a regular of r/${slug}`);

    const topAuthors = new Set();
    let lastAfter = 0;
    (post.comments ?? []).forEach((cm, j) => {
      const cw = `${where}.comments[${j}]`;
      const author = checkAuthor(cw, cm.author);
      note(cm.author);
      checkBody(cw, cm.body);
      if (cm.author !== post.author && topAuthors.has(cm.author)) err(cw, `${cm.author} comments twice at top level`);
      topAuthors.add(cm.author);
      if (!(cm.afterMinutes >= 5 && cm.afterMinutes <= 24 * 60)) err(cw, "afterMinutes must be 5–1440");
      else if (cm.afterMinutes < lastAfter) warn(cw, "afterMinutes earlier than the comment above it");
      lastAfter = cm.afterMinutes ?? lastAfter;

      const replyAuthors = new Set();
      (cm.replies ?? []).forEach((rp, k) => {
        const rw = `${cw}.replies[${k}]`;
        const ra = checkAuthor(rw, rp.author);
        note(rp.author);
        checkBody(rw, rp.body);
        // the loader picks a random delay when a reply omits afterMinutes
        if (rp.afterMinutes !== undefined && !(rp.afterMinutes >= 5 && rp.afterMinutes <= 24 * 60)) err(rw, "afterMinutes must be 5–1440");
        if (rp.author === cm.author) err(rw, "replies to their own comment");
        if (ra && author && ra.root === author.root) err(rw, `${rp.author} and ${cm.author} share a root — they never reply to each other`);
        if (rp.author !== post.author && replyAuthors.has(rp.author)) err(rw, `${rp.author} replies twice under one comment`);
        replyAuthors.add(rp.author);
      });
    });

    if (visitors.size > maxVisitors) err(where, `${visitors.size} visitor personas in thread (max ${maxVisitors}): ${[...visitors].join(", ")}`);
    const perRoot = new Map();
    for (const h of threadHandles) {
      const f = facets.get(h);
      if (f) perRoot.set(f.root, [...(perRoot.get(f.root) ?? []), h]);
    }
    for (const [rootId, hs] of perRoot) if (hs.length > 2) err(where, `${hs.length} personas from ${rootId} in one thread: ${hs.join(", ")}`);
    if (!(post.comments ?? []).length) warn(where, "post has no comments");
  });

  (c.late_comments ?? []).forEach((lc, i) => {
    const where = `late_comments[${i}]`;
    if (!Number.isInteger(lc.on_bootstrap_index) || lc.on_bootstrap_index < 0 || lc.on_bootstrap_index >= bootstrapCount)
      err(where, `on_bootstrap_index must be 0–${bootstrapCount - 1}`);
    if (!Number.isInteger(lc.day) || lc.day < 0 || lc.day > MAX_DAY) err(where, `day must be 0–${MAX_DAY}`);
    if (!SLOTS.has(lc.slot)) err(where, `slot "${lc.slot}" invalid`);
    const f = checkAuthor(where, lc.author);
    if (f && !f.rooms.includes(slug)) warn(where, `${lc.author} is a visitor in r/${slug}`);
    checkBody(where, lc.body);
  });

  if (emojiCount.n > 2) warn(file, `${emojiCount.n} emoji across the file — spec says one in a long while`);
  const comments = (c.drip ?? []).reduce((a, p) => a + (p.comments ?? []).reduce((b, x) => b + 1 + (x.replies ?? []).length, 0), 0);
  console.log(`  ${(c.drip ?? []).length} posts, ${comments} comments, ${(c.late_comments ?? []).length} late comments`);
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
