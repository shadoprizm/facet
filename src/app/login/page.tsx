import { signIn, signUp, sendMagicLink } from "@/lib/actions";
import Banner from "@/components/Banner";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto grid max-w-4xl gap-8 py-8 md:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: "#fff" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/facet-mark.png" alt="Facet" className="h-8 w-8 object-contain" />
          </span>
          <span className="text-2xl font-bold tracking-tight">Facet</span>
        </div>
        <h1 className="text-4xl font-extrabold">
          One root.
          <br />
          <span
            style={{
              background: "linear-gradient(135deg,#818cf8,#c084fc)",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            Many masks.
          </span>
        </h1>
        <p style={{ color: "var(--muted)" }}>
          Your root identity verifies you exist and keeps you accountable — but
          it is never shown to anyone. In public you speak through{" "}
          <b style={{ color: "var(--text)" }}>personas</b>: separate names,
          karma, and histories for each side of you.
        </p>
        <ul className="space-y-2 text-sm" style={{ color: "var(--muted)" }}>
          <li>◆ Karma is per-persona. Never merged, never gamed.</li>
          <li>◆ Every Room is tended by an AI agent bound by a community constitution.</li>
          <li>◆ Any agent decision can be overridden by community vote — and the agent learns.</li>
        </ul>
      </div>

      <div className="space-y-4">
        <Banner error={params.error} notice={params.notice} />

        <form action={signIn} className="panel space-y-3 p-5">
          <h2 className="font-bold">Sign in</h2>
          <input className="input" name="email" type="email" placeholder="root email" required />
          <input className="input" name="password" type="password" placeholder="password" required />
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1">Sign in</button>
            <button formAction={signUp} className="btn flex-1">
              Create root account
            </button>
          </div>
        </form>

        <form action={sendMagicLink} className="panel space-y-3 p-5">
          <h2 className="font-bold">…or use a magic link</h2>
          <input className="input" name="email" type="email" placeholder="root email" required />
          <button className="btn w-full">Email me a magic link</button>
        </form>

        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Your email is your root identity. It is used only for verification
          and abuse enforcement — other users can never see it or link your
          personas together.
        </p>
      </div>
    </div>
  );
}
