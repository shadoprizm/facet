"use client";

import { useTransition } from "react";

/**
 * A form-submit button guarded by window.confirm(). The codebase convention is
 * "destructive fires immediately with a tooltip" — but content deletion is
 * irreversible enough to warrant a guard. This is the only confirm-dialog
 * primitive in the app; used just for delete controls.
 *
 * Usage: drop inside any <form action={...}> in place of <button>. It submits
 * the enclosing form only after confirmation.
 */
export default function ConfirmButton({
  label,
  confirmMessage,
  className = "btn btn-danger !py-1 text-xs",
  title,
}: {
  label: string;
  confirmMessage: string;
  className?: string;
  title?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      title={title}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
          return;
        }
        // The native form submit will carry the action; the transition just
        // gates the disabled state for the duration.
        startTransition(async () => {
          // no-op — the form's action runs the redirect
        });
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}
