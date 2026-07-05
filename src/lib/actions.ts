"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_PERSONA_COOKIE, getActivePersona } from "@/lib/persona";
import { invokeAgent } from "@/lib/agent/invoke";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`);
}

// ============================================================ auth

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) fail("/login", error.message);
  redirect("/");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const captchaToken = formData.get("captchaToken");
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    options: {
      emailRedirectTo: `${SITE}/auth/confirm`,
      // Forwarded when the login form renders a captcha widget; absent (no-op)
      // when captcha is disabled in the dashboard. See docs/AUTH-HARDENING.md.
      ...(captchaToken ? { captchaToken: String(captchaToken) } : {}),
    },
  });
  if (error) fail("/login", error.message);
  if (data.session) redirect("/");
  redirect("/login?notice=" + encodeURIComponent("Check your email to confirm your root account."));
}

export async function sendMagicLink(formData: FormData) {
  const supabase = await createClient();
  const captchaToken = formData.get("captchaToken");
  const { error } = await supabase.auth.signInWithOtp({
    email: String(formData.get("email") ?? ""),
    options: {
      emailRedirectTo: `${SITE}/auth/confirm`,
      ...(captchaToken ? { captchaToken: String(captchaToken) } : {}),
    },
  });
  if (error) fail("/login", error.message);
  redirect("/login?notice=" + encodeURIComponent("Magic link sent — check your email."));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ============================================================ personas

export async function createPersona(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_persona", {
    p_handle: String(formData.get("handle") ?? "").trim().toLowerCase(),
    p_display_name: String(formData.get("display_name") ?? "").trim(),
    p_avatar_color: String(formData.get("avatar_color") ?? "#6366f1"),
    p_bio: String(formData.get("bio") ?? "").trim(),
  });
  if (error) fail("/me", error.message);
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PERSONA_COOKIE, data as string, { path: "/" });
  revalidatePath("/", "layout");
  redirect("/me");
}

export async function retirePersona(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_persona", {
    p_persona: String(formData.get("persona_id")),
  });
  if (error) fail("/me", error.message);
  revalidatePath("/", "layout");
  redirect("/me");
}

export async function switchPersona(formData: FormData) {
  const personaId = String(formData.get("persona_id"));
  const backTo = String(formData.get("back_to") || "/");
  const supabase = await createClient();
  // Ownership check: RLS means this select only finds the caller's personas.
  const { data } = await supabase
    .from("personas")
    .select("id")
    .eq("id", personaId)
    .eq("status", "active")
    .single();
  if (!data) fail(backTo, "That mask isn't yours.");
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PERSONA_COOKIE, personaId, { path: "/" });
  revalidatePath("/", "layout");
  redirect(backTo);
}

// ============================================================ rooms

export async function createRoom(formData: FormData) {
  const persona = await getActivePersona();
  if (!persona) fail("/rooms/new", "Create a persona first.");
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_room", {
    p_persona: persona.id,
    p_slug: slug,
    p_name: String(formData.get("name") ?? "").trim(),
    p_description: String(formData.get("description") ?? "").trim(),
    p_constitution: String(formData.get("constitution") ?? ""),
  });
  if (error) fail("/rooms/new", error.message);
  redirect(`/r/${slug}`);
}

export async function toggleSubscribe(formData: FormData) {
  const persona = await getActivePersona();
  const slug = String(formData.get("slug"));
  if (!persona) fail(`/r/${slug}`, "Create a persona first.");
  const roomId = String(formData.get("room_id"));
  const subscribed = formData.get("subscribed") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    subscribed ? "unsubscribe_room" : "subscribe_room",
    { p_persona: persona.id, p_room: roomId }
  );
  if (error) fail(`/r/${slug}`, error.message);
  revalidatePath(`/r/${slug}`);
  redirect(`/r/${slug}`);
}

export async function updateConstitution(formData: FormData) {
  const slug = String(formData.get("slug"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_constitution", {
    p_room: String(formData.get("room_id")),
    p_constitution: String(formData.get("constitution") ?? ""),
  });
  if (error) fail(`/r/${slug}/agent`, error.message);
  revalidatePath(`/r/${slug}/agent`);
  redirect(`/r/${slug}/agent`);
}

// ============================================================ content

export async function createPost(formData: FormData) {
  const persona = await getActivePersona();
  const slug = String(formData.get("room_slug"));
  if (!persona) fail(`/r/${slug}/submit`, "Create a persona first.");
  const supabase = await createClient();

  // Optional image attachment. Upload first (keyed by the posting persona, the
  // same ownership gate as avatars) so the public URL can be stored on the row.
  const back = `/r/${slug}/submit`;
  const imageUrl = await uploadPostImage(supabase, persona.id, formData, back);

  const { data, error } = await supabase.rpc("create_post", {
    p_persona: persona.id,
    p_room: String(formData.get("room_id")),
    p_title: String(formData.get("title") ?? "").trim(),
    p_body: String(formData.get("body") ?? "").trim(),
    p_image_url: imageUrl,
  });
  if (error) fail(back, error.message);
  await invokeAgent("post", data as string);
  redirect(`/post/${data}`);
}

export async function createComment(formData: FormData) {
  const persona = await getActivePersona();
  const postId = String(formData.get("post_id"));
  if (!persona) fail(`/post/${postId}`, "Create a persona first.");
  const parent = formData.get("parent_id");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_comment", {
    p_persona: persona.id,
    p_post: postId,
    p_body: String(formData.get("body") ?? "").trim(),
    p_parent: parent ? String(parent) : null,
  });
  if (error) fail(`/post/${postId}`, error.message);
  await invokeAgent("comment", data as string);
  revalidatePath(`/post/${postId}`);
  redirect(`/post/${postId}`);
}

export async function crosspost(formData: FormData) {
  const sourceId = String(formData.get("source_post_id"));
  const personaId = String(formData.get("persona_id"));
  const roomId = String(formData.get("room_id"));
  const supabase = await createClient();

  const { data: source } = await supabase
    .from("posts")
    .select("title, body, image_url")
    .eq("id", sourceId)
    .single();
  if (!source) fail(`/post/${sourceId}`, "Source post not found.");

  const { data, error } = await supabase.rpc("create_post", {
    p_persona: personaId,
    p_room: roomId,
    p_title: source.title,
    p_body: source.body,
    p_crosspost_from: sourceId,
    p_image_url: source.image_url,
  });
  if (error) fail(`/post/${sourceId}`, error.message);
  await invokeAgent("post", data as string);
  redirect(`/post/${data}`);
}

// ============================================================ votes (called from client components)

export async function vote(
  targetType: "post" | "comment",
  targetId: string,
  value: -1 | 0 | 1,
  path: string
): Promise<{ error?: string }> {
  const persona = await getActivePersona();
  if (!persona) return { error: "Create a persona first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cast_vote", {
    p_persona: persona.id,
    p_target_type: targetType,
    p_target: targetId,
    p_value: value,
  });
  if (error) return { error: error.message };
  revalidatePath(path);
  return {};
}

export async function overrideVote(
  actionId: string,
  choice: "uphold" | "override",
  path: string
): Promise<{ error?: string; status?: string }> {
  const persona = await getActivePersona();
  if (!persona) return { error: "Create a persona first." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cast_override_vote", {
    p_persona: persona.id,
    p_action: actionId,
    p_vote: choice,
  });
  if (error) return { error: error.message };
  revalidatePath(path);
  return { status: data as string };
}

// ============================================================ moderation (human)

export async function resolveFlag(formData: FormData) {
  const slug = String(formData.get("slug"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_flag", {
    p_action: String(formData.get("action_id")),
    p_disposition: "reviewed",
  });
  if (error) fail(`/r/${slug}/agent`, error.message);
  revalidatePath(`/r/${slug}/agent`);
  redirect(`/r/${slug}/agent`);
}

export async function banPersona(formData: FormData) {
  const slug = String(formData.get("slug"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ban_persona_from_room", {
    p_room: String(formData.get("room_id")),
    p_persona: String(formData.get("persona_id")),
    p_reason: String(formData.get("reason") ?? "Moderator action"),
  });
  if (error) fail(`/r/${slug}/agent`, error.message);
  revalidatePath(`/r/${slug}/agent`);
  redirect(`/r/${slug}/agent`);
}

// ============================================================ user reporting

export async function createReport(formData: FormData) {
  const persona = await getActivePersona();
  const backTo = String(formData.get("back_to") || "/");
  if (!persona) fail(backTo, "Create a persona first.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_report", {
    p_persona: persona.id,
    p_target_type: String(formData.get("target_type")),
    p_target_id: String(formData.get("target_id")),
    p_category: String(formData.get("category") ?? "other"),
    p_reason: String(formData.get("reason") ?? "").trim().slice(0, 500),
  });
  if (error) fail(backTo, error.message);
  redirect(`${backTo}?notice=${encodeURIComponent("Reported. Thank you — a moderator will review it.")}`);
}

// ============================================================ content deletion (owner)

export async function deletePost(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_post", {
    p_post: String(formData.get("post_id")),
  });
  if (error) fail(`/post/${formData.get("post_id")}`, error.message);
  // After deletion the post is removed; bounce to its Room (or home).
  const roomSlug = String(formData.get("room_slug") || "");
  revalidatePath("/");
  redirect(roomSlug ? `/r/${roomSlug}` : "/");
}

export async function deleteComment(formData: FormData) {
  const postId = String(formData.get("post_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_comment", {
    p_comment: String(formData.get("comment_id")),
  });
  if (error) fail(`/post/${postId}`, error.message);
  revalidatePath(`/post/${postId}`);
  redirect(`/post/${postId}`);
}

// ============================================================ notifications (T3#11)

export async function markNotificationsRead() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read");
  if (error) fail("/notifications", error.message);
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  redirect("/notifications");
}

// ============================================================ avatars (Storage)

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024;

function avatarExt(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName) return fromName;
  return file.type.split("/")[1] ?? "png";
}

// Upload an optional post image to the `post-images` bucket under the posting
// persona's folder and return its public URL (null when no file was chosen).
// Mirrors the avatar upload path; on any failure it redirects via `fail`.
async function uploadPostImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personaId: string,
  formData: FormData,
  back: string
): Promise<string | null> {
  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return null;
  if (file.size > MAX_POST_IMAGE_BYTES) fail(back, "Image must be under 5MB.");
  if (!file.type.startsWith("image/")) fail(back, "Attachment must be an image.");

  const path = `${personaId}/${crypto.randomUUID()}.${avatarExt(file)}`;
  const { error: upErr } = await supabase.storage
    .from("post-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) fail(back, upErr.message);

  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
  return pub.publicUrl;
}

export async function uploadPersonaAvatar(formData: FormData) {
  const personaId = String(formData.get("persona_id"));
  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) fail("/me", "Choose an image first.");
  if (file.size > MAX_AVATAR_BYTES) fail("/me", "Image must be under 3MB.");
  if (!file.type.startsWith("image/")) fail("/me", "File must be an image.");

  const supabase = await createClient();
  const path = `${personaId}/${crypto.randomUUID()}.${avatarExt(file)}`;

  const { error: upErr } = await supabase.storage
    .from("persona-avatars")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) fail("/me", upErr.message);

  const { data: pub } = supabase.storage.from("persona-avatars").getPublicUrl(path);
  const { error } = await supabase.rpc("set_persona_avatar", {
    p_persona: personaId,
    p_avatar_url: pub.publicUrl,
  });
  if (error) fail("/me", error.message);
  revalidatePath("/", "layout");
  redirect("/me");
}

export async function uploadRoomAvatar(formData: FormData) {
  const roomId = String(formData.get("room_id"));
  const returnTo = String(formData.get("return_to") || `/r/${formData.get("slug")}/agent`);
  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) fail(returnTo, "Choose an image first.");
  if (file.size > MAX_AVATAR_BYTES) fail(returnTo, "Image must be under 3MB.");
  if (!file.type.startsWith("image/")) fail(returnTo, "File must be an image.");

  const supabase = await createClient();
  const path = `${roomId}/${crypto.randomUUID()}.${avatarExt(file)}`;

  const { error: upErr } = await supabase.storage
    .from("room-avatars")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) fail(returnTo, upErr.message);

  const { data: pub } = supabase.storage.from("room-avatars").getPublicUrl(path);
  const { error } = await supabase.rpc("set_room_avatar", {
    p_room: roomId,
    p_avatar_url: pub.publicUrl,
  });
  if (error) fail(returnTo, error.message);
  revalidatePath(returnTo);
  revalidatePath("/");
  redirect(returnTo);
}
