import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AdminStats } from "@/lib/types";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const { data: stats } = await supabase.rpc("admin_stats");
  const s = (stats ?? {}) as Partial<AdminStats>;

  const cards: Array<[string, number | undefined]> = [
    ["Root accounts", s.roots],
    ["Active personas", s.personas_active],
    ["Retired personas", s.personas_retired],
    ["Rooms", s.rooms],
    ["Posts", s.posts],
    ["Comments", s.comments],
    ["Open flags", s.open_flags],
    ["Pending agent votes", s.pending_votes],
    ["Room bans", s.room_bans],
    ["Platform bans", s.platform_bans],
  ];

  return (
    <div className="space-y-6">
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
      </div>
    </div>
  );
}
