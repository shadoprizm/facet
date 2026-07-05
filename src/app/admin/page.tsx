import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Banner from "@/components/Banner";
import type { AdminStats } from "@/lib/types";

type AgentActivity = {
  window_hours: number;
  total: number;
  by_action: Record<string, number>;
  by_trigger: Record<string, number>;
  overrides: number;
};

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: stats }, { data: activity }] = await Promise.all([
    supabase.rpc("admin_stats"),
    supabase.rpc("admin_agent_activity", { p_hours: 24 }),
  ]);
  const s = (stats ?? {}) as Partial<AdminStats>;
  const a = (activity ?? {}) as AgentActivity;

  const cards: Array<[string, number | undefined]> = [
    ["Root accounts", s.roots],
    ["Active personas", s.personas_active],
    ["Retired personas", s.personas_retired],
    ["Rooms", s.rooms],
    ["Posts", s.posts],
    ["Comments", s.comments],
    ["Open flags", s.open_flags],
    ["Open reports", s.open_reports],
    ["Pending agent votes", s.pending_votes],
    ["Room bans", s.room_bans],
    ["Platform bans", s.platform_bans],
  ];

  return (
    <div className="space-y-6">
      <Banner error={sp.error} />
      <div>
        <h1 className="text-xl font-bold">🛡️ Admin</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Platform-wide operations. This section is visible only to platform admins.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="panel p-4">
            <div className="text-2xl font-bold">{value ?? 0}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(s.open_flags ?? 0) > 0 && (
          <Link href="/admin/flags" className="btn btn-danger">
            {s.open_flags} flag{s.open_flags === 1 ? "" : "s"} awaiting review →
          </Link>
        )}
        {(s.open_reports ?? 0) > 0 && (
          <Link href="/admin/flags" className="btn">
            {s.open_reports} user report{s.open_reports === 1 ? "" : "s"} →
          </Link>
        )}
      </div>

      <div className="panel p-5">
        <h2 className="font-bold">Agent activity (last {a.window_hours ?? 24}h)</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-2xl font-bold">{a.total ?? 0}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>total actions</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{a.by_action?.nudge ?? 0}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>nudges</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{a.by_action?.collapse ?? 0}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>collapses</div>
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: "var(--warn)" }}>
              {a.by_action?.flag ?? 0}
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>flags</div>
          </div>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          {a.overrides ?? 0} override/community vote{(a.overrides ?? 0) === 1 ? "" : "s"} resolved in this window.
        </p>
      </div>
    </div>
  );
}
