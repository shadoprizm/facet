import type { SupabaseClient } from "@supabase/supabase-js";
import type { Persona, Room } from "@/lib/types";

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

/**
 * Strip the control characters PostgREST uses to parse an `or()` filter
 * (commas separate conditions, parens group them) so a raw search string
 * can never break out of the pattern it's meant to be.
 */
function ilikeTerm(q: string): string {
  return q.replace(/[,()%\\]/g, " ").trim().slice(0, 64);
}

export type RoomSearchResult = Room & { subscribers: number };

/** Rooms matching a query across slug, name, and description. */
export async function searchRooms(
  supabase: SupabaseClient,
  q: string
): Promise<RoomSearchResult[]> {
  const term = ilikeTerm(q);
  if (!term) return [];
  const pat = `%${term}%`;
  const { data } = await supabase
    .from("rooms")
    .select("*")
    .or(`slug.ilike.${pat},name.ilike.${pat},description.ilike.${pat}`)
    .order("created_at", { ascending: false })
    .limit(25);
  const rooms = (data ?? []) as Room[];
  if (rooms.length === 0) return [];

  const { data: counts } = await supabase
    .from("room_subscriber_counts")
    .select("*")
    .in("room_id", rooms.map((r) => r.id));
  const countMap = new Map((counts ?? []).map((c) => [c.room_id, c.subscribers]));
  return rooms.map((r) => ({ ...r, subscribers: countMap.get(r.id) ?? 0 }));
}

/** Active personas (facets) matching a query across handle and display name. */
export async function searchPersonas(
  supabase: SupabaseClient,
  q: string
): Promise<Persona[]> {
  const term = ilikeTerm(q);
  if (!term) return [];
  const pat = `%${term}%`;
  const { data } = await supabase
    .from("personas_public")
    .select("*")
    .eq("status", "active")
    .or(`handle.ilike.${pat},display_name.ilike.${pat}`)
    .order("karma", { ascending: false })
    .limit(25);
  return (data ?? []) as Persona[];
}

export type RoomMembership = {
  room: Room;
  subscribers: number;
  /** Which of the caller's own facets are subscribed to this Room. */
  facets: Persona[];
};

/**
 * Every Room the signed-in root belongs to through ANY of its personas, with
 * the specific facet(s) that joined each. Aggregates across masks — unlike the
 * home sidebar, which only reflects the persona you're currently wearing.
 */
export async function myRoomMemberships(
  supabase: SupabaseClient
): Promise<RoomMembership[]> {
  const { data: personaRows } = await supabase
    .from("personas")
    .select("id, handle, display_name, avatar_color, avatar_url, bio, karma, status, created_at")
    .order("created_at");
  const mine = (personaRows ?? []) as Persona[];
  if (mine.length === 0) return [];
  const personaById = new Map(mine.map((p) => [p.id, p]));

  const { data: subs } = await supabase
    .from("room_subscriptions")
    .select("room_id, persona_id")
    .in("persona_id", mine.map((p) => p.id));
  if (!subs || subs.length === 0) return [];

  const roomIds = [...new Set(subs.map((s) => s.room_id))];
  const [{ data: rooms }, { data: counts }] = await Promise.all([
    supabase.from("rooms").select("*").in("id", roomIds),
    supabase.from("room_subscriber_counts").select("*").in("room_id", roomIds),
  ]);
  const roomById = new Map((rooms ?? []).map((r: Room) => [r.id, r]));
  const countMap = new Map((counts ?? []).map((c) => [c.room_id, c.subscribers]));

  const facetsByRoom = new Map<string, Persona[]>();
  for (const s of subs) {
    const p = personaById.get(s.persona_id);
    if (!p) continue;
    const arr = facetsByRoom.get(s.room_id) ?? [];
    arr.push(p);
    facetsByRoom.set(s.room_id, arr);
  }

  return roomIds
    .map((id) => {
      const room = roomById.get(id);
      if (!room) return null;
      return {
        room,
        subscribers: countMap.get(id) ?? 0,
        facets: facetsByRoom.get(id) ?? [],
      };
    })
    .filter((m): m is RoomMembership => m !== null)
    .sort((a, b) => b.subscribers - a.subscribers);
}
