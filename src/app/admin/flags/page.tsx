import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonaMap } from "@/lib/data";
import {
  adminResolveFlag,
  adminBanFromFlag,
  adminResolveReport,
  adminRemovePost,
  adminRemoveComment,
} from "@/lib/admin-actions";
import Banner from "@/components/Banner";
import type { AgentAction, Report } from "@/lib/types";

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

  // User reports (T1#2) — same queue, second section.
  const { data: reportRows } = await supabase.rpc("admin_list_reports", { p_status: "open" });
  const reports = (reportRows ?? []) as unknown as Report[];

  // Fetch the reported content for preview + author resolution.
  const reportedCommentIds = reports
    .filter((r) => r.target_type === "comment")
    .map((r) => r.target_id);
  const reportedPostIds = reports
    .filter((r) => r.target_type === "post")
    .map((r) => r.target_id);
  const [{ data: reportedComments }, { data: reportedPosts }] = await Promise.all([
    reportedCommentIds.length
      ? supabase.from("comments").select("id, body, author_persona_id, post_id").in("id", reportedCommentIds)
      : Promise.resolve({ data: [] }),
    reportedPostIds.length
      ? supabase.from("posts").select("id, title, body, author_persona_id").in("id", reportedPostIds)
      : Promise.resolve({ data: [] }),
  ]);
  const reportedCommentMap = new Map((reportedComments ?? []).map((c) => [c.id, c]));
  const reportedPostMap = new Map((reportedPosts ?? []).map((p) => [p.id, p]));
  const reportedPersonaIds = [
    ...(reportedComments ?? []).map((c) => c.author_persona_id),
    ...(reportedPosts ?? []).map((p) => p.author_persona_id),
    ...reports.map((r) => r.reporter_persona_id),
  ];
  const reportPersonaMap = await fetchPersonaMap(supabase, reportedPersonaIds);

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

      {reports.length > 0 && (
        <>
          <h2 className="pt-4 text-lg font-bold">
            📢 User reports ({reports.length})
          </h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Reports filed by members. One report per root per target — deduped
            like votes.
          </p>
          {reports.map((r) => {
            const c = r.target_type === "comment" ? reportedCommentMap.get(r.target_id) : undefined;
            const p = r.target_type === "post" ? reportedPostMap.get(r.target_id) : undefined;
            const author = c
              ? reportPersonaMap.get(c.author_persona_id)
              : p
                ? reportPersonaMap.get(p.author_persona_id)
                : undefined;
            const reporter = reportPersonaMap.get(r.reporter_persona_id);
            return (
              <div key={r.id} className="panel p-4">
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  r/{r.room_slug} · {r.category} · {new Date(r.created_at).toLocaleString()}
                </div>
                {r.reason && (
                  <p className="mt-1 text-xs italic" style={{ color: "var(--muted)" }}>
                    “{r.reason.slice(0, 200)}”
                  </p>
                )}
                {(c || p) && (
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    {p && <span>post “{p.title.slice(0, 100)}” — </span>}
                    {c && <span>“{c.body.slice(0, 160)}” — </span>}
                    @{author?.handle ?? "?"} · reported by @{reporter?.handle ?? "?"}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {((p?.id) || (c?.id)) && (
                    <Link
                      href={p ? `/post/${p.id}` : c ? `/post/${c.post_id ?? ""}` : "#"}
                      className="btn !py-1 text-xs"
                    >
                      View
                    </Link>
                  )}
                  <form action={adminResolveReport}>
                    <input type="hidden" name="report_id" value={r.id} />
                    <input type="hidden" name="disposition" value="reviewed" />
                    <button className="btn !py-1 text-xs">Mark reviewed</button>
                  </form>
                  <form action={adminResolveReport}>
                    <input type="hidden" name="report_id" value={r.id} />
                    <input type="hidden" name="disposition" value="dismissed" />
                    <button className="btn !py-1 text-xs">Dismiss</button>
                  </form>
                  {p && (
                    <form action={adminRemovePost}>
                      <input type="hidden" name="post_id" value={p.id} />
                      <button className="btn btn-danger !py-1 text-xs">Remove post</button>
                    </form>
                  )}
                  {c && (
                    <form action={adminRemoveComment}>
                      <input type="hidden" name="comment_id" value={c.id} />
                      <button className="btn btn-danger !py-1 text-xs">Remove comment</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
