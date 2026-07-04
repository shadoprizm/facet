import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActivePersona, listMyPersonas } from "@/lib/persona";
import { isPlatformAdmin } from "@/lib/admin";
import { signOut } from "@/lib/actions";
import PersonaSwitcher from "./PersonaSwitcher";

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [personas, active, admin] = user
    ? await Promise.all([listMyPersonas(), getActivePersona(), isPlatformAdmin()])
    : [[], null, false];

  return (
    <nav
      className="sticky top-0 z-40 border-b"
      style={{ background: "rgba(11,13,18,0.9)", borderColor: "var(--border)", backdropFilter: "blur(8px)" }}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: "#fff" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/facet-mark.png" alt="" className="h-5 w-5 object-contain" />
          </span>
          Facet
        </Link>
        {user ? (
          <div className="mx-2 flex flex-1 justify-center">
            <form action="/search" className="hidden w-full max-w-xs sm:block">
              <input
                name="q"
                placeholder="Search rooms & facets"
                aria-label="Search Facet"
                className="input !py-1.5"
              />
            </form>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {user ? (
          <>
            <Link href="/search" className="btn btn-ghost sm:hidden" aria-label="Search">
              ⌕
            </Link>
            <Link href="/rooms/new" className="btn btn-ghost hidden sm:inline-flex">
              + New Room
            </Link>
            {admin && (
              <Link href="/admin" className="btn btn-ghost hidden sm:inline-flex">
                🛡️ Admin
              </Link>
            )}
            <PersonaSwitcher personas={personas} active={active} />
            <form action={signOut}>
              <button className="btn btn-ghost" title={`Root: ${user.email} (never shown to others)`}>
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
