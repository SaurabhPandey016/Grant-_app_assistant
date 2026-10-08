import { LoaderCircle, ServerCog } from "lucide-react";

export function BackendConnectionState({ message }: { message?: string }) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-5 text-center"
      role="status"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <ServerCog aria-hidden="true" className="size-7" />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">
        {message ?? "Connecting to the backend"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        This app uses Render’s free service, which may sleep when idle. Its first
        request can take a little while as the backend wakes up. Temporary
        connection failures are retried automatically; please keep this page open.
      </p>
      <LoaderCircle
        aria-label="Connecting"
        className="mt-5 size-5 animate-spin text-primary"
      />
    </section>
  );
}
