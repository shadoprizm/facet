import { createClient } from "@/lib/supabase/server";
import { adminGrant, adminRevoke } from "@/lib/admin-actions";
import Banner from "@/components/Banner";
import type { AdminRow } from "@/lib/types";

export default async function AdminAdminsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: admins }, { data: userData }] = await Promise.all([
    supabase.rpc("admin_list_admins"),
    supabase.auth.getUser(),
  ]);
  const rows = (admins ?? []) as AdminRow[];
  const meId = userData.user?.id;

  return (
    <div className="space-y-4">
      <Banner error={sp.error} />
      <h1 className="text-xl font-bold">🛡️ Admins</h1>
      <form action={adminGrant} className="panel flex flex-wrap gap-2 p-4">
        <input className="input !w-auto" name="email" type="email" placeholder="root email to promote" required />
        <button className="btn btn-primary">Grant admin</button>
      </form>
      {rows.map((a) => (
        <div key={a.root_user_id} className="panel flex items-center justify-between p-3">
          <div>
            <div className="text-sm font-semibold">
              {a.email} {a.root_user_id === meId && <span className="chip">you</span>}
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              admin since {new Date(a.created_at).toLocaleDateString()}
            </div>
          </div>
          <form action={adminRevoke}>
            <input type="hidden" name="root_id" value={a.root_user_id} />
            <button
              className="btn btn-danger !py-1 text-xs"
              title="Blocked if this is the last remaining admin"
            >
              Revoke
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
