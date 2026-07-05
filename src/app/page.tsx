import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonaMap, myPersonaIds } from "@/lib/data";
import { getActivePersona } from "@/lib/persona";
import PersonaBadge from "@/components/PersonaBadge";
import { RoomAvatar } from "@/components/Avatar";
import Banner from "@/components/Banner";
import Landing from "@/components/Landing";
import { DEFAULT_LOCALE } from "@/lib/i18n/landing";
import type { Post, Room } from "@/lib/types";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Logged-out visitors (and crawlers) get the public landing page.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <Landing copy={DEFAULT_LOCALE} />;

  const active = await getActivePersona();

  const [{ data: rooms }, { data: posts }, { data: counts }] = await Promise.all([
    supabase.from("rooms").select("*").order("created_at", { ascending: false }).limit(30),
    supabase
      .from("posts")
      .select("*, rooms(slug, name)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("room_subscriber_counts").select("*"),
  ]);

  const countMap = new Map((counts ?? []).map((c) => [c.room_id, c.subscribers]));
  const [personaMap, mine] = await Promise.all([
    fetchPersonaMap(supabase, (posts ?? []).map((p) => p.author_persona_id)),
    myPersonaIds(supabase),
  ]);

  const subscribedRoomIds = new Set<string>();
  if (active) {
    const { data: subs } = await supabase
      .from("room_subscriptions")
      .select("room_id")
      .eq("persona_id", active.id);
    (subs ?? []).forEach((s) => subscribedRoomIds.add(s.room_id));
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_280px]">
      <div>
        <Banner error={params.error} notice={params.notice} />
        <h1 className="mb-3 text-lg font-bold">Latest across Facet</h1>
        <div className="space-y-3">
          {(posts ?? []).map((post: Post & { rooms: Pick<Room, "slug" | "name"> }) => (
            <div key={post.id} className="panel p-4">
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <Link href={`/r/${post.rooms?.slug}`} className="font-bold hover:underline" style={{ color: "var(--accent)" }}>
                  r/{post.rooms?.slug}
                </Link>
                · <PersonaBadge persona={personaMap.get(post.author_persona_id)} mine={mine.has(post.author_persona_id)} />
                {post.crossposted_from_post_id && <span className="chip">cross-post</span>}
              </div>
              <Link href={`/post/${post.id}`} className="mt-1 block font-semibold hover:underline">
                {post.title}
              </Link>
              <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {post.score} points · {post.comment_count} comments · {new Date(post.created_at).toLocaleString()}
              </div>
            </div>
          ))}
          {(posts ?? []).length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nothing here yet. Create a Room and start the first thread.
            </p>
          )}
        </div>
      </div>

      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold" style={{ color: "var(--muted)" }}>
            ROOMS
          </h2>
          <Link href="/rooms/new" className="text-sm" style={{ color: "var(--accent)" }}>
            + create
          </Link>
        </div>
        {(rooms ?? []).map((room: Room) => (
          <Link key={room.id} href={`/r/${room.slug}`} className="panel flex items-center gap-2 p-3 hover:brightness-125">
            <RoomAvatar avatarUrl={room.avatar_url} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold">
                r/{room.slug}
                {subscribedRoomIds.has(room.id) && (
                  <span className="chip" style={{ color: "var(--good)", borderColor: "var(--good)" }}>
                    joined
                  </span>
                )}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {room.name} · {countMap.get(room.id) ?? 0} subscriber{(countMap.get(room.id) ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
          </Link>
        ))}
      </aside>
    </div>
  );
}
