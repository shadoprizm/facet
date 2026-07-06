/* eslint-disable no-console */
/**
 * Smoke harness for migration 0011 — comment image attachments.
 *
 * Exercises: create_comment with and without an image (backward-compat guard
 * for the redefined 5-arg RPC), the comment-images storage RLS (owner may write
 * under a folder named for one of their own personas; may NOT write under
 * another root's persona folder), public read, and that a reply-shaped call
 * (p_parent + p_image_url) still resolves.
 *
 * Run: npx tsx scripts/smoke-0011.ts
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. CREATES throwaway test users/rooms/posts/comments
 * and one storage object, then cleans them up. Pre-launch project only.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("Missing env. Need URL, ANON, and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const service = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function ok(label: string, detail = "") {
  pass++;
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}
function bad(label: string, detail = "") {
  fail++;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function signUp(email: string, password: string) {
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw new Error(`signUp ${email}: ${error.message}`);
  return data.user.id;
}

async function signIn(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  });
}

const rand = () => Math.random().toString(36).slice(2, 10);
const cleanup: Array<() => Promise<void>> = [];

// A minimal, valid 1×1 transparent PNG.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  try {
    console.log("\n=== Facet 0011 smoke test (comment images) ===\n");

    const email1 = `smoke1+${rand()}@example.com`;
    const email2 = `smoke2+${rand()}@example.com`;
    const pw = "Smoke-Test-2026!";
    const handle1 = `sm${rand()}`.slice(0, 12);
    const handle2 = `sm${rand()}`.slice(0, 12);

    console.log(`Creating test users: ${email1}, ${email2}`);
    const root1 = await signUp(email1, pw);
    const root2 = await signUp(email2, pw);
    cleanup.push(async () => {
      await service.auth.admin.deleteUser(root1).catch(() => {});
      await service.auth.admin.deleteUser(root2).catch(() => {});
    });

    const a = await signIn(email1, pw); // owner
    const b = await signIn(email2, pw); // other root

    // ---- personas + room + post ----
    const { data: p1id, error: p1e } = await a.rpc("create_persona", {
      p_handle: handle1, p_display_name: "Smoke A", p_bio: "",
    });
    if (p1e) return bad("create persona A", p1e.message);
    const { data: p2id, error: p2e } = await b.rpc("create_persona", {
      p_handle: handle2, p_display_name: "Smoke B", p_bio: "",
    });
    if (p2e) return bad("create persona B", p2e.message);
    ok("created personas A + B");

    const slug = `smoke-${rand()}`.slice(0, 16);
    const { data: roomId, error: re } = await a.rpc("create_room", {
      p_persona: p1id, p_slug: slug, p_name: "Smoke Room", p_description: "", p_constitution: "",
    });
    if (re) return bad("create room", re.message);

    const { data: postId, error: pe } = await a.rpc("create_post", {
      p_persona: p1id, p_room: roomId, p_title: "Host post", p_body: "",
    });
    if (pe) return bad("create host post", pe.message);
    cleanup.push(async () => { await service.from("posts").delete().eq("id", postId); });
    ok("created room + host post", `r/${slug}`);

    // ============================================================
    console.log("\n[1] create_comment WITHOUT image (backward-compat guard)");
    let topLevelId = "";
    {
      const { data: cid, error } = await a.rpc("create_comment", {
        p_persona: p1id, p_post: postId, p_body: "plain reply",
      });
      if (error) return bad("create_comment (no image) — this is the prod-break regression", error.message);
      topLevelId = cid as string;
      ok("created comment without image");
      const { data: row } = await service.from("comments").select("image_url").eq("id", cid).single();
      if (row && row.image_url === null) ok("image_url is null when omitted");
      else bad("image_url not null on imageless comment", JSON.stringify(row));
    }

    // ============================================================
    console.log("\n[2] storage RLS — owner may upload under own persona folder");
    let publicUrl = "";
    const ownPath = `${p1id}/${rand()}.png`;
    {
      const { error } = await a.storage
        .from("comment-images")
        .upload(ownPath, PNG_1x1, { contentType: "image/png", upsert: false });
      if (error) bad("owner upload under own persona folder", error.message);
      else ok("owner uploaded under own persona folder", ownPath);
      cleanup.push(async () => { await service.storage.from("comment-images").remove([ownPath]); });

      const { data: pub } = a.storage.from("comment-images").getPublicUrl(ownPath);
      publicUrl = pub.publicUrl;
    }

    // ============================================================
    console.log("\n[3] storage RLS — foreign root may NOT upload under A's persona folder");
    {
      const evilPath = `${p1id}/${rand()}.png`; // B writing into A's persona folder
      const { error } = await b.storage
        .from("comment-images")
        .upload(evilPath, PNG_1x1, { contentType: "image/png", upsert: false });
      if (error) ok("foreign upload rejected (expected)", error.message.slice(0, 60));
      else {
        bad("foreign upload was NOT rejected — RLS hole");
        cleanup.push(async () => { await service.storage.from("comment-images").remove([evilPath]); });
      }
    }

    // ============================================================
    console.log("\n[4] public read of the uploaded image");
    {
      const res = await fetch(publicUrl);
      if (res.ok) ok("public URL readable", `HTTP ${res.status}`);
      else bad("public URL not readable", `HTTP ${res.status}`);
    }

    // ============================================================
    console.log("\n[5] create_comment WITH image_url");
    {
      const { data: cid, error } = await a.rpc("create_comment", {
        p_persona: p1id, p_post: postId, p_body: "", p_image_url: publicUrl,
      });
      if (error) return bad("create_comment (image only)", error.message);
      ok("created image-only comment (GIF-reaction shape)");
      const { data: row } = await service.from("comments").select("image_url").eq("id", cid).single();
      if (row?.image_url === publicUrl) ok("image_url persisted on the comment row");
      else bad("image_url not persisted", JSON.stringify(row));

      // ---- [6] reply-shaped call carrying an image resolves ----
      console.log("\n[6] reply-shaped call (p_parent + p_image_url) resolves");
      const { data: rid, error: reErr } = await a.rpc("create_comment", {
        p_persona: p1id, p_post: postId, p_body: "nested", p_parent: topLevelId, p_image_url: publicUrl,
      });
      if (reErr) bad("reply-shaped create_comment", reErr.message);
      else ok("reply-shaped create_comment resolved", String(rid).slice(0, 8));
    }

    console.log(`\n=== Result: ${pass} passed, ${fail} failed ===\n`);
  } catch (err) {
    console.error("\nFATAL:", err);
    fail++;
  } finally {
    console.log("Cleaning up...");
    for (const fn of cleanup.reverse()) {
      try { await fn(); } catch { /* best effort */ }
    }
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
