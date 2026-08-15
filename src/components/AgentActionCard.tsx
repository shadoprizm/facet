"use client";

import { useState, useTransition } from "react";
import { overrideVote } from "@/lib/actions";
import type { AgentAction } from "@/lib/types";

const ICONS: Record<AgentAction["action_type"], string> = {
  nudge: "🕊️",
  collapse: "🫧",
  flag: "🚩",
};

/**
 * Every agent action is a voteable item: the community can uphold or
 * override it, and the outcome feeds the agent's calibration.
 */
export default function AgentActionCard({
  action,
  myVote,
  path,
  compact = false,
}: {
  action: AgentAction;
  myVote: "uphold" | "override" | null;
  path: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cast(choice: "uphold" | "override") {
    startTransition(async () => {
      setError(null);
      const res = await overrideVote(action.id, choice, path);
      if (res.error) setError(res.error);
    });
  }

  const statusChip =
    action.status === "pending" ? (
      <span className="chip chip-warn">
        community vote open
      </span>
    ) : action.status === "overridden" ? (
      <span className="chip chip-bad">
        overridden — agent recalibrated
      </span>
    ) : (
      <span className="chip chip-good">
        upheld
      </span>
    );

  return (
    <div className="panel panel-agent-action my-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--accent-2)]">
        <span>{ICONS[action.action_type]}</span>
        <span className="font-bold uppercase tracking-wide">
          Room Agent · {action.action_type}
        </span>
        {statusChip}
        {action.action_type === "flag" && action.review_status === "open" && (
          <span className="chip">in human review queue</span>
        )}
      </div>
      <p className="mt-1.5 text-sm">{action.reason}</p>
      {!compact && (
        <div className="mt-1 text-xs text-[var(--muted)]">
          trigger: {action.trigger_param} · {new Date(action.created_at).toLocaleString()}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          className={`btn !py-1 text-xs ${myVote === "uphold" ? "btn-good" : ""}`}
          disabled={pending || action.status !== "pending"}
          onClick={() => cast("uphold")}
        >
          Uphold ({action.votes_uphold})
        </button>
        <button
          className={`btn !py-1 text-xs ${myVote === "override" ? "btn-bad" : ""}`}
          disabled={pending || action.status !== "pending"}
          onClick={() => cast("override")}
        >
          Override ({action.votes_override})
        </button>
        {error && (
          <span className="text-xs text-[var(--bad)]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
