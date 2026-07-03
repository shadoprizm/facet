import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { uploadRoomAvatar } from "@/lib/actions";
import { RoomAvatar } from "@/components/Avatar";
import type { Room } from "@/lib/types";

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
      {((rooms ?? []) as Room[]).map((r) => (
        <div key={r.id} className="panel flex flex-wrap items-center gap-3 p-4">
          <RoomAvatar avatarUrl={r.avatar_url} size={48} />
          <div className="min-w-0 flex-1">
            <Link href={`/r/${r.slug}`} className="font-bold hover:underline">
              r/{r.slug}
            </Link>
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
      ))}
    </div>
  );
}
