import { createRoom } from "@/lib/actions";
import Banner from "@/components/Banner";

const SAMPLE_CONSTITUTION = `Be excellent to each other. Debate ideas, not people.
Stay roughly on topic — take tangents to their own posts.
Assume good faith until proven otherwise.

agent.strictness: normal
agent.forbid: `;

export default async function NewRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Banner error={params.error} />
      <h1 className="text-xl font-bold">Found a Room</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Every Room gets an AI Agent Moderator on day one. Its behaviour is
        governed by the constitution you write below — plain-language values,
        plus optional <code>agent.strictness</code> and <code>agent.forbid</code>{" "}
        directives. The community can override any of its decisions, and it
        recalibrates from those votes.
      </p>
      <form action={createRoom} className="panel space-y-3 p-5">
        <input className="input" name="slug" placeholder="slug (a-z, 0-9, -)" pattern="[a-z0-9-]{2,32}" required />
        <input className="input" name="name" placeholder="Room name" maxLength={64} required />
        <input className="input" name="description" placeholder="One-line description" />
        <label className="block text-sm font-semibold">Constitution</label>
        <textarea className="input font-mono text-xs" name="constitution" rows={8} defaultValue={SAMPLE_CONSTITUTION} />
        <button className="btn btn-primary w-full">Create Room</button>
      </form>
    </div>
  );
}
