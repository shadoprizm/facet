import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { myPersonaIds } from "@/lib/data";
import { SITE_URL } from "@/lib/i18n/landing";
import { PersonaAvatar } from "@/components/Avatar";
import Banner from "@/components/Banner";
import type { Persona, Post, Comment } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: persona } = await supabase
    .from("personas_public")
    .select("handle, display_name, bio, karma")
    .eq("handle", handle.toLowerCase())
    .single();

  if (!persona) return { title: "Persona not found" };

  const title = `${persona.display_name} (@${persona.handle}) — Facet`;
  const description =
    persona.bio ||
    `@${persona.handle} on Facet — ${persona.karma} karma. A persona, not an account: Facet never reveals which root operates it.`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/p/${persona.handle}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/p/${persona.handle}`,
      type: "profile",
    },
  };
}

/**
 * Public persona profile. Deliberately built ONLY from personas_public and
 * this persona's own content — there is no path from here to the root or to
 * sibling personas.
 */
export default async function PersonaPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { handle } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: persona } = await supabase
    .from("personas_public")
    .select("*")
    .eq("handle", handle.toLowerCase())
    .single();
  if (!persona) notFound();
  const p = persona as Persona;

  const [{ data: posts }, { data: comments }, mine] = await Promise.all([
    supabase
      .from("posts")
      .select("*, rooms(slug, name)")
      .eq("author_persona_id", p.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("comments")
      .select("*")
      .eq("author_persona_id", p.id)
      .order("created_at", { ascending: false })
      .limit(20),
    myPersonaIds(supabase),
  ]);

  return (
    <div className="space-y-6">
      <Banner error={sp.error} />
      <div className="panel flex items-center gap-4 p-6">
        <PersonaAvatar avatarUrl={p.avatar_url} avatarColor={p.avatar_color} size={56} />
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xl font-bold">
            {p.display_name}
            {p.status === "retired" && <span className="chip">retired</span>}
            {mine.has(p.id) && (
              <span className="chip chip-accent">
                one of your masks
              </span>
            )}
          </div>
          <div className="text-[var(--muted)]">
            @{p.handle} · {p.karma} karma · since {new Date(p.created_at).toLocaleDateString()}
          </div>
          {p.bio && <p className="mt-1 text-sm">{p.bio}</p>}
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        This is a persona. Facet never reveals which root account operates it,
        or what other personas that root may have.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-bold text-[var(--muted)]">
            POSTS
          </h2>
          <div className="space-y-2">
            {(posts ?? []).map((post: Post & { rooms: { slug: string; name: string } }) => (
              <Link key={post.id} href={`/post/${post.id}`} className="panel block p-3 hover:brightness-125">
                <div className="text-sm font-semibold">{post.title}</div>
                <div className="text-xs text-[var(--muted)]">
                  in r/{post.rooms?.slug} · {post.score} points · {post.comment_count} comments
                </div>
              </Link>
            ))}
            {(posts ?? []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Nothing yet.
              </p>
            )}
          </div>
        </div>
        <div>
          <h2 className="mb-2 font-bold text-[var(--muted)]">
            COMMENTS
          </h2>
          <div className="space-y-2">
            {(comments ?? []).map((c: Comment) => (
              <Link key={c.id} href={`/post/${c.post_id}`} className="panel block p-3 hover:brightness-125">
                <div className="line-clamp-2 text-sm">{c.body}</div>
                <div className="text-xs text-[var(--muted)]">
                  {c.score} points · {new Date(c.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
            {(comments ?? []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Nothing yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
