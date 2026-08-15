import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonaMap, myPersonaIds } from "@/lib/data";
import { getActivePersona, isSignedIn } from "@/lib/persona";
import { toggleSubscribe } from "@/lib/actions";
import { SITE_URL } from "@/lib/i18n/landing";
import PersonaBadge from "@/components/PersonaBadge";
import { RoomAvatar } from "@/components/Avatar";
import Banner from "@/components/Banner";
import type { Post, Room } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: room } = await supabase
    .from("rooms_public")
    .select("slug, name, description")
    .eq("slug", slug)
    .single();

  if (!room) return { title: "Room not found" };

  const title = `r/${room.slug} — ${room.name}`;
  const description =
    room.description ||
    `${room.name} on Facet — a community moderated by an agent its members govern.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/r/${room.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/r/${room.slug}`,
      type: "website",
    },
  };
}

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: room } = await supabase
    .from("rooms_public")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!room) notFound();
  const r = room as Room;

  const signedIn = await isSignedIn();
  const active = await getActivePersona();

  const [{ data: posts }, { data: countRow }] = await Promise.all([
    supabase
      .from("posts")
      .select("*")
      .eq("room_id", r.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("room_subscriber_counts").select("subscribers").eq("room_id", r.id).maybeSingle(),
  ]);

  let subscribed = false;
  if (active) {
    const { data: sub } = await supabase
      .from("room_subscriptions")
      .select("room_id")
      .eq("persona_id", active.id)
      .eq("room_id", r.id)
      .maybeSingle();
    subscribed = !!sub;
  }

  const [personaMap, mine] = await Promise.all([
    fetchPersonaMap(supabase, (posts ?? []).map((p) => p.author_persona_id)),
    myPersonaIds(supabase),
  ]);

  return (
    <div className="space-y-4">
      <Banner error={sp.error} />
      <div className="panel p-5">
        <div className="flex flex-wrap items-center gap-3">
          <RoomAvatar avatarUrl={r.avatar_url} size={48} />
          <div className="flex-1">
            <h1 className="text-xl font-bold">r/{r.slug}</h1>
            <p className="text-sm text-[var(--muted)]">
              {r.name} — {r.description}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {countRow?.subscribers ?? 0} subscribers · founded {new Date(r.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            {signedIn ? (
              <>
                <form action={toggleSubscribe}>
                  <input type="hidden" name="room_id" value={r.id} />
                  <input type="hidden" name="slug" value={r.slug} />
                  <input type="hidden" name="subscribed" value={String(subscribed)} />
                  <button className={`btn ${subscribed ? "" : "btn-primary"}`}>
                    {subscribed
                      ? `Leave as ${active?.display_name ?? ""}`
                      : `Join as ${active?.display_name ?? "…"}`}
                  </button>
                </form>
                <Link href={`/r/${r.slug}/submit`} className="btn">
                  + Post
                </Link>
              </>
            ) : (
              <Link href="/login" className="btn btn-primary">
                Join to post
              </Link>
            )}
            <Link href={`/r/${r.slug}/agent`} className="btn" title="Agent moderator log & constitution">
              🤖 Agent
            </Link>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {signedIn
            ? "Subscriptions belong to personas, not accounts — you joined (or will join) this Room as a specific mask."
            : "Anyone can read Facet. To post or vote you need a free account — you get one private root identity and up to ten unlinkable personas."}
        </p>
      </div>

      <div className="space-y-3">
        {(posts ?? []).map((post: Post) => (
          <div key={post.id} className="panel p-4">
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <PersonaBadge persona={personaMap.get(post.author_persona_id)} mine={mine.has(post.author_persona_id)} />
              {post.crossposted_from_post_id && <span className="chip">cross-post</span>}
              · {new Date(post.created_at).toLocaleString()}
            </div>
            <Link href={`/post/${post.id}`} className="mt-1 block font-semibold hover:underline">
              {post.title}
            </Link>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {post.score} points · {post.comment_count} comments
            </div>
          </div>
        ))}
        {(posts ?? []).length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No posts yet. Be the first voice in this Room.
          </p>
        )}
      </div>
    </div>
  );
}
