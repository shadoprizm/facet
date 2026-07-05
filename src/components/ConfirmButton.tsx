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
        // Always suppress the native submit and drive it ourselves. Relying on
        // the native submit while flipping `disabled` in the same tick can make
        // the browser cancel the submission, so the server action never fires.
        // requestSubmit() is programmatic and ignores the button's disabled
        // state, so gating `pending` is safe.
        e.preventDefault();
        if (!window.confirm(confirmMessage)) return;
        const form = e.currentTarget.form;
        if (!form) return;
        startTransition(() => {
          form.requestSubmit();
        });
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}
