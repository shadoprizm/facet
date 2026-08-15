"use client";

import { useState, useTransition } from "react";
import { vote } from "@/lib/actions";

export default function VoteButtons({
  targetType,
  targetId,
  score,
  myVote,
  path,
  signedIn = true,
}: {
  targetType: "post" | "comment";
  targetId: string;
  score: number;
  myVote: number; // -1 | 0 | 1
  path: string;
  /** Logged-out readers see the score but vote through the login page. */
  signedIn?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <span className="inline-flex items-center gap-1">
        <a
          href="/login"
          className="btn btn-ghost !px-1.5 !py-0.5"
          title="Sign in to vote"
        >
          ▲
        </a>
        <span className="min-w-6 text-center text-sm font-bold">{score}</span>
        <a
          href="/login"
          className="btn btn-ghost !px-1.5 !py-0.5"
          title="Sign in to vote"
        >
          ▼
        </a>
      </span>
    );
  }

  function cast(value: -1 | 1) {
    startTransition(async () => {
      setError(null);
      // Clicking your current vote clears it.
      const res = await vote(targetType, targetId, myVote === value ? 0 : value, path);
      if (res.error) setError(res.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => cast(1)}
        disabled={pending}
        className={`btn btn-ghost !px-1.5 !py-0.5 ${myVote === 1 ? "!text-[var(--good)]" : ""}`}
        title="Upvote"
      >
        ▲
      </button>
      <span className="min-w-6 text-center text-sm font-bold">{score}</span>
      <button
        onClick={() => cast(-1)}
        disabled={pending}
        className={`btn btn-ghost !px-1.5 !py-0.5 ${myVote === -1 ? "!text-[var(--bad)]" : ""}`}
        title="Downvote"
      >
        ▼
      </button>
      {error && (
        <span className="text-xs text-[var(--bad)]" title={error}>
          {error.length > 60 ? error.slice(0, 60) + "…" : error}
        </span>
      )}
    </span>
  );
}
