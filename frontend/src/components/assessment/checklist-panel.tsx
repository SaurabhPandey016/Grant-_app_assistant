"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  FileText,
  type LucideIcon,
  LoaderCircle,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { EvidenceQuote } from "@/components/shared/evidence-quote";
import { LevelChip } from "@/components/shared/level-chip";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import type {
  AnalysisResult,
  ApiDocumentVersionResponse,
  CompletionSummary,
  EvidenceStatus,
  Requirement,
} from "@/lib/types";

type ReviewFilter = "ALL" | "PENDING" | "CONFIRMED" | "CORRECTED" | "REJECTED";
type LevelFilter = "ALL" | "MANDATORY" | "RECOMMENDED";
type StatusFilter = "ALL" | EvidenceStatus;

const evidenceStatuses: EvidenceStatus[] = [
  "SUPPORTED",
  "PARTIAL",
  "AMBIGUOUS",
  "MISSING",
];
const EMPTY_REQUIREMENTS: Requirement[] = [];

export function ChecklistPanel({
  assessmentId,
  analysis,
  completion,
  completionError,
  completionLoading,
  error,
  isLoading,
  onCompletionRetry,
  onRetry,
}: {
  assessmentId: string;
  analysis: AnalysisResult | null | undefined;
  completion: CompletionSummary | undefined;
  completionError: Error | null;
  completionLoading: boolean;
  error: Error | null;
  isLoading: boolean;
  onCompletionRetry: () => void;
  onRetry: () => void;
}) {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("ALL");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(null);

  const requirements = analysis?.requirements ?? EMPTY_REQUIREMENTS;
  const filteredRequirements = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return requirements.filter((requirement) => {
      const level = requirement.levelOverride ?? requirement.aiLevel;
      const status = requirement.mapping?.aiStatus ?? "MISSING";
      const decision = requirement.mapping?.reviewDecision ?? "PENDING";
      const effectiveStatus = getEffectiveStatus(requirement);
      const attention = effectiveStatus === "MISSING"
        || effectiveStatus === "PARTIAL"
        || effectiveStatus === "AMBIGUOUS"
        || requirement.sourceVerified !== true
        || (requirement.mapping?.evidence ?? []).some((item) => item.verified !== true)
        || (requirement.mapping?.reviewerEvidence ?? []).some((item) => item.verified !== true)
        || requirement.levelDisputed;

      return (
        (levelFilter === "ALL" || level === levelFilter)
        && (statusFilter === "ALL" || status === statusFilter)
        && (reviewFilter === "ALL" || decision === reviewFilter)
        && (!needsAttention || attention)
        && (!normalizedSearch
          || `${requirement.code} ${requirement.text} ${requirement.category}`.toLowerCase().includes(normalizedSearch))
      );
    });
  }, [levelFilter, needsAttention, requirements, reviewFilter, search, statusFilter]);

  if (isLoading) return <LoadingSkeleton rows={3} />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (!analysis) {
    return (
      <EmptyState
        description="Add both documents and run an analysis to create a requirement checklist."
        icon={FileText}
        title="No checklist yet"
      />
    );
  }
  if (!requirements.length) {
    return (
      <EmptyState
        description="The latest analysis did not identify requirements in the supplied guideline."
        icon={FileText}
        title="No requirements found"
      />
    );
  }

  const selectedRequirement = filteredRequirements.find(
    (requirement) => requirement.id === selectedRequirementId,
  ) ?? filteredRequirements[0] ?? null;

  return (
    <div className="space-y-5">
      {completionLoading ? (
        <LoadingSkeleton rows={1} />
      ) : completionError ? (
        <ErrorState
          message={completionError.message}
          onRetry={onCompletionRetry}
          title="Completion numbers could not be loaded"
        />
      ) : (
        <CompletionOverview completion={completion} />
      )}

      <section aria-label="Filter requirements" className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative block sm:col-span-2 xl:col-span-1">
            <span className="sr-only">Search requirements</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search checklist"
              type="search"
              value={search}
            />
          </label>
          <FilterSelect
            label="Level"
            onChange={(value) => setLevelFilter(value as LevelFilter)}
            options={[
              ["ALL", "All levels"],
              ["MANDATORY", "Mandatory"],
              ["RECOMMENDED", "Recommended"],
            ]}
            value={levelFilter}
          />
          <FilterSelect
            label="AI status"
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            options={[
              ["ALL", "All AI statuses"],
              ["SUPPORTED", "Supported"],
              ["PARTIAL", "Partial"],
              ["AMBIGUOUS", "Ambiguous"],
              ["MISSING", "Missing"],
            ]}
            value={statusFilter}
          />
          <FilterSelect
            label="Review state"
            onChange={(value) => setReviewFilter(value as ReviewFilter)}
            options={[
              ["ALL", "All review states"],
              ["PENDING", "Pending"],
              ["CONFIRMED", "Confirmed"],
              ["CORRECTED", "Corrected"],
              ["REJECTED", "Rejected"],
            ]}
            value={reviewFilter}
          />
          <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm">
            <input
              checked={needsAttention}
              className="size-4 accent-primary"
              onChange={(event) => setNeedsAttention(event.target.checked)}
              type="checkbox"
            />
            Needs attention
          </label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
          Showing {filteredRequirements.length} of {requirements.length} requirements.
        </p>
      </section>

      {!filteredRequirements.length ? (
        <EmptyState
          description="Try changing the filters or search phrase to see more requirements."
          icon={Search}
          title="No matching requirements"
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.4fr)]">
          <div aria-label="Requirements" className="space-y-3" role="list">
            {filteredRequirements.map((requirement) => (
              <RequirementListItem
                assessmentId={assessmentId}
                key={requirement.id}
                onSelect={() => setSelectedRequirementId(requirement.id)}
                requirement={requirement}
                selected={requirement.id === selectedRequirementId}
              />
            ))}
          </div>
          {selectedRequirement ? (
            <RequirementDetail
              assessmentId={assessmentId}
              key={selectedRequirement.id}
              requirement={selectedRequirement}
              run={analysis.run}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function CompletionOverview({ completion }: { completion: CompletionSummary | undefined }) {
  if (!completion) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Completion counts are loading or unavailable.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <CompletionCard
        title="Mandatory requirements"
        confirmed={completion.mandatory.confirmedMet}
        suggested={completion.mandatory.aiSuggestedMet}
        total={completion.mandatory.total}
      />
      <CompletionCard
        title="Recommended requirements"
        confirmed={completion.recommended.confirmedMet}
        suggested={completion.recommended.aiSuggestedMet}
        total={completion.recommended.total}
      />
      <MetricCard
        label="Pending review"
        value={completion.pendingReviewCount}
        icon={CircleHelp}
      />
      <MetricCard
        label="Unverified citations"
        value={completion.unverifiedCitationCount}
        icon={AlertTriangle}
      />
      <MetricCard
        label="Disputed levels"
        value={completion.disputedLevelCount}
        icon={AlertTriangle}
      />
    </div>
  );
}

function CompletionCard({
  title,
  confirmed,
  suggested,
  total,
}: {
  title: string;
  confirmed: number;
  suggested: number;
  total: number;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {confirmed} of {total} confirmed
      </p>
      <p className="mt-1 text-sm text-muted-foreground" aria-label={`${suggested} of ${total} with AI suggestions`}>
        With AI suggestions: <strong className="font-semibold text-foreground">{suggested} of {total}</strong>
      </p>
    </article>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <article className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  const id = `filter-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <select
        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </div>
  );
}

function RequirementListItem({
  assessmentId,
  requirement,
  selected,
  onSelect,
}: {
  assessmentId: string;
  requirement: Requirement;
  selected: boolean;
  onSelect: () => void;
}) {
  const queryClient = useQueryClient();
  const level = requirement.levelOverride ?? requirement.aiLevel;
  const reviewDecision = requirement.mapping?.reviewDecision ?? "PENDING";
  const status = requirement.mapping?.aiStatus ?? "MISSING";
  const citationUnverified = requirement.sourceVerified !== true
    || (requirement.mapping?.evidence ?? []).some((item) => item.verified !== true)
    || (requirement.mapping?.reviewerEvidence ?? []).some((item) => item.verified !== true);
  const override = useMutation({
    mutationFn: (levelOverride: "MANDATORY" | "RECOMMENDED" | null) =>
      apiRequest(`/api/requirements/${requirement.id}/level`, {
        method: "PATCH",
        body: JSON.stringify({ levelOverride }),
      }),
    onSuccess: async () => {
      await invalidateChecklistQueries(queryClient, assessmentId);
      toast.success("Requirement level updated.");
    },
    onError: (error) => toast.error(error.message || "Could not update requirement level."),
  });

  return (
    <article
      className={`rounded-2xl border bg-card p-4 shadow-sm transition ${
        selected ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/40"
      }`}
      role="listitem"
    >
      <button
        aria-current={selected ? "true" : undefined}
        className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        type="button"
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{requirement.code}</span>
          <StatusChip status={status} />
        </span>
        <span className="mt-2 block text-sm font-semibold leading-5">{requirement.text}</span>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LevelChip level={level} />
        {requirement.levelDisputed ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            Please check level
          </span>
        ) : null}
        {citationUnverified ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-950">
            <AlertTriangle aria-hidden="true" className="size-3.5" />
            Citation could not be verified
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <StatusChip status={reviewDecision} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">Override level for {requirement.code}</span>
          <select
            aria-label={`Override level for ${requirement.code}`}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={override.isPending}
            onChange={(event) => {
              const next = event.target.value;
              void override.mutate(next === "AI" ? null : next as "MANDATORY" | "RECOMMENDED");
            }}
            value={requirement.levelOverride ?? "AI"}
          >
            <option value="AI">AI level</option>
            <option value="MANDATORY">Mandatory</option>
            <option value="RECOMMENDED">Recommended</option>
          </select>
        </label>
      </div>
      {requirement.mapping?.rationale ? (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {requirement.mapping.rationale}
        </p>
      ) : null}
    </article>
  );
}

function RequirementDetail({
  assessmentId,
  requirement,
  run,
}: {
  assessmentId: string;
  requirement: Requirement;
  run: AnalysisResult["run"];
}) {
  const queryClient = useQueryClient();
  const [reviewerStatus, setReviewerStatus] = useState<EvidenceStatus>(
    requirement.mapping?.reviewerStatus ?? requirement.mapping?.aiStatus ?? "MISSING",
  );
  const [note, setNote] = useState(requirement.mapping?.reviewerNote ?? "");
  const [reviewEvidence, setReviewEvidence] = useState<Array<{ segmentId: string; quote: string }>>(
    (requirement.mapping?.reviewerEvidence ?? []).map(({ segmentId, quote }) => ({ segmentId, quote })),
  );
  const [rejectOpen, setRejectOpen] = useState(false);

  const applicationVersion = useQuery({
    queryKey: ["document-version", run.applicationVersionId],
    queryFn: async () => {
      const response = await apiRequest<ApiDocumentVersionResponse>(
        `/api/documents/${run.applicationVersionId}`,
      );
      return response.version;
    },
    enabled: Boolean(run.applicationVersionId),
  });

  const review = useMutation({
    mutationFn: (decision: "CONFIRMED" | "CORRECTED" | "REJECTED") =>
      apiRequest(`/api/requirements/${requirement.id}/mapping/review`, {
        method: "PATCH",
        body: JSON.stringify({
          decision,
          ...(decision === "CORRECTED" ? { reviewerStatus } : {}),
          ...(reviewEvidence.length ? { evidence: reviewEvidence } : {}),
          note: note.trim() || null,
        }),
      }),
    onSuccess: async () => {
      await invalidateChecklistQueries(queryClient, assessmentId);
      toast.success("Review decision saved.");
      setRejectOpen(false);
    },
    onError: (error) => toast.error(error.message || "Could not save the review decision."),
  });

  const evidenceItems = requirement.mapping?.evidence ?? [];
  const reviewerEvidence = requirement.mapping?.reviewerEvidence ?? [];
  const citedSegmentIds = Array.from(new Set([
    ...evidenceItems.map((item) => item.segmentId),
    ...reviewerEvidence.map((item) => item.segmentId),
  ]));

  function attachSelection() {
    const selection = window.getSelection();
    const quote = selection?.toString().trim();
    const anchor = selection?.anchorNode;
    const element = anchor instanceof Element
      ? anchor
      : anchor?.parentElement;
    const segmentElement = element?.closest<HTMLElement>("[data-segment-id]");
    const segmentId = segmentElement?.dataset.segmentId;
    const focus = selection?.focusNode;
    const focusElement = focus instanceof Element ? focus : focus?.parentElement;
    const focusSegmentId = focusElement?.closest<HTMLElement>("[data-segment-id]")?.dataset.segmentId;
    if (!quote || !segmentId) {
      toast.error("Select text inside an application segment first.");
      return;
    }
    if (focusSegmentId !== segmentId) {
      toast.error("Select evidence from a single application segment at a time.");
      return;
    }
    if (quote.length < 12) {
      toast.error("Select at least 12 characters so the citation can be verified.");
      return;
    }
    if (quote.length > 4000) {
      toast.error("Selected evidence must be 4,000 characters or fewer.");
      return;
    }
    setReviewEvidence((current) => (
      current.some((item) => item.segmentId === segmentId && item.quote === quote)
        ? current
        : [...current, { segmentId, quote }]
    ));
    selection?.removeAllRanges();
    toast.success(`Evidence from ${segmentId} attached to this correction.`);
  }

  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">{requirement.code}</span>
          <LevelChip level={requirement.levelOverride ?? requirement.aiLevel} />
          <StatusChip status={getEffectiveStatus(requirement)} />
          <StatusChip status={requirement.mapping?.reviewDecision ?? "PENDING"} />
        </div>
        <h2 className="mt-3 text-lg font-semibold leading-7">{requirement.text}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{requirement.category.toLowerCase()} requirement</p>
      </div>

      <div className="grid min-w-0 lg:grid-cols-2">
        <div className="min-w-0 space-y-4 border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Guideline source</h3>
            <EvidenceQuote
              quote={requirement.sourceQuote}
              sourceLabel={`Segment ${requirement.sourceSegmentId}`}
              verified={requirement.sourceVerified}
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">AI rationale</h3>
            <p className="rounded-xl bg-muted/60 p-3 text-sm leading-6">
              {requirement.mapping?.rationale || "No rationale was provided for this mapping."}
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">AI evidence</h3>
            {evidenceItems.length ? (
              <div className="space-y-2">
                {evidenceItems.map((item, index) => (
                  <EvidenceQuote
                    key={`${item.segmentId}-${index}`}
                    quote={item.quote}
                    sourceLabel={`Application ${item.segmentId}`}
                    verified={item.verified}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                No application evidence was cited.
              </p>
            )}
          </section>

          {reviewerEvidence.length ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Reviewer evidence</h3>
              <div className="space-y-2">
                {reviewerEvidence.map((item, index) => (
                  <EvidenceQuote
                    key={`${item.segmentId}-reviewer-${index}`}
                    quote={item.quote}
                    sourceLabel={`Application ${item.segmentId}`}
                    verified={item.verified}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <section className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Application text</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Cited segments are marked. Select a passage to attach it as reviewer evidence.
              </p>
            </div>
            <Button
              disabled={review.isPending}
              onClick={attachSelection}
              size="sm"
              type="button"
              variant="outline"
            >
              <ShieldCheck aria-hidden="true" />
              Attach selected text
            </Button>
          </div>

          {applicationVersion.isLoading ? (
            <div className="mt-4"><LoadingSkeleton rows={3} /></div>
          ) : applicationVersion.isError ? (
            <div className="mt-4">
              <ErrorState
                message={applicationVersion.error.message}
                onRetry={() => void applicationVersion.refetch()}
                title="Application source could not be loaded"
              />
            </div>
          ) : !applicationVersion.data ? (
            <p className="mt-4 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              No application version is associated with this analysis.
            </p>
          ) : (
            <ApplicationSegments
              citedSegmentIds={citedSegmentIds}
              segments={applicationVersion.data.segments ?? []}
            />
          )}

          {reviewEvidence.length ? (
            <div className="mt-4 rounded-xl border border-primary/20 bg-accent/50 p-3">
              <p className="text-xs font-semibold">Evidence to save with correction</p>
              <ul className="mt-2 space-y-2">
                {reviewEvidence.map((item, index) => (
                  <li className="flex items-start justify-between gap-2 text-xs" key={`${item.segmentId}-${index}`}>
                    <span className="leading-5">
                      <span className="font-mono font-semibold">{item.segmentId}</span>: “{item.quote}”
                    </span>
                    <button
                      aria-label={`Remove evidence quote from ${item.segmentId}`}
                      className="rounded p-1 hover:bg-white"
                      disabled={review.isPending}
                      onClick={() => setReviewEvidence((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      type="button"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <div className="border-t border-border p-4 sm:p-5">
        <label className="block text-sm font-medium" htmlFor={`review-note-${requirement.id}`}>
          Reviewer note <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={`review-note-${requirement.id}`}
          maxLength={5000}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Record why you confirmed or changed this mapping."
          value={note}
        />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={review.isPending}
              onClick={() => review.mutate("CONFIRMED")}
              type="button"
            >
              {review.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
              Confirm
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`correct-status-${requirement.id}`}>Corrected status</label>
              <select
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={review.isPending}
                id={`correct-status-${requirement.id}`}
                onChange={(event) => setReviewerStatus(event.target.value as EvidenceStatus)}
                value={reviewerStatus}
              >
                {evidenceStatuses.map((status) => (
                  <option key={status} value={status}>{readable(status)}</option>
                ))}
              </select>
              <Button
                disabled={review.isPending}
                onClick={() => review.mutate("CORRECTED")}
                type="button"
                variant="outline"
              >
                Correct
              </Button>
            </div>
            <Button
              disabled={review.isPending}
              onClick={() => setRejectOpen(true)}
              type="button"
              variant="destructive"
            >
              Reject
            </Button>
          </div>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">
            Review is allowed on older analysis versions; current document changes do not erase this decision.
          </p>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel={review.isPending ? "Saving…" : "Reject mapping"}
        confirmDisabled={review.isPending}
        cancelDisabled={review.isPending}
        description="This marks the mapping as rejected by your review. It will count as missing in the completion totals."
        onCancel={() => setRejectOpen(false)}
        onConfirm={() => review.mutate("REJECTED")}
        open={rejectOpen}
        title="Reject this mapping?"
      />
    </section>
  );
}

function ApplicationSegments({
  segments,
  citedSegmentIds,
}: {
  segments: Array<{ id: string; text: string; start: number; end: number }>;
  citedSegmentIds: string[];
}) {
  const segmentRefs = useRef(new Map<string, HTMLElement>());
  const firstCitedId = citedSegmentIds[0] ?? null;

  useEffect(() => {
    if (!firstCitedId) return;
    const frame = window.requestAnimationFrame(() => {
      segmentRefs.current.get(firstCitedId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [firstCitedId]);

  if (!segments.length) {
    return (
      <p className="mt-4 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
        This application version does not contain readable segments.
      </p>
    );
  }

  return (
    <div className="mt-4 max-h-[34rem] space-y-2 overflow-auto rounded-xl border border-border bg-muted/30 p-3">
      {segments.map((segment) => {
        const cited = citedSegmentIds.includes(segment.id);
        return (
          <article
            className={`scroll-mt-20 rounded-lg border p-3 ${
              cited
                ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200"
                : "border-transparent bg-card"
            }`}
            data-segment-id={segment.id}
            key={segment.id}
            ref={(element) => {
              if (element) segmentRefs.current.set(segment.id, element);
              else segmentRefs.current.delete(segment.id);
            }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-muted-foreground">{segment.id}</span>
              <span className="text-[11px] text-muted-foreground" title="Character offsets in the original application document">
                Characters {segment.start}–{segment.end}
              </span>
              {cited ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-950">
                  <FileText aria-hidden="true" className="size-3.5" />
                  Cited evidence
                </span>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{segment.text}</p>
          </article>
        );
      })}
    </div>
  );
}

function getEffectiveStatus(requirement: Requirement): EvidenceStatus {
  const mapping = requirement.mapping;
  if (!mapping) return "MISSING";
  if (mapping.reviewDecision === "REJECTED") return "MISSING";
  if (mapping.reviewDecision === "CORRECTED") return mapping.reviewerStatus ?? "MISSING";
  return mapping.aiStatus;
}

function readable(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

async function invalidateChecklistQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  assessmentId?: string,
) {
  const keys: readonly unknown[][] = assessmentId
    ? [
        ["analysis-latest", assessmentId],
        ["assessment-completion", assessmentId],
        ["review-summary", assessmentId],
      ]
    : [["assessment-completion"]];
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
