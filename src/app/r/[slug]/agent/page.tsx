import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateConstitution, resolveFlag, banPersona, uploadRoomAvatar } from "@/lib/actions";
import { isPlatformAdmin } from "@/lib/admin";
import { fetchPersonaMap } from "@/lib/data";
import AgentActionCard from "@/components/AgentActionCard";
import { RoomAvatar } from "@/components/Avatar";
import Banner from "@/components/Banner";
import type { AgentAction, Calibration, Room } from "@/lib/types";

const PARAM_DEFAULTS: Array<{ key: keyof Calibration; label: string; def: number }> = [
  { key: "heat_nudge", label: "Heat → nudge", def: 0.55 },
  { key: "heat_collapse", label: "Heat → collapse", def: 0.8 },
  { key: "heat_flag", label: "Heat → human flag", def: 0.92 },
  { key: "drift_nudge", label: "Topic drift → nudge", def: 0.97 },
  { key: "dogpile_count", label: "Dogpile size → nudge", def: 3 },
];

export default async function AgentPage({
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
  const r = room as Room & { created_by_root: string };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isFounder = user?.id === r.created_by_root;
  const admin = await isPlatformAdmin();
  const canManage = isFounder || admin;

  const [{ data: cal }, { data: actions }] = await Promise.all([
    supabase.from("agent_calibration").select("*").eq("room_id", r.id).single(),
    supabase
      .from("agent_actions")
      .select("*")
      .eq("room_id", r.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const calibration = cal as Calibration;

  const actionIds = (actions ?? []).map((a) => a.id);
  const { data: myOverrideRows } = actionIds.length
    ? await supabase.from("override_votes").select("action_id, vote").in("action_id", actionIds)
    : { data: [] };
  const myOverrides = new Map((myOverrideRows ?? []).map((o) => [o.action_id, o.vote]));

  const flagged = ((actions ?? []) as AgentAction[]).filter(
    (a) => a.action_type === "flag" && a.review_status === "open"
  );

  // For flags on comments, look up the author so the founder can act on it.
  const flaggedCommentIds = flagged
    .filter((a) => a.target_type === "comment" && a.target_id)
    .map((a) => a.target_id as string);
  const { data: flaggedComments } = flaggedCommentIds.length
    ? await supabase.from("comments").select("id, body, author_persona_id").in("id", flaggedCommentIds)
    : { data: [] };
  const flaggedCommentMap = new Map((flaggedComments ?? []).map((c) => [c.id, c]));
  const personaMap = await fetchPersonaMap(
    supabase,
    (flaggedComments ?? []).map((c) => c.author_persona_id)
  );

  const history = [...(calibration?.history ?? [])].reverse().slice(0, 12);

  return (
    <div className="space-y-6">
      <Banner error={sp.error} />
      <div className="flex items-start gap-3">
        <RoomAvatar avatarUrl={r.avatar_url} size={40} />
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            🤖 Agent Moderator — <Link href={`/r/${slug}`} className="hover:underline" style={{ color: "var(--accent)" }}>r/{slug}</Link>
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            This agent reads every post and comment against the Room's
            constitution. Every action it takes is voteable; overrides move the
            thresholds below. It never bans — hard calls go to the human queue.
          </p>
          {canManage && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs" style={{ color: "var(--accent)" }}>
                Change Room avatar
              </summary>
              <form action={uploadRoomAvatar} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="room_id" value={r.id} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="return_to" value={`/r/${slug}/agent`} />
                <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" required className="text-xs" />
                <button className="btn !py-1 text-xs">Upload</button>
                <span className="w-full text-xs" style={{ color: "var(--muted)" }}>
                  PNG/JPEG/WebP/GIF, up to 3MB.
                </span>
              </form>
            </details>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <h2 className="font-bold">Calibration (learned)</h2>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {PARAM_DEFAULTS.map(({ key, label, def }) => {
                const val = Number(calibration?.[key] ?? def);
                const drifted = Math.abs(val - def) > 0.001;
                return (
                  <tr key={key} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5" style={{ color: "var(--muted)" }}>{label}</td>
                    <td className="py-1.5 text-right font-mono font-bold">
                      {val.toFixed(2)}
                      {drifted && (
                        <span className="ml-1 text-xs" style={{ color: val > def ? "var(--warn)" : "var(--good)" }}>
                          (default {def}{val > def ? ", relaxed by overrides" : ", tightened by upholds"})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3 className="mt-4 text-sm font-bold" style={{ color: "var(--muted)" }}>
            LEARNING HISTORY
          </h3>
          {history.length === 0 && (
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              No adjustments yet — the community hasn't resolved any votes.
            </p>
          )}
          <ul className="mt-1 space-y-1 text-xs" style={{ color: "var(--muted)" }}>
            {history.map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleString()} — <b style={{ color: h.outcome === "overridden" ? "var(--bad)" : "var(--good)" }}>{h.outcome}</b>{" "}
                → {h.param} now {Number(h.new_value).toFixed(2)}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <h2 className="font-bold">Constitution</h2>
          {isFounder ? (
            <form action={updateConstitution} className="mt-2 space-y-2">
              <input type="hidden" name="room_id" value={r.id} />
              <input type="hidden" name="slug" value={slug} />
              <textarea className="input font-mono text-xs" name="constitution" rows={10} defaultValue={r.constitution} />
              <button className="btn">Amend constitution</button>
            </form>
          ) : (
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs" style={{ color: "var(--muted)" }}>
              {r.constitution || "(unwritten — the agent falls back to platform defaults)"}
            </pre>
          )}
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Directives: <code>agent.strictness: relaxed|normal|strict</code> scales sensitivity;{" "}
            <code>agent.forbid: term, term</code> makes the agent nudge on those terms. Prose shapes
            topic-drift detection and is quoted in nudges.
          </p>
        </div>
      </div>

      {flagged.length > 0 && (
        <div className="panel p-5" style={{ borderColor: "rgba(251,191,36,0.4)" }}>
          <h2 className="font-bold" style={{ color: "var(--warn)" }}>
            🚩 Human review queue ({flagged.length})
          </h2>
          <div className="mt-2 space-y-3">
            {flagged.map((a) => {
              const c = a.target_id ? flaggedCommentMap.get(a.target_id) : undefined;
              const author = c ? personaMap.get(c.author_persona_id) : undefined;
              return (
                <div key={a.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm">{a.reason}</p>
                  {c && (
                    <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                      “{c.body.slice(0, 140)}” — @{author?.handle ?? "?"}
                    </p>
                  )}
                  {a.post_id && (
                    <Link href={`/post/${a.post_id}`} className="text-xs hover:underline" style={{ color: "var(--accent)" }}>
                      view thread →
                    </Link>
                  )}
                  {canManage && (
                    <div className="mt-2 flex gap-2">
                      <form action={resolveFlag}>
                        <input type="hidden" name="action_id" value={a.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <button className="btn !py-1 text-xs">Mark reviewed</button>
                      </form>
                      {c && (
                        <form action={banPersona}>
                          <input type="hidden" name="room_id" value={r.id} />
                          <input type="hidden" name="persona_id" value={c.author_persona_id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="reason" value="Flagged by agent, confirmed by moderator" />
                          <button
                            className="btn btn-danger !py-1 text-xs"
                            title="Bans the ROOT behind this persona from this Room — all of their personas, present and future."
                          >
                            Ban @{author?.handle} (root-level)
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-bold" style={{ color: "var(--muted)" }}>
          ACTION LOG
        </h2>
        {(actions ?? []).length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            The agent hasn't needed to act in this Room yet.
          </p>
        )}
        {((actions ?? []) as AgentAction[]).map((a) => (
          <div key={a.id}>
            <AgentActionCard
              action={a}
              myVote={(myOverrides.get(a.id) as "uphold" | "override") ?? null}
              path={`/r/${slug}/agent`}
            />
            {a.post_id && (
              <Link href={`/post/${a.post_id}`} className="ml-1 text-xs hover:underline" style={{ color: "var(--accent)" }}>
                view thread →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
