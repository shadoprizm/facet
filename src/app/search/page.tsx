import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  myRoomMemberships,
  searchPersonas,
  searchRooms,
} from "@/lib/data";
import { getActivePersona } from "@/lib/persona";
import { PersonaAvatar, RoomAvatar } from "@/components/Avatar";
import Banner from "@/components/Banner";
import type { Persona } from "@/lib/types";

/** Compact avatar + name link for a facet, reused in results and memberships. */
function FacetChip({ p, mine = false }: { p: Persona; mine?: boolean }) {
  return (
    <Link
      href={`/p/${p.handle}`}
      className="chip hover:brightness-125"
      style={mine ? { color: "var(--good)", borderColor: "var(--good)" } : undefined}
    >
      <PersonaAvatar avatarUrl={p.avatar_url} avatarColor={p.avatar_color} size={14} />
      {p.display_name}
    </Link>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const { q, error } = await searchParams;
  const query = (q ?? "").trim();
  const supabase = await createClient();
  const active = await getActivePersona();

  const [memberships, rooms, personas] = await Promise.all([
    myRoomMemberships(supabase),
    query ? searchRooms(supabase, query) : Promise.resolve([]),
    query ? searchPersonas(supabase, query) : Promise.resolve([]),
  ]);

  const myRoomIds = new Set(memberships.map((m) => m.room.id));

  return (
    <div className="space-y-6">
      <Banner error={error} />
      <form action="/search" className="panel flex items-center gap-2 p-2">
        <span className="pl-2 text-lg" style={{ color: "var(--muted)" }}>
          ⌕
        </span>
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Search rooms and facets…"
          className="input !border-0 !bg-transparent"
          aria-label="Search Facet"
        />
        <button className="btn btn-primary">Search</button>
      </form>

      {query && (
        <div className="space-y-6">
          {/* -------------------------------------------------- rooms */}
          <section className="space-y-2">
            <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
              ROOMS ({rooms.length})
            </h2>
            {rooms.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No rooms match “{query}”.
              </p>
            )}
            {rooms.map((room) => (
              <Link
                key={room.id}
                href={`/r/${room.slug}`}
                className="panel flex items-center gap-3 p-3 hover:brightness-125"
              >
                <RoomAvatar avatarUrl={room.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    r/{room.slug}
                    {myRoomIds.has(room.id) && (
                      <span
                        className="chip"
                        style={{ color: "var(--good)", borderColor: "var(--good)" }}
                      >
                        joined
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs" style={{ color: "var(--muted)" }}>
                    {room.name}
                    {room.description ? ` · ${room.description}` : ""}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {room.subscribers} subscriber{room.subscribers === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            ))}
          </section>

          {/* -------------------------------------------------- facets */}
          <section className="space-y-2">
            <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
              FACETS ({personas.length})
            </h2>
            {personas.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No facets match “{query}”.
              </p>
            )}
            {personas.map((p) => (
              <Link
                key={p.id}
                href={`/p/${p.handle}`}
                className="panel flex items-center gap-3 p-3 hover:brightness-125"
              >
                <PersonaAvatar avatarUrl={p.avatar_url} avatarColor={p.avatar_color} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.display_name}</div>
                  <div className="truncate text-xs" style={{ color: "var(--muted)" }}>
                    @{p.handle} · {p.karma} karma
                    {p.bio ? ` · ${p.bio}` : ""}
                  </div>
                </div>
              </Link>
            ))}
          </section>
        </div>
      )}

      {/* ---------------------------------------------------- my communities */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: "var(--muted)" }}>
            YOUR ROOMS ({memberships.length})
          </h2>
          <Link href="/rooms/new" className="text-sm" style={{ color: "var(--accent)" }}>
            + create
          </Link>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Every Room you belong to across all your facets — subscriptions live on
          personas, not your account.
        </p>
        {memberships.length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            None of your facets have joined a Room yet. Search above or{" "}
            <Link href="/" className="hover:underline" style={{ color: "var(--accent)" }}>
              browse the latest
            </Link>
            .
          </p>
        )}
        {memberships.map(({ room, subscribers, facets }) => (
          <div key={room.id} className="panel p-3">
            <div className="flex items-center gap-3">
              <RoomAvatar avatarUrl={room.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <Link href={`/r/${room.slug}`} className="font-semibold hover:underline">
                  r/{room.slug}
                </Link>
                <div className="truncate text-xs" style={{ color: "var(--muted)" }}>
                  {room.name} · {subscribers} subscriber{subscribers === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                joined as
              </span>
              {facets.map((p) => (
                <FacetChip key={p.id} p={p} mine={p.id === active?.id} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
