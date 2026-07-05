import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { uploadRoomAvatar } from "@/lib/actions";
import { adminRenameRoom, adminRemoveRoom } from "@/lib/admin-actions";
import ConfirmButton from "@/components/ConfirmButton";
import { RoomAvatar } from "@/components/Avatar";
import type { RoomWithMeta } from "@/lib/types";

export default async function AdminRoomsPage() {
  const supabase = await createClient();
  const [{ data: rooms }, { data: counts }] = await Promise.all([
    supabase.from("rooms").select("*").order("created_at", { ascending: false }),
    supabase.from("room_subscriber_counts").select("*"),
  ]);
  const countMap = new Map((counts ?? []).map((c) => [c.room_id, c.subscribers]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🏠 Rooms ({(rooms ?? []).length})</h1>
      {((rooms ?? []) as RoomWithMeta[]).map((r) => (
        <div key={r.id} className="panel p-4">
          <div className="flex flex-wrap items-center gap-3">
            <RoomAvatar avatarUrl={r.avatar_url} size={48} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link href={`/r/${r.slug}`} className="font-bold hover:underline">
                  r/{r.slug}
                </Link>
                {r.removed_at && (
                  <span className="chip" style={{ color: "var(--bad)", borderColor: "var(--bad)" }}>
                    removed
                  </span>
                )}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {r.name} · {countMap.get(r.id) ?? 0} subscribers
              </div>
            </div>
            <form action={uploadRoomAvatar} className="flex items-center gap-2">
              <input type="hidden" name="room_id" value={r.id} />
              <input type="hidden" name="return_to" value="/admin/rooms" />
              <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" required className="text-xs" />
              <button className="btn !py-1 text-xs">Set avatar</button>
            </form>
            <Link href={`/r/${r.slug}/agent`} className="btn !py-1 text-xs">
              Manage
            </Link>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs" style={{ color: "var(--accent)" }}>
              Rename or remove
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <form action={adminRenameRoom} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="room_id" value={r.id} />
                <input
                  className="input !w-auto text-xs"
                  name="slug"
                  defaultValue={r.slug}
                  pattern="[a-z0-9-]{2,32}"
                  required
                />
                <input
                  className="input !w-auto text-xs"
                  name="name"
                  defaultValue={r.name}
                  maxLength={64}
                  required
                />
                <button className="btn !py-1 text-xs">Rename</button>
              </form>
              {!r.removed_at && (
                <form action={adminRemoveRoom}>
                  <input type="hidden" name="room_id" value={r.id} />
                  <ConfirmButton
                    label="Remove room"
                    confirmMessage={`Soft-remove r/${r.slug}? It will be hidden but its history preserved. Visible to admins only.`}
                  />
                </form>
              )}
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
