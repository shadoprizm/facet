import { createReport } from "@/lib/actions";

/**
 * Report control. Renders as a small <details> (matching the existing Reply
 * pattern) so the form opens inline. Server-action form: hidden inputs +
 * fail()-redirect on error, ?notice= on success. No client state needed.
 */
export default function ReportButton({
  targetType,
  targetId,
  backTo,
}: {
  targetType: "post" | "comment";
  targetId: string;
  backTo: string;
}) {
  return (
    <details>
      <summary
        className="cursor-pointer text-xs"
        style={{ color: "var(--bad)" }}
        title="Send this to a human moderator"
      >
        🚩 Report
      </summary>
      <form action={createReport} className="mt-2 space-y-2">
        <input type="hidden" name="target_type" value={targetType} />
        <input type="hidden" name="target_id" value={targetId} />
        <input type="hidden" name="back_to" value={backTo} />
        <select className="input !w-auto text-xs" name="category" defaultValue="other">
          <option value="harassment">Harassment / personal attack</option>
          <option value="spam">Spam</option>
          <option value="off_topic">Off-topic / derailment</option>
          <option value="illegal">Illegal content</option>
          <option value="other">Other</option>
        </select>
        <textarea
          className="input text-xs"
          name="reason"
          rows={2}
          maxLength={500}
          placeholder="Why should a moderator look at this? (optional)"
        />
        <button className="btn btn-danger !py-1 text-xs">Submit report</button>
      </form>
    </details>
  );
}
