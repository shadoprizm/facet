import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPersonaMap } from "@/lib/data";
import { markNotificationsRead } from "@/lib/actions";
import Banner from "@/components/Banner";
import { PersonaAvatar } from "@/components/Avatar";
import type { Notification } from "@/lib/types";

const LABELS: Record<Notification["type"], { icon: string; verb: string; color: string }> = {
  reply: { icon: "💬", verb: "replied to you", color: "var(--accent)" },
  collapse: { icon: "🫧", verb: "your comment was collapsed by the agent", color: "var(--warn)" },
  agent_flag: { icon: "🚩", verb: "your content was flagged for review", color: "var(--bad)" },
  ban: { icon: "⛔", verb: "you were banned from a Room", color: "var(--bad)" },
  report_resolved: { icon: "✓", verb: "your report was resolved", color: "var(--good)" },
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const notifs = (rows ?? []) as Notification[];

  const unread = notifs.filter((n) => !n.read).length;
  const personaMap = await fetchPersonaMap(
    supabase,
    notifs.map((n) => n.actor_persona_id),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Banner error={sp.error} />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          Notifications
          {unread > 0 && (
            <span className="chip ml-2" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
              {unread} unread
            </span>
          )}
        </h1>
        {unread > 0 && (
          <form action={markNotificationsRead}>
            <button className="btn !py-1 text-xs">Mark all read</button>
          </form>
        )}
      </div>

      {notifs.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No notifications yet. You&apos;ll see replies, agent actions on your
          content, and bans here.
        </p>
      )}

      {notifs.map((n) => {
        const meta = LABELS[n.type];
        const actor = n.actor_persona_id ? personaMap.get(n.actor_persona_id) : null;
        const link =
          n.post_id ? `/post/${n.post_id}`
          : n.room_id ? `/r/${(n.payload as { room_slug?: string }).room_slug ?? ""}`
          : null;
        const body = (
          <div className="flex items-start gap-3">
            <span className="text-lg">{meta.icon}</span>
            {actor && <PersonaAvatar avatarUrl={actor.avatar_url} avatarColor={actor.avatar_color} size={28} />}
            <div className="min-w-0 flex-1">
              <div className="text-sm" style={{ color: n.read ? "var(--muted)" : "var(--text)" }}>
                {actor && <span className="font-semibold">@{actor.handle} </span>}
                <span style={{ color: meta.color }}>{meta.verb}</span>
              </div>
              {n.type === "collapse" && (n.payload as { reason?: string }).reason && (
                <p className="mt-1 text-xs italic" style={{ color: "var(--muted)" }}>
                  &ldquo;{(n.payload as { reason: string }).reason.slice(0, 160)}&rdquo;
                </p>
              )}
              {n.type === "ban" && (n.payload as { reason?: string }).reason && (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  Reason: {(n.payload as { reason: string }).reason}
                </p>
              )}
              <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
            {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
          </div>
        );
        return (
          <div key={n.id} className="panel p-3">
            {link ? <Link href={link} className="block hover:brightness-125">{body}</Link> : body}
          </div>
        );
      })}
    </div>
  );
}
