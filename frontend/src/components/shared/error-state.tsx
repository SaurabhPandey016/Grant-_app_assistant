import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "We couldn’t load this information",
  message = "Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-rose-200 bg-rose-50/70 px-6 py-10 text-center"
      role="alert"
    >
      <AlertTriangle aria-hidden="true" className="mx-auto size-7 text-rose-700" />
      <h2 className="mt-3 text-base font-semibold text-rose-950">{title}</h2>
      <p className="mt-1 text-sm text-rose-900">{message}</p>
      <Button className="mt-5" onClick={onRetry} variant="outline">
        <RotateCw aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}
