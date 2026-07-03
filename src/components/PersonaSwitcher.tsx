"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { switchPersona } from "@/lib/actions";
import type { Persona } from "@/lib/types";

/**
 * One-click mask change. The active persona is a cookie; every write action
 * on the server resolves it and re-verifies ownership.
 */
export default function PersonaSwitcher({
  personas,
  active,
}: {
  personas: Persona[];
  active: Persona | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const activePersonas = personas.filter((p) => p.status === "active");

  if (!active) {
    return (
      <a href="/me" className="btn btn-primary">
        Create your first persona
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        className="btn"
        onClick={() => setOpen((o) => !o)}
        title="Switch persona"
      >
        <span
          className="inline-block h-4 w-4 rounded-full"
          style={{ background: active.avatar_color }}
        />
        <span className="max-w-32 truncate">{active.display_name}</span>
        <span style={{ color: "var(--muted)" }}>▾</span>
      </button>

      {open && (
        <div
          className="panel absolute right-0 z-50 mt-2 w-64 p-2"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-2 py-1 text-xs" style={{ color: "var(--muted)" }}>
            Wearing the mask of…
          </div>
          {activePersonas.map((p) => (
            <form action={switchPersona} key={p.id}>
              <input type="hidden" name="persona_id" value={p.id} />
              <input type="hidden" name="back_to" value={pathname} />
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5"
                type="submit"
              >
                <span
                  className="inline-block h-5 w-5 shrink-0 rounded-full"
                  style={{ background: p.avatar_color }}
                />
                <span className="flex-1 truncate">
                  {p.display_name}
                  <span className="block text-xs" style={{ color: "var(--muted)" }}>
                    @{p.handle} · {p.karma} karma
                  </span>
                </span>
                {p.id === active.id && <span style={{ color: "var(--good)" }}>✓</span>}
              </button>
            </form>
          ))}
          <a
            href="/me"
            className="mt-1 block rounded-lg px-2 py-2 text-sm hover:bg-white/5"
            style={{ color: "var(--accent)" }}
          >
            + Manage personas
          </a>
        </div>
      )}
    </div>
  );
}
