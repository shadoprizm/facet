import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonaMap } from "@/lib/data";
import { adminResolveFlag, adminBanFromFlag } from "@/lib/admin-actions";
import Banner from "@/components/Banner";
import type { AgentAction } from "@/lib/types";

type FlagRow = AgentAction & { rooms: { slug: string; name: string } | null };

export default async function AdminFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: flags } = await supabase
    .from("agent_actions")
    .select("*, rooms(slug, name)")
    .eq("action_type", "flag")
    .eq("review_status", "open")
    .order("created_at", { ascending: false });

  const rows = (flags ?? []) as unknown as FlagRow[];

  const commentIds = rows
    .filter((f) => f.target_type === "comment" && f.target_id)
    .map((f) => f.target_id as string);
  const { data: comments } = commentIds.length
    ? await supabase
        .from("comments")
        .select("id, body, author_persona_id, room_id")
        .in("id", commentIds)
    : { data: [] };
  const commentMap = new Map((comments ?? []).map((c) => [c.id, c]));
  const personaMap = await fetchPersonaMap(supabase, (comments ?? []).map((c) => c.author_persona_id));

  return (
    <div className="space-y-4">
      <Banner error={sp.error} />
      <h1 className="text-xl font-bold">🚩 Global flag queue</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Every Room's agent escalations, in one place — no need to hunt through
        each Room's own agent page.
      </p>
      {rows.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Nothing pending review.
        </p>
      )}
      {rows.map((a) => {
        const c = a.target_id ? commentMap.get(a.target_id) : undefined;
        const author = c ? personaMap.get(c.author_persona_id) : undefined;
        return (
          <div key={a.id} className="panel p-4">
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              r/{a.rooms?.slug ?? "?"} · {new Date(a.created_at).toLocaleString()}
            </div>
            <p className="mt-1 text-sm">{a.reason}</p>
            {c && (
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                &ldquo;{c.body.slice(0, 160)}&rdquo; — @{author?.handle ?? "?"}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {a.post_id && (
                <Link href={`/post/${a.post_id}`} className="btn !py-1 text-xs">
                  View thread
                </Link>
              )}
              <form action={adminResolveFlag}>
                <input type="hidden" name="action_id" value={a.id} />
                <button className="btn !py-1 text-xs">Mark reviewed</button>
              </form>
              {c && (
                <form action={adminBanFromFlag}>
                  <input type="hidden" name="room_id" value={a.room_id} />
                  <input type="hidden" name="persona_id" value={c.author_persona_id} />
                  <input type="hidden" name="reason" value="Flagged by agent, confirmed by admin" />
                  <button
                    className="btn btn-danger !py-1 text-xs"
                    title="Bans the root behind this persona from this Room only"
                  >
                    Ban root from this Room
                  </button>
                </form>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
