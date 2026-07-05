/**
 * Thin observability seam. Today these are structured console logs (one JSON
 * line per event, suitable for Vercel/Logflare ingestion). Swap the bodies
 * for Sentry/Logflare SDK calls later without touching call sites.
 */

type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  // server-side only — never import this from a client component.
  console[level](
    JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields }),
  );
}

export function logInfo(event: string, fields: Record<string, unknown> = {}) {
  emit("info", event, fields);
}

export function logWarn(event: string, fields: Record<string, unknown> = {}) {
  emit("warn", event, fields);
}

/** Log a recoverable error. Use for anything caught and surfaced to the user. */
export function logError(event: string, fields: Record<string, unknown> = {}) {
  emit("error", event, fields);
}

/** Log an agent decision (called after the Edge Function runs). */
export function logAgentDecision(fields: {
  type: "post" | "comment";
  id: string;
  outcome: "ok" | "error";
  error?: string;
  httpStatus?: number;
  durationMs?: number;
}) {
  emit(fields.outcome === "ok" ? "info" : "error", "agent_invoke", fields);
}
