/**
 * Fire the evaluate-content Edge Function for a newly created post/comment.
 *
 * Replaces the old in-process agent runtime (src/lib/agent/run.ts, deleted).
 * The function authenticates with a shared secret and writes the agent action
 * through the service role, so the app no longer needs any privileged client
 * or a writable record_agent_action RPC.
 *
 * Behaviour: awaited but failure-tolerant. The function is fast (local
 * Postgres reads + pure math) and idempotent, so awaiting keeps the new
 * comment's agent action visible on the immediate page render (matching the
 * pre-refactor UX). If the function is down we swallow the error — the row
 * is already written; a future sweep can backfill.
 */

import { logAgentDecision } from "@/lib/observability";

const FUNCTION_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/evaluate-content`
  : null;
const SECRET = process.env.AGENT_INVOCATION_SECRET;

export async function invokeAgent(
  type: "post" | "comment",
  id: string,
): Promise<void> {
  if (!FUNCTION_URL || !SECRET) {
    // Not configured — local dev without the function deployed. Log once and
    // move on; do not throw (the content is already written).
    logAgentDecision({ type, id, outcome: "error", error: "agent function not configured" });
    return;
  }

  const started = Date.now();
  try {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-secret": SECRET,
        // Supabase Edge Functions require this header to bypass JWT verification
        // when --no-verify-jwt is set; harmless otherwise.
        authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
      },
      body: JSON.stringify({ type, id }),
      // Don't let a slow function hang the request indefinitely.
      signal: AbortSignal.timeout(10_000),
    });
    logAgentDecision({
      type,
      id,
      outcome: res.ok ? "ok" : "error",
      httpStatus: res.status,
      durationMs: Date.now() - started,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logAgentDecision({ type, id, outcome: "error", error: detail.slice(0, 200) });
    }
  } catch (err) {
    logAgentDecision({
      type,
      id,
      outcome: "error",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    });
  }
}
