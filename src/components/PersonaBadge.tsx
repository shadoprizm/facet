import Link from "next/link";
import type { Persona } from "@/lib/types";
import { PersonaAvatar, type AvatarSize } from "./Avatar";

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
    return <span className="text-[var(--muted)]">[deleted]</span>;
  }
  const dotPx: AvatarSize = size === "md" ? 24 : 16;
  return (
    <span className="inline-flex items-center gap-1.5">
      <PersonaAvatar avatarUrl={persona.avatar_url} avatarColor={persona.avatar_color} size={dotPx} />
      <Link
        href={`/p/${persona.handle}`}
        className="font-semibold text-[var(--text)] hover:underline"
      >
        {persona.display_name}
      </Link>
      <span className="text-xs text-[var(--muted)]">
        @{persona.handle}
      </span>
      {persona.status === "retired" && <span className="chip">retired</span>}
      {mine && (
        <span
          className="chip chip-accent"
          title="One of your masks — only you can see this"
        >
          you
        </span>
      )}
    </span>
  );
}
