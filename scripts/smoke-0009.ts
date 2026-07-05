/* eslint-disable no-console */
/**
 * Smoke harness for migration 0009 — post image attachments.
 *
 * Exercises: create_post with and without an image (backward-compat guard for
 * the redefined 6-arg RPC), the post-images storage RLS (owner may write under
 * a folder named for one of their own personas; may NOT write under another
 * root's persona folder), public read, and that a crosspost-shaped call
 * carrying an image_url still resolves.
 *
 * Run: npx tsx scripts/smoke-0009.ts
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. CREATES throwaway test users/rooms/posts and one
 * storage object, then cleans them up. Pre-launch project only.
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
    console.log("\n=== Facet 0009 smoke test (post images) ===\n");

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

    // ---- personas + room ----
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
    ok("created room", `r/${slug}`);

    // ============================================================
    console.log("\n[1] create_post WITHOUT image (backward-compat guard)");
    {
      const { data: postId, error } = await a.rpc("create_post", {
        p_persona: p1id, p_room: roomId, p_title: "No image", p_body: "plain",
      });
      if (error) return bad("create_post (no image) — this is the prod-break regression", error.message);
      ok("created post without image");
      const { data: row } = await service.from("posts").select("image_url").eq("id", postId).single();
      if (row && row.image_url === null) ok("image_url is null when omitted");
      else bad("image_url not null on imageless post", JSON.stringify(row));
      cleanup.push(async () => { await service.from("posts").delete().eq("id", postId); });
    }

    // ============================================================
    console.log("\n[2] storage RLS — owner may upload under own persona folder");
    let publicUrl = "";
    const ownPath = `${p1id}/${rand()}.png`;
    {
      const { error } = await a.storage
        .from("post-images")
        .upload(ownPath, PNG_1x1, { contentType: "image/png", upsert: false });
      if (error) bad("owner upload under own persona folder", error.message);
      else ok("owner uploaded under own persona folder", ownPath);
      cleanup.push(async () => { await service.storage.from("post-images").remove([ownPath]); });

      const { data: pub } = a.storage.from("post-images").getPublicUrl(ownPath);
      publicUrl = pub.publicUrl;
    }

    // ============================================================
    console.log("\n[3] storage RLS — foreign root may NOT upload under A's persona folder");
    {
      const evilPath = `${p1id}/${rand()}.png`; // B writing into A's persona folder
      const { error } = await b.storage
        .from("post-images")
        .upload(evilPath, PNG_1x1, { contentType: "image/png", upsert: false });
      if (error) ok("foreign upload rejected (expected)", error.message.slice(0, 60));
      else {
        bad("foreign upload was NOT rejected — RLS hole");
        cleanup.push(async () => { await service.storage.from("post-images").remove([evilPath]); });
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
    console.log("\n[5] create_post WITH image_url");
    {
      const { data: postId, error } = await a.rpc("create_post", {
        p_persona: p1id, p_room: roomId, p_title: "With image", p_body: "", p_image_url: publicUrl,
      });
      if (error) return bad("create_post (with image)", error.message);
      ok("created post with image");
      const { data: row } = await service.from("posts").select("image_url").eq("id", postId).single();
      if (row?.image_url === publicUrl) ok("image_url persisted on the post row");
      else bad("image_url not persisted", JSON.stringify(row));
      cleanup.push(async () => { await service.from("posts").delete().eq("id", postId); });

      // ---- [6] crosspost-shaped call carrying an image resolves ----
      console.log("\n[6] crosspost-shaped call (p_crosspost_from + p_image_url) resolves");
      const { data: xId, error: xe } = await a.rpc("create_post", {
        p_persona: p1id, p_room: roomId, p_title: "With image", p_body: "",
        p_crosspost_from: postId, p_image_url: publicUrl,
      });
      if (xe) bad("crosspost-shaped create_post", xe.message);
      else {
        ok("crosspost-shaped create_post resolved");
        cleanup.push(async () => { await service.from("posts").delete().eq("id", xId); });
      }
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
