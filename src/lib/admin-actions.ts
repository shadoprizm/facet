"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`);
}

export async function adminBanRootByHandle(formData: FormData) {
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "Platform ban");
  const supabase = await createClient();

  const { data: rows, error: lookupErr } = await supabase.rpc("admin_lookup_persona", {
    p_handle: handle,
  });
  if (lookupErr) fail("/admin/bans", lookupErr.message);
  if (!rows || rows.length === 0) fail("/admin/bans", `No persona with handle @${handle}.`);

  const { error } = await supabase.rpc("admin_ban_root", {
    p_root: rows[0].root_user_id,
    p_reason: reason,
  });
  if (error) fail("/admin/bans", error.message);
  revalidatePath("/admin/bans");
  redirect("/admin/bans");
}

export async function adminUnbanRoot(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_unban_root", {
    p_root: String(formData.get("root_id")),
  });
  if (error) fail("/admin/bans", error.message);
  revalidatePath("/admin/bans");
  redirect("/admin/bans");
}

export async function adminUnbanRoom(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_unban_room", {
    p_room: String(formData.get("room_id")),
    p_root: String(formData.get("root_id")),
  });
  if (error) fail("/admin/bans", error.message);
  revalidatePath("/admin/bans");
  redirect("/admin/bans");
}

export async function adminResolveFlag(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_flag", {
    p_action: String(formData.get("action_id")),
    p_disposition: "reviewed",
  });
  if (error) fail("/admin/flags", error.message);
  revalidatePath("/admin/flags");
  redirect("/admin/flags");
}

export async function adminBanFromFlag(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ban_persona_from_room", {
    p_room: String(formData.get("room_id")),
    p_persona: String(formData.get("persona_id")),
    p_reason: String(formData.get("reason") ?? "Flagged by agent, confirmed by admin"),
  });
  if (error) fail("/admin/flags", error.message);
  revalidatePath("/admin/flags");
  redirect("/admin/flags");
}

export async function adminGrant(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant", {
    p_email: String(formData.get("email") ?? "").trim(),
  });
  if (error) fail("/admin/admins", error.message);
  revalidatePath("/admin/admins");
  redirect("/admin/admins");
}

export async function adminRevoke(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke", {
    p_root: String(formData.get("root_id")),
  });
  if (error) fail("/admin/admins", error.message);
  revalidatePath("/admin/admins");
  redirect("/admin/admins");
}

// ============================================================ reports (T1#2)

export async function adminResolveReport(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_report", {
    p_report: String(formData.get("report_id")),
    p_disposition: String(formData.get("disposition") ?? "reviewed"),
  });
  if (error) fail("/admin/flags", error.message);
  revalidatePath("/admin/flags");
  redirect("/admin/flags");
}

/** Admin/founder removes any post via the admin queue. */
export async function adminRemovePost(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_post", {
    p_post: String(formData.get("post_id")),
  });
  if (error) fail("/admin/flags", error.message);
  revalidatePath("/admin/flags");
  redirect("/admin/flags");
}

export async function adminRemoveComment(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_comment", {
    p_comment: String(formData.get("comment_id")),
  });
  if (error) fail("/admin/flags", error.message);
  revalidatePath("/admin/flags");
  redirect("/admin/flags");
}

// ============================================================ room management (T3#9)

export async function adminRenameRoom(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_rename_room", {
    p_room: String(formData.get("room_id")),
    p_slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    p_name: String(formData.get("name") ?? "").trim(),
  });
  if (error) fail("/admin/rooms", error.message);
  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}

export async function adminRemoveRoom(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_room", {
    p_room: String(formData.get("room_id")),
  });
  if (error) fail("/admin/rooms", error.message);
  revalidatePath("/admin/rooms");
  redirect("/admin/rooms");
}
