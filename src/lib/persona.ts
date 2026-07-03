import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Persona } from "@/lib/types";

export const ACTIVE_PERSONA_COOKIE = "facet_persona";

/** All personas belonging to the signed-in root (RLS restricts to own rows). */
export async function listMyPersonas(): Promise<Persona[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personas")
    .select("id, handle, display_name, avatar_color, bio, karma, status, created_at")
    .order("created_at");
  return (data ?? []) as Persona[];
}

/**
 * The persona the user is currently "wearing". Falls back to the first
 * active persona if the cookie is missing or points at a retired/foreign one.
 */
export async function getActivePersona(): Promise<Persona | null> {
  const personas = await listMyPersonas();
  const active = personas.filter((p) => p.status === "active");
  if (active.length === 0) return null;

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_PERSONA_COOKIE)?.value;
  return active.find((p) => p.id === wanted) ?? active[0];
}
