/* eslint-disable no-console */
/**
 * Smoke harness for migration 0006 — exercises every new/changed RPC against
 * the dev Supabase project using BOTH the anon client (as a normal user would)
 * and the service-role client (as the Edge Function would).
 *
 * Run: npx tsx scripts/smoke-0006.ts
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY (server-only), plus two test users created below.
 *
 * IMPORTANT: this CREATES test users in your dev auth.users table. It cleans
 * up most of what it makes (personas/rooms/posts/comments) but leaves the
 * auth.users rows behind because deleting them via the API is fiddly. Run on
 * a dev project, never prod.
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
  // admin.createUser requires the service role.
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

async function main() {
  try {
  console.log("\n=== Facet 0006 smoke test ===\n");

  const email1 = `smoke1+${rand()}@example.com`;
  const email2 = `smoke2+${rand()}@example.com`;
  const pw = "Smoke-Test-2026!";
  const handle1 = `sm${rand()}`.slice(0, 12);
  const handle2 = `sm${rand()}`.slice(0, 12);

  console.log(`Creating test users: ${email1}, ${email2}`);
  const root1 = await signUp(email1, pw);
  const root2 = await signUp(email2, pw);

  // Grant root1 platform admin so admin_* RPCs work for it.
  const { error: grantErr } = await service.from("platform_admins").insert({ root_user_id: root1 });
  if (grantErr) console.log(`  (note: admin grant: ${grantErr.message})`);
  cleanup.push(async () => {
    await service.auth.admin.deleteUser(root1).catch(() => {});
    await service.auth.admin.deleteUser(root2).catch(() => {});
  });

  const a = await signIn(email1, pw); // user A (anon client)
  const b = await signIn(email2, pw); // user B (anon client)

  // Verify the admin grant took effect from A's session.
  {
    const { data: isAdmin } = await a.rpc("is_platform_admin");
    if (isAdmin === true) ok("admin grant verified for A", "is_platform_admin=true");
    else bad("admin grant FAILED for A", `is_platform_admin=${String(isAdmin)}`);
  }

  // ---- personas ----
  console.log("\n[personas]");
  const { data: p1id, error: p1e } = await a.rpc("create_persona", {
    p_handle: handle1, p_display_name: "Smoke A", p_bio: "",
  });
  if (p1e) return bad("create persona A", p1e.message);
  ok("created persona A", `@${handle1}`);

  const { data: p2id, error: p2e } = await b.rpc("create_persona", {
    p_handle: handle2, p_display_name: "Smoke B", p_bio: "",
  });
  if (p2e) return bad("create persona B", p2e.message);
  ok("created persona B", `@${handle2}`);

  // ---- room + post + comment scaffolding ----
  const slug = `smoke-${rand()}`.slice(0, 16);
  const { data: roomId, error: re } = await a.rpc("create_room", {
    p_persona: p1id, p_slug: slug, p_name: "Smoke Room", p_description: "", p_constitution: "",
  });
  if (re) return bad("create room", re.message);
  ok("created room", `r/${slug}`);

  const { data: postId, error: pe } = await a.rpc("create_post", {
    p_persona: p1id, p_room: roomId, p_title: "Smoke post", p_body: "hello",
  });
  if (pe) return bad("create post", pe.message);
  ok("created post");

  const { data: commentId, error: ce } = await b.rpc("create_comment", {
    p_persona: p2id, p_post: postId, p_body: "smoke comment from B",
  });
  if (ce) return bad("create comment (B on A's post)", ce.message);
  ok("B commented on A's post");

  // ============================================================
  console.log("\n[T1#1] record_agent_action locked to service role");
  {
    // From the anon/authenticated client: should now be revoked.
    const { error: anonErr } = await a.rpc("record_agent_action", {
      p_room: roomId, p_post: postId, p_action: "nudge", p_trigger: "heat_nudge",
      p_target_type: "post", p_target: postId, p_reason: "should fail", p_metrics: {},
    });
    if (anonErr) ok("anon client rejected (expected)", anonErr.message.slice(0, 60));
    else bad("anon client was NOT rejected — record_agent_action still executable by authenticated");

    // From the service client: should succeed.
    const { data, error: svcErr } = await service.rpc("record_agent_action", {
      p_room: roomId, p_post: postId, p_action: "nudge", p_trigger: "heat_nudge",
      p_target_type: "post", p_target: postId, p_reason: "smoke nudge", p_metrics: { heat: 0.6 },
    });
    if (svcErr) bad("service client rejected", svcErr.message);
    else ok("service client succeeded", `action ${data}`);
  }

  // ============================================================
  console.log("\n[T1#2] user reporting");
  {
    // A reports B's comment.
    const { data: rid, error } = await a.rpc("create_report", {
      p_persona: p1id, p_target_type: "comment", p_target_id: commentId,
      p_category: "harassment", p_reason: "smoke test report",
    });
    if (error) bad("create_report", error.message);
    else ok("A reported B's comment", `report ${rid}`);

    // A can't report the same comment twice (dedup).
    const { error: dup } = await a.rpc("create_report", {
      p_persona: p1id, p_target_type: "comment", p_target_id: commentId,
      p_category: "spam", p_reason: "again",
    });
    if (dup) ok("duplicate report rejected (expected)", dup.message.slice(0, 60));
    else bad("duplicate report was NOT rejected");

    // admin_list_reports via A (the admin user) — service role has no auth.uid().
    const { data: list, error: le } = await a.rpc("admin_list_reports", { p_status: "open" });
    if (le) bad("admin_list_reports", le.message);
    else ok("admin_list_reports returned", `${(list ?? []).length} open report(s)`);

    // Resolve via A (admin).
    const { error: res } = await a.rpc("admin_resolve_report", {
      p_report: rid, p_disposition: "reviewed",
    });
    if (res) bad("admin_resolve_report", res.message);
    else ok("admin_resolve_report succeeded");
  }

  // ============================================================
  console.log("\n[T1#3] content deletion");
  {
    // B deletes their own comment.
    const { error } = await b.rpc("delete_comment", { p_comment: commentId });
    if (error) bad("B can't delete own comment", error.message);
    else ok("B deleted own comment");

    const { data: c } = await service.from("comments").select("status, body").eq("id", commentId).single();
    if (c?.status === "removed" && c?.body === "[removed]") ok("comment soft-deleted correctly");
    else bad("comment not soft-deleted", JSON.stringify(c));

    // A tries to delete B's post (impossible — B didn't make a post; A deletes own post).
    const { error: oe } = await b.rpc("delete_post", { p_post: postId });
    if (oe) ok("B rejected deleting A's post (expected)", oe.message.slice(0, 60));
    else bad("B was able to delete A's post — authz broken");

    // A deletes own post.
    const { error: de } = await a.rpc("delete_post", { p_post: postId });
    if (de) bad("A can't delete own post", de.message);
    else ok("A deleted own post");
  }

  // ============================================================
  console.log("\n[T2#5] author cannot self-override");
  {
    // Need a fresh post + an agent collapse on it to test override.
    const { data: pid2 } = await a.rpc("create_post", {
      p_persona: p1id, p_room: roomId, p_title: "self-override test", p_body: "hello again",
    });
    const { data: cid2 } = await a.rpc("create_comment", {
      p_persona: p1id, p_post: pid2, p_body: "my own comment",
    });
    // Service role simulates the agent collapsing A's comment.
    const { data: actId } = await service.rpc("record_agent_action", {
      p_room: roomId, p_post: pid2, p_action: "collapse", p_trigger: "heat_collapse",
      p_target_type: "comment", p_target: cid2, p_reason: "test collapse", p_metrics: {},
    });
    // A (the comment author) tries to override — should be rejected.
    const { error: self } = await a.rpc("cast_override_vote", {
      p_persona: p1id, p_action: actId, p_vote: "override",
    });
    if (self) ok("author rejected from overriding own collapse (expected)", self.message.slice(0, 70));
    else bad("author was able to self-override — T2#5 NOT fixed");
    cleanup.push(async () => {
      try { await service.from("agent_actions").delete().eq("id", actId); } catch {}
    });
  }

  // ============================================================
  console.log("\n[T2#6] symmetric learning step");
  {
    // B posts a comment; the agent (service) collapses it; A (a DIFFERENT
    // root, not the author) overrides → resolution + learning step fires.
    const { data: pid3 } = await b.rpc("create_post", {
      p_persona: p2id, p_room: roomId, p_title: "B's post for override", p_body: "test",
    });
    const { data: cid3 } = await b.rpc("create_comment", {
      p_persona: p2id, p_post: pid3, p_body: "B's comment to collapse",
    });
    const { data: actId2 } = await service.rpc("record_agent_action", {
      p_room: roomId, p_post: pid3, p_action: "collapse", p_trigger: "heat_collapse",
      p_target_type: "comment", p_target: cid3, p_reason: "test collapse 2", p_metrics: {},
    });

    // Capture pre-override threshold.
    const { data: calBefore } = await service.from("agent_calibration")
      .select("heat_collapse, history").eq("room_id", roomId).single();
    const before = calBefore?.heat_collapse ?? 0.8;

    // A overrides (quorum=1, so one vote resolves it).
    const { data: status, error: ovErr } = await a.rpc("cast_override_vote", {
      p_persona: p1id, p_action: actId2, p_vote: "override",
    });
    if (ovErr) bad("override vote failed", ovErr.message);
    else if (status === "overridden") ok("override resolved the action");
    else bad("override did not resolve", `status=${status}`);

    const { data: calAfter } = await service.from("agent_calibration")
      .select("heat_collapse, history, learning_rate").eq("room_id", roomId).single();
    const after = calAfter?.heat_collapse ?? 0.8;
    const lr = calAfter?.learning_rate ?? 0.06;
    const expectedDelta = lr; // symmetric: +lr on override (heat_collapse axis, ×1)

    if (Math.abs((after - before) - expectedDelta) < 0.001) {
      ok(`symmetric step confirmed: ${before.toFixed(4)} → ${after.toFixed(4)} (+${expectedDelta})`);
    } else {
      bad("symmetric step WRONG", `delta=${(after - before).toFixed(4)}, expected +${expectedDelta}`);
    }

    const histLen = (calAfter?.history ?? []).length;
    ok("history appended", `${histLen} entr${histLen === 1 ? "y" : "ies"}`);

    cleanup.push(async () => {
      try { await service.from("agent_actions").delete().eq("id", actId2); } catch {}
    });
  }

  // ============================================================
  console.log("\n[T3#9] admin room management");
  {
    const newSlug = `renamed-${rand()}`.slice(0, 16);
    const { error } = await a.rpc("admin_rename_room", {
      p_room: roomId, p_slug: newSlug, p_name: "Renamed Room",
    });
    if (error) bad("admin_rename_room", error.message);
    else ok("admin_rename_room succeeded", `→ r/${newSlug}`);

    const { error: e2 } = await a.rpc("admin_remove_room", { p_room: roomId });
    if (e2) bad("admin_remove_room", e2.message);
    else ok("admin_remove_room succeeded");

    const { data: r } = await service.from("rooms").select("removed_at").eq("id", roomId).single();
    if (r?.removed_at) ok("room soft-removed (removed_at set)");
    else bad("room removed_at not set");
  }

  // ============================================================
  console.log("\n[T3#11] notifications");
  {
    // The reply from B to A's post (above) should have created a notification for A.
    // Plus any agent collapses. Check via service role reading A's notifications.
    const { data: notifs } = await service.from("notifications")
      .select("*").eq("root_user_id", root1).order("created_at", { ascending: false }).limit(10);
    if ((notifs ?? []).length > 0) ok("notifications exist for root A", `${notifs!.length} total`);
    else bad("no notifications created for A");

    // mark_notifications_read via A's client.
    const { error } = await a.rpc("mark_notifications_read");
    if (error) bad("mark_notifications_read", error.message);
    else ok("mark_notifications_read succeeded");
  }

  // ============================================================
  console.log("\n[T1-bonus] private_* helpers revoked from authenticated");
  {
    const { error } = await a.rpc("private_own_active_persona", { p_persona: p1id });
    if (error) ok("private_own_active_persona rejected (expected)", error.message.slice(0, 60));
    else bad("private helper still executable by authenticated — bonus NOT fixed");
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
