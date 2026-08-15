import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
        404
      </p>
      <h1 className="mt-3 text-3xl font-bold">That facet does not exist.</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        The address may be mistyped, or the page may have moved.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Return home
      </Link>
    </div>
  );
}
