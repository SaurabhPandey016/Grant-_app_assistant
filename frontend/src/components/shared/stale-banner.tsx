import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StaleBanner({
  reasons = [],
  onRerun,
  rerunning = false,
}: {
  reasons?: string[];
  onRerun?: () => void;
  rerunning?: boolean;
}) {
  const changed = reasons
    .flatMap((reason) => {
      if (reason === "GUIDELINE_CHANGED") return ["guideline"];
      if (reason === "APPLICATION_CHANGED") return ["application"];
      return [];
    })
    .join(" and ");
  const noRun = reasons.includes("NO_RUN");

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <RefreshCw aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="text-sm font-semibold">
          {noRun ? "No analysis yet" : "This assessment is out of date"}
        </p>
        <p className="mt-1 text-sm text-amber-900">
          {noRun
            ? "Add both documents before running an analysis."
            : changed
            ? `The ${changed} changed after the latest analysis.`
            : "Run a new analysis to update these results."}
        </p>
        {onRerun && !noRun ? (
          <Button
            className="mt-3 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
            disabled={rerunning}
            onClick={onRerun}
            size="sm"
            variant="outline"
          >
            {rerunning ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            {rerunning ? "Analysis running…" : "Re-run analysis"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
