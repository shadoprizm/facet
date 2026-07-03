/** Renders ?error= / ?notice= query feedback from server actions. */
export default function Banner({
  error,
  notice,
}: {
  error?: string | string[];
  notice?: string | string[];
}) {
  const e = Array.isArray(error) ? error[0] : error;
  const n = Array.isArray(notice) ? notice[0] : notice;
  if (!e && !n) return null;
  return (
    <div
      className="panel mb-4 px-4 py-3 text-sm"
      style={
        e
          ? { borderColor: "rgba(248,113,113,0.5)", color: "var(--bad)" }
          : { borderColor: "rgba(52,211,153,0.5)", color: "var(--good)" }
      }
    >
      {e ?? n}
    </div>
  );
}
