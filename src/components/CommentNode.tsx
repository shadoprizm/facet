import PersonaBadge from "./PersonaBadge";
import VoteButtons from "./VoteButtons";
import AgentActionCard from "./AgentActionCard";
import ReportButton from "./ReportButton";
import ConfirmButton from "./ConfirmButton";
import { createComment, deleteComment } from "@/lib/actions";
import type { AgentAction, Comment, Persona } from "@/lib/types";

export type ThreadContext = {
  postId: string;
  path: string;
  childrenMap: Map<string | null, Comment[]>;
  personaMap: Map<string, Persona>;
  mine: Set<string>;
  myVotes: Map<string, number>;
  actionsByTarget: Map<string, AgentAction[]>;
  myOverrides: Map<string, "uphold" | "override">;
};

/** Recursive threaded comment. Collapsed comments stay readable but folded. */
export default function CommentNode({
  comment,
  ctx,
  depth,
}: {
  comment: Comment;
  ctx: ThreadContext;
  depth: number;
}) {
  const children = ctx.childrenMap.get(comment.id) ?? [];
  const actions = ctx.actionsByTarget.get(comment.id) ?? [];

  const image = comment.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={comment.image_url}
      alt=""
      className="mt-2 max-h-80 w-auto max-w-full rounded-lg border"
      style={{ borderColor: "var(--border)" }}
    />
  ) : null;

  const body = comment.collapsed ? (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm" style={{ color: "var(--warn)" }}>
        🫧 Collapsed by the Room Agent — {comment.collapse_reason ?? "under review"} (click to read anyway)
      </summary>
      {comment.body && <p className="mt-2 whitespace-pre-wrap text-sm opacity-70">{comment.body}</p>}
      {image && <div className="opacity-70">{image}</div>}
    </details>
  ) : (
    <>
      {comment.body && <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>}
      {image}
    </>
  );

  return (
    <div
      className={depth > 0 ? "mt-3 border-l-2 pl-4" : "mt-3"}
      style={depth > 0 ? { borderColor: "var(--border)" } : {}}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <PersonaBadge
          persona={ctx.personaMap.get(comment.author_persona_id)}
          mine={ctx.mine.has(comment.author_persona_id)}
        />
        · {new Date(comment.created_at).toLocaleString()}
      </div>
      {body}
      <div className="mt-1 flex items-center gap-3">
        <VoteButtons
          targetType="comment"
          targetId={comment.id}
          score={comment.score}
          myVote={ctx.myVotes.get(`comment:${comment.id}`) ?? 0}
          path={ctx.path}
        />
        <details>
          <summary className="cursor-pointer text-xs" style={{ color: "var(--muted)" }}>
            Reply
          </summary>
          <form action={createComment} className="mt-2 space-y-2">
            <input type="hidden" name="post_id" value={ctx.postId} />
            <input type="hidden" name="parent_id" value={comment.id} />
            <textarea className="input" name="body" rows={2} placeholder="Reply as your active persona…" />
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="block w-full text-xs"
            />
            <button className="btn !py-1 text-xs">Reply</button>
          </form>
        </details>
        {ctx.mine.has(comment.author_persona_id) && comment.status === "active" ? (
          <form action={deleteComment}>
            <input type="hidden" name="comment_id" value={comment.id} />
            <input type="hidden" name="post_id" value={ctx.postId} />
            <ConfirmButton
              label="Delete"
              title="Removes your comment permanently (karma already earned stays)."
              confirmMessage="Delete this comment? It will be replaced with '[removed]' and cannot be undone."
            />
          </form>
        ) : (
          <ReportButton targetType="comment" targetId={comment.id} backTo={ctx.path} />
        )}
      </div>

      {actions.map((a) => (
        <AgentActionCard
          key={a.id}
          action={a}
          myVote={ctx.myOverrides.get(a.id) ?? null}
          path={ctx.path}
        />
      ))}

      {children.map((child) => (
        <CommentNode key={child.id} comment={child} ctx={ctx} depth={depth + 1} />
      ))}
    </div>
  );
}
