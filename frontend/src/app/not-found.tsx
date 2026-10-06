import Link from "next/link";
import { ArrowLeft, Sprout } from "lucide-react";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Sprout aria-hidden="true" className="size-7" />
      </span>
      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-primary">404 · Page not found</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">We couldn’t find that page</h1>
      <p className="mt-3 text-muted-foreground">
        The link may be outdated, or the page may have moved.
      </p>
      <Link
        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href="/assessments"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to assessments
      </Link>
      <Link className="mt-4 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/login">
        Go to sign in
      </Link>
    </main>
  );
}
