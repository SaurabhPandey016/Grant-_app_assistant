"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  MessageCircleQuestion,
  Play,
  ShieldAlert,
  Sparkles,
  ClipboardCheck,
  FolderOpen,
  FileCheck2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DocumentPanel } from "@/components/assessment/document-panel";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StaleBanner } from "@/components/shared/stale-banner";
import { StatusChip } from "@/components/shared/status-chip";
import {
  useAssessment,
  useAssessmentCompletion,
  useAssessmentStatus,
} from "@/hooks/use-assessment-workspace";
import { apiRequest, ApiError } from "@/lib/api";
import { ChecklistPanel } from "@/components/assessment/checklist-panel";
import {
  ClaimsPanel,
  QuestionsPanel,
  SummaryPanel,
  SupportingPanel,
} from "@/components/assessment/review-tabs";
import type {
  ApiAnalysisResponse,
  ApiAnalysisRunResponse,
  ApiAnalysisStartResponse,
} from "@/lib/types";

const tabs: Array<{ id: WorkspaceTab; label: string; icon: LucideIcon }> = [
  { id: "documents", label: "Documents", icon: FileText },
  { id: "checklist", label: "Checklist", icon: ClipboardCheck },
  { id: "questions", label: "Questions", icon: MessageCircleQuestion },
  { id: "claims", label: "Claims", icon: ShieldAlert },
  { id: "supporting", label: "Supporting docs", icon: FolderOpen },
  { id: "summary", label: "Summary", icon: FileCheck2 },
];

type WorkspaceTab = "documents" | "checklist" | "questions" | "claims" | "supporting" | "summary";

export function AssessmentWorkspace({ assessmentId }: { assessmentId: string }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("documents");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const assessmentQuery = useAssessment(assessmentId);
  const statusQuery = useAssessmentStatus(assessmentId);
  const pollRunId = activeRunId ?? statusQuery.data?.latestRun?.id ?? null;
  const analysisRunQuery = useQuery({
    queryKey: ["analysis-run", assessmentId, pollRunId],
    queryFn: () => apiRequest<ApiAnalysisRunResponse>(
      `/api/assessments/${assessmentId}/analysis/runs/${pollRunId}`,
    ),
    enabled: Boolean(pollRunId),
    refetchInterval: (query) => (
      query.state.data?.run.status === "RUNNING" ? 2000 : false
    ),
  });
  const completionQuery = useAssessmentCompletion(assessmentId, Boolean(statusQuery.data));
  const analysisQuery = useQuery({
    queryKey: ["analysis-latest", assessmentId],
    queryFn: async () => {
      try {
        const response = await apiRequest<ApiAnalysisResponse>(
          `/api/assessments/${assessmentId}/analysis/latest`,
        );
        return response.analysis;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(statusQuery.data),
  });
  const runAnalysis = useMutation({
    mutationFn: () =>
      apiRequest<ApiAnalysisStartResponse>(`/api/assessments/${assessmentId}/analysis`, {
        method: "POST",
      }),
    onSuccess: async (response) => {
        activeRunIdRef.current = response.run.id;
        setActiveRunId(response.run.id);
      toast.info("Analysis started.");
      await invalidateAssessmentQueries(queryClient, assessmentId);
    },
    onError: (error) => {
      toast.error(error.message || "Analysis failed. Please retry.");
    },
  });
  useEffect(() => {
    const run = analysisRunQuery.data?.run;
    if (!run || run.status === "RUNNING") return;

    void invalidateAssessmentQueries(queryClient, assessmentId);
    if (run.id === activeRunId) {
      if (activeRunIdRef.current !== run.id) return;
      activeRunIdRef.current = null;
      if (run.status === "COMPLETED") {
        toast.success("Analysis complete.");
      } else {
        toast.error(run.error || "Analysis failed. Please retry.");
      }
    }
  }, [activeRunId, analysisRunQuery.data, assessmentId, queryClient]);

  if (assessmentQuery.isLoading || statusQuery.isLoading) {
    return <LoadingSkeleton rows={4} />;
  }
  if (assessmentQuery.isError || statusQuery.isError) {
    const error = assessmentQuery.error ?? statusQuery.error;
    return (
      <ErrorState
        message={error?.message}
        onRetry={() => {
          void assessmentQuery.refetch();
          void statusQuery.refetch();
        }}
        title="Assessment could not be loaded"
      />
    );
  }
  if (!assessmentQuery.data || !statusQuery.data) return null;

  const assessment = assessmentQuery.data;
  const status = statusQuery.data;
  const completion = completionQuery.data;
  const completedAnalysis = analysisQuery.data;
  const running = runAnalysis.isPending
    || status.latestRun?.status === "RUNNING"
    || analysisRunQuery.data?.run.status === "RUNNING";
  const canRunAnalysis = Boolean(
    status.currentGuidelineVersion && status.currentApplicationVersion,
  );
  const rerun = () => runAnalysis.mutate();

  return (
    <section>
      <Link
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        href="/assessments"
      >
        <span aria-hidden="true">←</span>
        All assessments
      </Link>

      <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{assessment.name}</h1>
              {status.stale ? <StatusChip status="STALE" /> : null}
              {status.latestRun ? <StatusChip status={status.latestRun.status} /> : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Created {assessment.createdAt ? new Date(assessment.createdAt).toLocaleDateString() : "recently"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CompletionBadge
                label="Mandatory confirmed"
                met={completion?.mandatory.confirmedMet}
                total={completion?.mandatory.total}
              />
              <CompletionBadge
                label="Recommended confirmed"
                met={completion?.recommended.confirmedMet}
                total={completion?.recommended.total}
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            <Button disabled={running || !canRunAnalysis} onClick={rerun}>
              {running ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Play aria-hidden="true" />
              )}
              {running ? "Analysis in progress…" : status.latestRun ? "Run analysis again" : "Run analysis"}
            </Button>
            {running ? (
              <p className="max-w-56 text-xs leading-5 text-muted-foreground">
                This can take up to a minute. You can keep this page open while it runs.
              </p>
            ) : !canRunAnalysis ? (
              <p className="max-w-56 text-xs leading-5 text-muted-foreground">
                Add both the guideline and application draft to run analysis.
              </p>
            ) : null}
            {status.latestRun?.provider ? (
              <p className="text-xs text-muted-foreground">
                Provider: <span className="font-medium text-foreground">{status.latestRun.provider}</span>
                {status.latestRun.model ? ` · ${status.latestRun.model}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        {status.stale ? (
          <div className="mt-5">
            <StaleBanner
              onRerun={canRunAnalysis ? rerun : undefined}
              reasons={status.reasons}
              rerunning={running}
            />
          </div>
        ) : null}
        {status.latestRun?.provider === "heuristic-fallback" || completedAnalysis?.run.provider === "heuristic-fallback" ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
            <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p><strong>AI was unavailable; heuristic results.</strong> Review these deterministic suggestions carefully.</p>
          </div>
        ) : null}
        {runAnalysis.error || status.latestRun?.status === "FAILED" ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div>
              <p className="font-semibold">Analysis failed</p>
              <p className="mt-1">
                {runAnalysis.error?.message || status.latestRun?.error || "Analysis failed. Please retry."}
              </p>
            </div>
            <Button disabled={!canRunAnalysis || running} onClick={rerun} size="sm" variant="outline">
              Retry analysis
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mb-5 overflow-x-auto border-b border-border">
        <div aria-label="Assessment sections" className="flex min-w-max gap-1" role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              aria-controls={`workspace-panel-${id}`}
              aria-selected={activeTab === id}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              id={`workspace-tab-${id}`}
              key={id}
              onClick={() => setActiveTab(id)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        aria-labelledby={`workspace-tab-${activeTab}`}
        id={`workspace-panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === "documents" ? (
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <DocumentPanel
              assessmentId={assessmentId}
              currentVersionId={status.currentGuidelineVersion?.id ?? null}
              kind="GUIDELINE"
              onVersionCreated={() => {
                toast.info("The assessment is now stale. Run analysis again to use the updated document.");
              }}
            />
            <DocumentPanel
              assessmentId={assessmentId}
              currentVersionId={status.currentApplicationVersion?.id ?? null}
              kind="APPLICATION"
              onVersionCreated={() => {
                toast.info("The assessment is now stale. Run analysis again to use the updated document.");
              }}
            />
          </div>
        ) : null}
        {activeTab === "checklist" ? (
          <ChecklistPanel
            assessmentId={assessmentId}
            analysis={completedAnalysis}
            completion={completion}
            completionError={completionQuery.error}
            completionLoading={completionQuery.isLoading}
            onCompletionRetry={() => void completionQuery.refetch()}
            error={analysisQuery.error}
            isLoading={analysisQuery.isLoading}
            onRetry={() => void analysisQuery.refetch()}
          />
        ) : null}
        {activeTab === "questions" ? (
          <QuestionsPanel
            assessmentId={assessmentId}
            analysis={completedAnalysis}
            error={analysisQuery.error}
            isLoading={analysisQuery.isLoading}
            onRetry={() => void analysisQuery.refetch()}
          />
        ) : null}
        {activeTab === "claims" ? (
          <ClaimsPanel
            assessmentId={assessmentId}
            analysis={completedAnalysis}
            error={analysisQuery.error}
            isLoading={analysisQuery.isLoading}
            onRetry={() => void analysisQuery.refetch()}
          />
        ) : null}
        {activeTab === "supporting" ? (
          <SupportingPanel
            analysis={completedAnalysis}
            assessmentId={assessmentId}
            completion={completion}
            completionError={completionQuery.error}
            completionLoading={completionQuery.isLoading}
            onCompletionRetry={() => void completionQuery.refetch()}
          />
        ) : null}
        {activeTab === "summary" ? (
          <SummaryPanel
            assessmentId={assessmentId}
            canGenerate={status.latestRun?.status === "COMPLETED"}
          />
        ) : null}
      </div>
    </section>
  );
}

function CompletionBadge({
  label,
  met,
  total,
}: {
  label: string;
  met?: number;
  total?: number;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs">
      <CheckCircle2 aria-hidden="true" className="size-3.5 text-primary" />
      <span>{label}</span>
      <strong className="font-semibold">{met === undefined || total === undefined ? "—" : `${met}/${total}`}</strong>
    </div>
  );
}

async function invalidateAssessmentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  assessmentId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["assessment-status", assessmentId] }),
    queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
    queryClient.invalidateQueries({ queryKey: ["assessment-completion", assessmentId] }),
    queryClient.invalidateQueries({ queryKey: ["analysis-latest", assessmentId] }),
    queryClient.invalidateQueries({ queryKey: ["review-summary", assessmentId] }),
    queryClient.invalidateQueries({ queryKey: ["assessments"] }),
  ]);
}
