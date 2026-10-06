"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAssessmentCompletion } from "@/hooks/use-assessment-workspace";

export function CompletionMini({ assessmentId }: { assessmentId: string }) {
  const query = useAssessmentCompletion(assessmentId);

  if (query.isLoading) {
    return <div aria-label="Loading completion" className="mt-4 h-10 animate-pulse rounded-lg bg-muted" />;
  }
  if (query.isError) {
    return (
      <div className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
        <span>Completion details are unavailable.</span>
        <Button
          aria-label="Retry loading completion"
          onClick={() => void query.refetch()}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <RotateCw aria-hidden="true" />
        </Button>
      </div>
    );
  }

  if (!query.data) return null;
  const { mandatory, recommended } = query.data;
  return (
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-muted/60 px-3 py-2.5 text-xs">
      <span>
        <strong className="font-semibold text-foreground">{mandatory.confirmedMet}/{mandatory.total}</strong>
        <span className="ml-1 text-muted-foreground">mandatory confirmed</span>
      </span>
      <span>
        <strong className="font-semibold text-foreground">{recommended.confirmedMet}/{recommended.total}</strong>
        <span className="ml-1 text-muted-foreground">recommended confirmed</span>
      </span>
    </div>
  );
}
