import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 border-b pb-3" style={{ borderColor: "var(--border)" }}>
        <Link href="/admin" className="btn !py-1 text-xs">
          Dashboard
        </Link>
        <Link href="/admin/flags" className="btn !py-1 text-xs">
          🚩 Flags
        </Link>
        <Link href="/admin/bans" className="btn !py-1 text-xs">
          ⛔ Bans
        </Link>
        <Link href="/admin/rooms" className="btn !py-1 text-xs">
          🏠 Rooms
        </Link>
        <Link href="/admin/admins" className="btn !py-1 text-xs">
          🛡️ Admins
        </Link>
      </nav>
      {children}
    </div>
  );
}
