import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonaMap, myPersonaIds } from "@/lib/data";
import { isSignedIn, listMyPersonas } from "@/lib/persona";
import { SITE_URL } from "@/lib/i18n/landing";
import { createComment, crosspost, deletePost } from "@/lib/actions";
import PersonaBadge from "@/components/PersonaBadge";
import VoteButtons from "@/components/VoteButtons";
import AgentActionCard from "@/components/AgentActionCard";
import CommentNode, { type ThreadContext } from "@/components/CommentNode";
import ReportButton from "@/components/ReportButton";
import ConfirmButton from "@/components/ConfirmButton";
import Banner from "@/components/Banner";
import type { AgentAction, Comment, Post, Room } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select("title, body, status, rooms(slug, name)")
    .eq("id", id)
    .single();

  if (!post || post.status !== "active") return { title: "Post not found" };

  const room = post.rooms as unknown as { slug: string; name: string } | null;
  const description =
    (post.body || "").replace(/\s+/g, " ").trim().slice(0, 160) ||
    `A discussion in r/${room?.slug ?? "facet"} on Facet.`;

  return {
    title: room ? `${post.title} — r/${room.slug}` : post.title,
    description,
    alternates: { canonical: `${SITE_URL}/post/${id}` },
    openGraph: {
      title: post.title,
      description,
      url: `${SITE_URL}/post/${id}`,
      type: "article",
    },
  };
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: post } = await supabase
    .from("posts")
    .select(
      "*, rooms(id, slug, name, description, constitution, agent_config, created_by_persona_id, created_at, avatar_url, removed_at)",
    )
    .eq("id", id)
    .single();
  if (!post) notFound();
  const p = post as Post & { rooms: Room };
  const path = `/post/${id}`;

  const signedIn = await isSignedIn();

  // votes / override_votes carry the caller's root id and are granted to
  // `authenticated` only — anon has no privilege, so skip rather than error.
  const [{ data: comments }, { data: actions }, { data: votes }, myPersonas, { data: rooms }] =
    await Promise.all([
      supabase
        .from("comments")
        .select("*")
        .eq("post_id", id)
        .order("created_at"),
      supabase
        .from("agent_actions")
        .select("*")
        .eq("post_id", id)
        .order("created_at"),
      signedIn
        ? supabase.from("votes").select("target_type, target_id, value")
        : Promise.resolve({ data: [] as { target_type: string; target_id: string; value: number }[] }),
      listMyPersonas(),
      supabase.from("rooms_public").select("id, slug, name").order("slug"),
    ]);

  const actionIds = (actions ?? []).map((a) => a.id);
  const { data: myOverrideRows } = signedIn && actionIds.length
    ? await supabase.from("override_votes").select("action_id, vote").in("action_id", actionIds)
    : { data: [] };

  const [personaMap, mine] = await Promise.all([
    fetchPersonaMap(supabase, [
      p.author_persona_id,
      ...(comments ?? []).map((c) => c.author_persona_id),
    ]),
    myPersonaIds(supabase),
  ]);

  const childrenMap = new Map<string | null, Comment[]>();
  for (const c of (comments ?? []) as Comment[]) {
    const key = c.parent_comment_id;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(c);
  }

  const actionsByTarget = new Map<string, AgentAction[]>();
  const threadActions: AgentAction[] = [];
  for (const a of (actions ?? []) as AgentAction[]) {
    if (a.target_type === "comment" && a.target_id) {
      if (!actionsByTarget.has(a.target_id)) actionsByTarget.set(a.target_id, []);
      actionsByTarget.get(a.target_id)!.push(a);
    } else {
      threadActions.push(a);
    }
  }

  const ctx: ThreadContext = {
    postId: id,
    path,
    childrenMap,
    personaMap,
    mine,
    myVotes: new Map((votes ?? []).map((v) => [`${v.target_type}:${v.target_id}`, v.value])),
    actionsByTarget,
    myOverrides: new Map((myOverrideRows ?? []).map((o) => [o.action_id, o.vote])),
    signedIn,
  };

  const iAmAuthor = mine.has(p.author_persona_id);
  const otherPersonas = myPersonas.filter(
    (mp) => mp.status === "active" && mp.id !== p.author_persona_id
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Banner error={sp.error} notice={sp.notice} />

      <div className="panel p-5">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Link href={`/r/${p.rooms.slug}`} className="font-bold hover:underline text-[var(--accent)]">
            r/{p.rooms.slug}
          </Link>
          · <PersonaBadge persona={personaMap.get(p.author_persona_id)} mine={iAmAuthor} />
          {p.crossposted_from_post_id && (
            <Link href={`/post/${p.crossposted_from_post_id}`} className="chip hover:underline">
              cross-posted
            </Link>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{p.title}</h1>
        {p.body && <p className="mt-2 whitespace-pre-wrap text-sm">{p.body}</p>}
        {p.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image_url}
            alt=""
            className="mt-3 max-h-[32rem] w-auto max-w-full rounded-lg border border-[var(--border)]"
          />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <VoteButtons
            targetType="post"
            targetId={p.id}
            score={p.score}
            myVote={ctx.myVotes.get(`post:${p.id}`) ?? 0}
            path={path}
            signedIn={signedIn}
          />
          <span className="text-xs text-[var(--muted)]">
            {p.comment_count} comments
          </span>
          {signedIn &&
            (iAmAuthor && p.status === "active" ? (
              <form action={deletePost}>
                <input type="hidden" name="post_id" value={p.id} />
                <input type="hidden" name="room_slug" value={p.rooms.slug} />
                <ConfirmButton
                  label="Delete post"
                  title="Removes your post permanently (karma already earned stays)."
                  confirmMessage="Delete this post? It will be replaced with '[removed]' and cannot be undone."
                />
              </form>
            ) : (
              <ReportButton targetType="post" targetId={p.id} backTo={path} />
            ))}
        </div>

        {iAmAuthor && otherPersonas.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--accent)]">
              Cross-post this with another of your personas
            </summary>
            <form action={crosspost} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="source_post_id" value={p.id} />
              <select name="persona_id" className="input !w-auto">
                {otherPersonas.map((mp) => (
                  <option key={mp.id} value={mp.id}>
                    as {mp.display_name} (@{mp.handle})
                  </option>
                ))}
              </select>
              <select name="room_id" className="input !w-auto">
                {(rooms ?? []).map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    to r/{rm.slug}
                  </option>
                ))}
              </select>
              <button className="btn !py-1 text-xs">Cross-post</button>
              <span className="w-full text-xs text-[var(--muted)]">
                The community will see the new post under that mask, labelled as a cross-post — but never that both masks are you.
              </span>
            </form>
          </details>
        )}
      </div>

      {threadActions.map((a) => (
        <AgentActionCard
          key={a.id}
          action={a}
          myVote={ctx.myOverrides.get(a.id) ?? null}
          path={path}
          signedIn={signedIn}
        />
      ))}

      {signedIn ? (
        <form action={createComment} className="panel space-y-2 p-4">
          <input type="hidden" name="post_id" value={id} />
          <textarea className="input" name="body" rows={3} placeholder="Join the thread as your active persona…" required />
          <div className="space-y-1">
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="block w-full text-xs"
            />
            <p className="text-xs text-[var(--muted)]">
              Attach an image or GIF (optional) — PNG/JPEG/WebP/GIF, up to 5MB.
            </p>
          </div>
          <button className="btn btn-primary">Comment</button>
        </form>
      ) : (
        <div className="panel space-y-2 p-4">
          <p className="text-sm font-semibold">Join the conversation</p>
          <p className="text-sm text-[var(--muted)]">
            Facet is free to read. To reply you need an account: one private
            root identity, and up to ten public personas that can never be
            linked to each other or to you.
          </p>
          <Link href="/login" className="btn btn-primary inline-block">
            Create an account
          </Link>
        </div>
      )}

      <div>
        {(childrenMap.get(null) ?? []).map((c) => (
          <CommentNode key={c.id} comment={c} ctx={ctx} depth={0} />
        ))}
      </div>
    </div>
  );
}
