import Link from "next/link";
import type { Persona } from "@/lib/types";

/**
 * The public face of a persona. If it belongs to the viewing root, a subtle
 * "you" chip is added — visible ONLY to the owner; everyone else sees an
 * unrelated user.
 */
export default function PersonaBadge({
  persona,
  mine = false,
  size = "sm",
}: {
  persona?: Persona;
  mine?: boolean;
  size?: "sm" | "md";
}) {
  if (!persona) {
    return <span style={{ color: "var(--muted)" }}>[deleted]</span>;
  }
  const dot = size === "md" ? "h-6 w-6" : "h-4 w-4";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block ${dot} rounded-full`}
        style={{ background: persona.avatar_color }}
      />
      <Link
        href={`/p/${persona.handle}`}
        className="font-semibold hover:underline"
        style={{ color: "var(--text)" }}
      >
        {persona.display_name}
      </Link>
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        @{persona.handle}
      </span>
      {persona.status === "retired" && <span className="chip">retired</span>}
      {mine && (
        <span
          className="chip"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          title="One of your masks — only you can see this"
        >
          you
        </span>
      )}
    </span>
  );
}
