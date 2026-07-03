import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonaMap, myPersonaIds } from "@/lib/data";
import { getActivePersona } from "@/lib/persona";
import { toggleSubscribe } from "@/lib/actions";
import PersonaBadge from "@/components/PersonaBadge";
import Banner from "@/components/Banner";
import type { Post, Room } from "@/lib/types";

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

  const { data: room } = await supabase.from("rooms").select("*").eq("slug", slug).single();
  if (!room) notFound();
  const r = room as Room;

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
          <div className="flex-1">
            <h1 className="text-xl font-bold">r/{r.slug}</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {r.name} — {r.description}
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              {countRow?.subscribers ?? 0} subscribers · founded {new Date(r.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
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
            <Link href={`/r/${r.slug}/agent`} className="btn" title="Agent moderator log & constitution">
              🤖 Agent
            </Link>
          </div>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Subscriptions belong to personas, not accounts — you joined (or will
          join) this Room as a specific mask.
        </p>
      </div>

      <div className="space-y-3">
        {(posts ?? []).map((post: Post) => (
          <div key={post.id} className="panel p-4">
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
              <PersonaBadge persona={personaMap.get(post.author_persona_id)} mine={mine.has(post.author_persona_id)} />
              {post.crossposted_from_post_id && <span className="chip">cross-post</span>}
              · {new Date(post.created_at).toLocaleString()}
            </div>
            <Link href={`/post/${post.id}`} className="mt-1 block font-semibold hover:underline">
              {post.title}
            </Link>
            <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              {post.score} points · {post.comment_count} comments
            </div>
          </div>
        ))}
        {(posts ?? []).length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No posts yet. Be the first voice in this Room.
          </p>
        )}
      </div>
    </div>
  );
}
