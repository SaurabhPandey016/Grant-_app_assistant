"use client";

import { ArrowRight, ClipboardList, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StaleBanner } from "@/components/shared/stale-banner";
import { StatusChip } from "@/components/shared/status-chip";
import { CompletionMini } from "@/components/assessment/completion-mini";
import { useAssessments } from "@/hooks/use-assessments";
import type { Assessment } from "@/lib/types";

function AssessmentCard({ assessment }: { assessment: Assessment }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <Link
            className="text-lg font-semibold tracking-tight hover:text-primary"
            href={`/assessments/${assessment.id}`}
          >
            {assessment.name}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {assessment.createdAt ? new Date(assessment.createdAt).toLocaleDateString() : "recently"}
          </p>
        </div>
        <StatusChip status={assessment.latestRun?.status ?? "NOT_STARTED"} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DocumentStatus
          kind="Guideline"
          title={assessment.currentGuidelineVersion?.title}
          versionNo={assessment.currentGuidelineVersion?.versionNo}
        />
        <DocumentStatus
          kind="Application draft"
          title={assessment.currentApplicationVersion?.title}
          versionNo={assessment.currentApplicationVersion?.versionNo}
        />
      </div>

      {assessment.stale ? (
        <div className="mt-4">
          <StaleBanner reasons={assessment.reasons} />
        </div>
      ) : null}
      {assessment.latestRun?.status === "COMPLETED" ? (
        <CompletionMini assessmentId={assessment.id} />
      ) : null}

      <div className="mt-5 flex justify-end">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          href={`/assessments/${assessment.id}`}
        >
          Open assessment
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  );
}

function DocumentStatus({
  kind,
  title,
  versionNo,
}: {
  kind: string;
  title?: string;
  versionNo?: number;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl bg-muted/70 p-3.5">
      <ClipboardList aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kind}</p>
        <p className="mt-1 truncate text-sm font-medium">
          {title ? `${title}${versionNo ? ` · v${versionNo}` : ""}` : "Not added yet"}
        </p>
      </div>
    </div>
  );
}

export default function AssessmentsPage() {
  const router = useRouter();
  const assessments = useAssessments();

  return (
    <section>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Your workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Assessments</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Organize your draft applications and the grant guidelines you are reviewing.
          </p>
        </div>
        <Button onClick={() => router.push("/assessments/new")}>
          <FilePlus2 aria-hidden="true" />
          New assessment
        </Button>
      </div>

      {assessments.isLoading ? <LoadingSkeleton rows={3} /> : null}
      {assessments.isError ? (
        <ErrorState
          message={assessments.error.message}
          onRetry={() => void assessments.refetch()}
        />
      ) : null}
      {assessments.isSuccess && assessments.data.length === 0 ? (
        <EmptyState
          actionLabel="Create your first assessment"
          description="Start by creating an assessment. You can then add the grant guideline and application draft."
          icon={ClipboardList}
          onAction={() => router.push("/assessments/new")}
          title="No assessments yet"
        />
      ) : null}
      {assessments.isSuccess && assessments.data.length > 0 ? (
        <div className="grid gap-4">
          {assessments.data.map((assessment) => (
            <AssessmentCard assessment={assessment} key={assessment.id} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
