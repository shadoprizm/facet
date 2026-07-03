import { createClient } from "@/lib/supabase/server";
import { adminBanRootByHandle, adminUnbanRoot, adminUnbanRoom } from "@/lib/admin-actions";
import Banner from "@/components/Banner";
import type { PlatformBanRow, RoomBanRow } from "@/lib/types";

export default async function AdminBansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: platformBans }, { data: roomBans }] = await Promise.all([
    supabase.rpc("admin_list_platform_bans"),
    supabase.rpc("admin_list_room_bans"),
  ]);

  return (
    <div className="space-y-6">
      <Banner error={sp.error} />
      <h1 className="text-xl font-bold">⛔ Bans</h1>

      <div className="panel p-5">
        <h2 className="font-bold">Platform-ban a root (by persona handle)</h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Resolves the handle to its root account and bans every persona under
          it, platform-wide — this is the enforcement path the &ldquo;root is
          known only to the platform&rdquo; design exists for.
        </p>
        <form action={adminBanRootByHandle} className="mt-2 flex flex-wrap gap-2">
          <input className="input !w-auto" name="handle" placeholder="persona handle" required />
          <input className="input !w-auto" name="reason" placeholder="reason" />
          <button className="btn btn-danger">Ban root</button>
        </form>
      </div>

      <div>
        <h2 className="mb-2 font-bold" style={{ color: "var(--muted)" }}>
          PLATFORM BANS
        </h2>
        {((platformBans ?? []) as PlatformBanRow[]).length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            None.
          </p>
        )}
        {((platformBans ?? []) as PlatformBanRow[]).map((b) => (
          <div key={b.root_user_id} className="panel mb-2 flex items-center justify-between p-3">
            <div>
              <div className="text-sm font-semibold">{b.email}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {b.reason} · {new Date(b.created_at).toLocaleString()}
              </div>
            </div>
            <form action={adminUnbanRoot}>
              <input type="hidden" name="root_id" value={b.root_user_id} />
              <button className="btn !py-1 text-xs">Unban</button>
            </form>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-2 font-bold" style={{ color: "var(--muted)" }}>
          ROOM BANS
        </h2>
        {((roomBans ?? []) as RoomBanRow[]).length === 0 && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            None.
          </p>
        )}
        {((roomBans ?? []) as RoomBanRow[]).map((b) => (
          <div key={`${b.room_id}-${b.root_user_id}`} className="panel mb-2 flex items-center justify-between p-3">
            <div>
              <div className="text-sm font-semibold">
                @{b.banned_handle ?? "?"} in r/{b.room_slug}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {b.root_email} · {b.reason} · {new Date(b.created_at).toLocaleString()}
              </div>
            </div>
            <form action={adminUnbanRoom}>
              <input type="hidden" name="room_id" value={b.room_id} />
              <input type="hidden" name="root_id" value={b.root_user_id} />
              <button className="btn !py-1 text-xs">Unban</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
