import type { SupabaseClient } from "@supabase/supabase-js";
import { parseConstitution } from "./constitution";
import { analyzeContent, decide, detectDogpile, type AgentDecision } from "./engine";
import type { Calibration, Comment, Post, Room } from "@/lib/types";

/**
 * Agent runtime. Runs synchronously in the request path after content is
 * created — the whole evaluation is local math (lexicon + hashed vectors),
 * so it adds microseconds, not API calls.
 */

async function loadRoomState(supabase: SupabaseClient, roomId: string) {
  const [{ data: room }, { data: cal }] = await Promise.all([
    supabase.from("rooms").select("*").eq("id", roomId).single(),
    supabase.from("agent_calibration").select("*").eq("room_id", roomId).single(),
  ]);
  if (!room || !cal) return null;
  return {
    room: room as Room,
    cal: cal as Calibration,
    directives: parseConstitution((room as Room).constitution),
  };
}

async function record(
  supabase: SupabaseClient,
  roomId: string,
  postId: string | null,
  d: AgentDecision,
  targetType: "post" | "comment" | "thread",
  targetId: string,
  metrics: Record<string, unknown>
) {
  await supabase.rpc("record_agent_action", {
    p_room: roomId,
    p_post: postId,
    p_action: d.action,
    p_trigger: d.trigger,
    p_target_type: targetType,
    p_target: targetId,
    p_reason: d.reason,
    p_metrics: metrics,
  });
}

export async function runAgentOnPost(supabase: SupabaseClient, postId: string) {
  const { data: post } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .single();
  if (!post) return;
  const state = await loadRoomState(supabase, (post as Post).room_id);
  if (!state) return;

  const p = post as Post;
  const metrics = analyzeContent(`${p.title}\n${p.body}`, state.directives, null);
  const decision = decide(metrics, state.cal, state.directives, "post");
  if (decision) {
    await record(supabase, p.room_id, p.id, decision, "post", p.id, {
      ...metrics,
    });
  }
}

export async function runAgentOnComment(
  supabase: SupabaseClient,
  commentId: string
) {
  const { data: comment } = await supabase
    .from("comments")
    .select("*")
    .eq("id", commentId)
    .single();
  if (!comment) return;
  const c = comment as Comment;

  const [state, { data: post }, { data: siblings }] = await Promise.all([
    loadRoomState(supabase, c.room_id),
    supabase.from("posts").select("*").eq("id", c.post_id).single(),
    supabase
      .from("comments")
      .select("author_persona_id, body, created_at, parent_comment_id")
      .eq("post_id", c.post_id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  if (!state || !post) return;
  const p = post as Post;

  // Topic baseline = the post itself + the community's values prose.
  const contextText = `${p.title}\n${p.body}\n${state.directives.valuesText}`;
  const metrics = analyzeContent(c.body, state.directives, contextText);
  const decision = decide(metrics, state.cal, state.directives, "comment");

  if (decision) {
    await record(supabase, c.room_id, c.post_id, decision, "comment", c.id, {
      ...metrics,
    });
  }

  // Dogpile check: is this comment part of a pile-on against one persona?
  if (c.parent_comment_id) {
    const { data: parent } = await supabase
      .from("comments")
      .select("author_persona_id")
      .eq("id", c.parent_comment_id)
      .single();
    if (parent) {
      const replies = (siblings ?? []).filter(
        (s) => s.parent_comment_id === c.parent_comment_id
      );
      const dogpile = detectDogpile(
        replies,
        parent.author_persona_id,
        state.cal,
        state.directives
      );
      if (dogpile) {
        // Only one thread-level dogpile nudge per hour per post.
        const { data: existing } = await supabase
          .from("agent_actions")
          .select("id")
          .eq("post_id", c.post_id)
          .eq("trigger_param", "dogpile_count")
          .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(1);
        if (!existing || existing.length === 0) {
          await record(
            supabase,
            c.room_id,
            c.post_id,
            dogpile,
            "thread",
            c.post_id,
            { replies: replies.length }
          );
        }
      }
    }
  }
}
