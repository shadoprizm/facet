// Edge Function: evaluate-content
//
// Runs the agent moderator on a newly created post or comment. Invoked by the
// Next.js app's server actions (createPost/createComment/crosspost) right
// after the row is written. Authenticates via a shared-secret header; writes
// the agent action through the service role (which is the only role with
// EXECUTE on record_agent_action — see migration 0006).
//
// Deploy:
//   supabase functions deploy evaluate-content --no-verify-jwt
//   supabase secrets set AGENT_INVOCATION_SECRET=...  (shared with the app)
//   (SUPABASE_SERVICE_ROLE_KEY is auto-injected by Supabase at runtime.)
//
// Invoke:
//   POST {FUNCTION_URL}  Headers: { x-agent-secret: <secret> }
//   Body: { type: "post" | "comment", id: "<uuid>" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseConstitution } from "../_shared/agent/constitution.ts";
import {
  analyzeContent,
  decide,
  detectDogpile,
  type AgentDecision,
  type Calibration,
} from "../_shared/agent/engine.ts";

type Room = {
  id: string;
  constitution: string;
};

type Post = {
  id: string;
  room_id: string;
  title: string;
  body: string;
};

type Comment = {
  id: string;
  room_id: string;
  post_id: string;
  parent_comment_id: string | null;
  body: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  // Structured single-line JSON — the seam Logflare/Sentry can ingest later.
  console.log(JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields }));
}

async function loadRoomState(supabase: ReturnType<typeof createClient>, roomId: string) {
  const [{ data: room }, { data: cal }] = await Promise.all([
    supabase.from("rooms").select("id, constitution").eq("id", roomId).single(),
    supabase.from("agent_calibration").select("*").eq("room_id", roomId).single(),
  ]);
  if (!room || !cal) return null;
  return {
    room: room as Room,
    cal: cal as Calibration,
    directives: parseConstitution((room as Room).constitution ?? ""),
  };
}

async function record(
  supabase: ReturnType<typeof createClient>,
  decision: AgentDecision,
  roomId: string,
  postId: string | null,
  targetType: "post" | "comment" | "thread",
  targetId: string,
  metrics: Record<string, unknown>,
) {
  const { error } = await supabase.rpc("record_agent_action", {
    p_room: roomId,
    p_post: postId,
    p_action: decision.action,
    p_trigger: decision.trigger,
    p_target_type: targetType,
    p_target: targetId,
    p_reason: decision.reason,
    p_metrics: metrics,
  });
  if (error) {
    log("error", "record_agent_action_failed", {
      room_id: roomId, post_id: postId, target_id: targetId,
      action: decision.action, error: error.message,
    });
  }
}

async function evaluatePost(supabase: ReturnType<typeof createClient>, postId: string) {
  const { data: post } = await supabase
    .from("posts")
    .select("id, room_id, title, body")
    .eq("id", postId)
    .single();
  if (!post) return;
  const p = post as Post;
  const state = await loadRoomState(supabase, p.room_id);
  if (!state) return;

  const metrics = analyzeContent(`${p.title}\n${p.body}`, state.directives, null);
  const decision = decide(metrics, state.cal, state.directives, "post");
  if (decision) {
    await record(supabase, decision, p.room_id, p.id, "post", p.id, { ...metrics });
  }
  log("info", "evaluated_post", { post_id: p.id, heat: metrics.heat, action: decision?.action ?? "none" });
}

async function evaluateComment(supabase: ReturnType<typeof createClient>, commentId: string) {
  const { data: comment } = await supabase
    .from("comments")
    .select("id, room_id, post_id, parent_comment_id, body")
    .eq("id", commentId)
    .single();
  if (!comment) return;
  const c = comment as Comment;

  const [state, { data: post }, { data: siblings }] = await Promise.all([
    loadRoomState(supabase, c.room_id),
    supabase.from("posts").select("id, title, body").eq("id", c.post_id).single(),
    supabase
      .from("comments")
      .select("author_persona_id, body, created_at, parent_comment_id")
      .eq("post_id", c.post_id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  if (!state || !post) return;
  const p = post as Post;

  const contextText = `${p.title}\n${p.body}\n${state.directives.valuesText}`;
  const metrics = analyzeContent(c.body, state.directives, contextText);
  const decision = decide(metrics, state.cal, state.directives, "comment");

  if (decision) {
    await record(supabase, decision, c.room_id, c.post_id, "comment", c.id, { ...metrics });
  }

  // Dogpile check.
  if (c.parent_comment_id) {
    const { data: parent } = await supabase
      .from("comments")
      .select("author_persona_id")
      .eq("id", c.parent_comment_id)
      .single();
    if (parent) {
      const replies = (siblings ?? []).filter(
        (s: { author_persona_id: string; body: string; created_at: string; parent_comment_id: string | null }) =>
          s.parent_comment_id === c.parent_comment_id,
      );
      const dogpile = detectDogpile(
        replies,
        parent.author_persona_id,
        state.cal,
        state.directives,
      );
      if (dogpile) {
        const { data: existing } = await supabase
          .from("agent_actions")
          .select("id")
          .eq("post_id", c.post_id)
          .eq("trigger_param", "dogpile_count")
          .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(1);
        if (!existing || existing.length === 0) {
          await record(supabase, dogpile, c.room_id, c.post_id, "thread", c.post_id, {
            replies: replies.length,
          });
        }
      }
    }
  }

  log("info", "evaluated_comment", {
    comment_id: c.id, heat: metrics.heat, action: decision?.action ?? "none",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Shared-secret auth. The app sends x-agent-secret; this prevents randoms
  // from triggering evaluations even though record_agent_action is itself
  // service-role-locked.
  const expected = Deno.env.get("AGENT_INVOCATION_SECRET");
  if (!expected) {
    log("error", "missing_secret_config", { name: "AGENT_INVOCATION_SECRET" });
    return json({ error: "Server misconfigured" }, 500);
  }
  const got = req.headers.get("x-agent-secret");
  if (!got || got.length !== expected.length || got !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { type?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.type || !body.id) {
    return json({ error: "Missing type or id" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    if (body.type === "post") {
      await evaluatePost(supabase, body.id);
    } else if (body.type === "comment") {
      await evaluateComment(supabase, body.id);
    } else {
      return json({ error: "Bad type" }, 400);
    }
    return json({ ok: true });
  } catch (err) {
    log("error", "evaluate_failed", {
      type: body.type, id: body.id, error: String(err),
    });
    return json({ error: "Evaluation failed" }, 500);
  }
});
