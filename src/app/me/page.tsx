import { createClient } from "@/lib/supabase/server";
import { getActivePersona, listMyPersonas } from "@/lib/persona";
import { createPersona, retirePersona, switchPersona, uploadPersonaAvatar } from "@/lib/actions";
import { PersonaAvatar } from "@/components/Avatar";
import Banner from "@/components/Banner";
import Link from "next/link";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#84cc16"];

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const personas = await listMyPersonas();
  const active = await getActivePersona();

  return (
    <div className="space-y-6">
      <Banner error={params.error} />

      <div className="panel p-5">
        <h1 className="text-xl font-bold">Your identity tree</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Root: <b>{user?.email}</b> — verified, private, enforceable. Nobody
          on Facet can see it or connect the personas below to each other.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-bold" style={{ color: "var(--muted)" }}>
            PERSONAS ({personas.filter((p) => p.status === "active").length} active)
          </h2>
          {personas.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No personas yet — create your first mask to start posting.
            </p>
          )}
          {personas.map((p) => (
            <div key={p.id} className="panel p-4">
              <div className="flex items-center gap-3">
                <PersonaAvatar avatarUrl={p.avatar_url} avatarColor={p.avatar_color} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/p/${p.handle}`} className="truncate font-bold hover:underline">
                      {p.display_name}
                    </Link>
                    {p.status === "retired" && <span className="chip">retired</span>}
                    {active?.id === p.id && (
                      <span className="chip" style={{ color: "var(--good)", borderColor: "var(--good)" }}>
                        wearing
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    @{p.handle} · {p.karma} karma
                  </div>
                </div>
                {p.status === "active" && (
                  <div className="flex gap-2">
                    {active?.id !== p.id && (
                      <form action={switchPersona}>
                        <input type="hidden" name="persona_id" value={p.id} />
                        <input type="hidden" name="back_to" value="/me" />
                        <button className="btn !py-1 text-xs">Wear</button>
                      </form>
                    )}
                    <form action={retirePersona}>
                      <input type="hidden" name="persona_id" value={p.id} />
                      <button
                        className="btn btn-danger !py-1 text-xs"
                        title="Retired personas keep their history and karma forever, but can no longer act. Personas are never merged."
                      >
                        Retire
                      </button>
                    </form>
                  </div>
                )}
              </div>
              {p.status === "active" && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs" style={{ color: "var(--accent)" }}>
                    Change avatar image
                  </summary>
                  <form action={uploadPersonaAvatar} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="persona_id" value={p.id} />
                    <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" required className="text-xs" />
                    <button className="btn !py-1 text-xs">Upload</button>
                    <span className="w-full text-xs" style={{ color: "var(--muted)" }}>
                      PNG/JPEG/WebP/GIF, up to 3MB. Falls back to the colour dot until you upload one.
                    </span>
                  </form>
                </details>
              )}
            </div>
          ))}
        </div>

        <form action={createPersona} className="panel h-fit space-y-3 p-5">
          <h2 className="font-bold">Craft a new mask</h2>
          <input className="input" name="handle" placeholder="handle (a-z, 0-9, _)" pattern="[a-z0-9_]{3,24}" required />
          <input className="input" name="display_name" placeholder="display name" maxLength={48} required />
          <textarea className="input" name="bio" placeholder="bio (optional)" rows={2} />
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
            colour
            <select name="avatar_color" className="input !w-auto">
              {COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary w-full">Create persona</button>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Limit: 3 new personas per 24 h, 10 active total. Each persona has
            its own karma, subscriptions, and history — they are never merged.
          </p>
        </form>
      </div>
    </div>
  );
}
