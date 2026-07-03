import type { SupabaseClient } from "@supabase/supabase-js";
import type { Persona } from "@/lib/types";

/**
 * Batch-fetch public persona profiles (via personas_public — the view with
 * no root column) and return them keyed by id. This is the ONLY way other
 * users' personas are ever read.
 */
export async function fetchPersonaMap(
  supabase: SupabaseClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, Persona>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("personas_public")
    .select("*")
    .in("id", unique);
  return new Map((data ?? []).map((p: Persona) => [p.id, p]));
}

/** Ids of the caller's own personas — used to mark "this is one of your masks". */
export async function myPersonaIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("personas").select("id");
  return new Set((data ?? []).map((p: { id: string }) => p.id));
}
