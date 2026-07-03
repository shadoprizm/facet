import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActivePersona } from "@/lib/persona";
import { createPost } from "@/lib/actions";
import Banner from "@/components/Banner";
import type { Room } from "@/lib/types";

export default async function SubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("*").eq("slug", slug).single();
  if (!room) notFound();
  const r = room as Room;
  const active = await getActivePersona();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Banner error={sp.error} />
      <h1 className="text-xl font-bold">New post in r/{r.slug}</h1>
      {active ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Posting as{" "}
          <b style={{ color: "var(--text)" }}>
            {active.display_name} (@{active.handle})
          </b>{" "}
          — switch masks in the nav bar if this isn't the voice you want here.
        </p>
      ) : (
        <p className="text-sm" style={{ color: "var(--bad)" }}>
          You need a persona to post — create one under “Manage personas”.
        </p>
      )}
      <form action={createPost} className="panel space-y-3 p-5">
        <input type="hidden" name="room_id" value={r.id} />
        <input type="hidden" name="room_slug" value={r.slug} />
        <input className="input" name="title" placeholder="Title" maxLength={200} required />
        <textarea className="input" name="body" placeholder="Text (optional)" rows={6} />
        <button className="btn btn-primary w-full" disabled={!active}>
          Post
        </button>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          The Room Agent will read this against the Room's constitution the
          moment it lands.
        </p>
      </form>
    </div>
  );
}
