import { Info } from "lucide-react";

export function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/80 bg-card px-3 py-2.5 text-xs leading-5 text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <p>
        Workflow aid only. Not legal advice and not a funding-eligibility decision.
      </p>
    </div>
  );
}
