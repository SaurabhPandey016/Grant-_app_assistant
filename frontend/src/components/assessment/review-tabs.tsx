"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Download,
  FileCheck2,
  FileText,
  LoaderCircle,
  Plus,
  Printer,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { EvidenceQuote } from "@/components/shared/evidence-quote";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { StaleBanner } from "@/components/shared/stale-banner";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { useSupportingDocuments } from "@/hooks/use-assessment-workspace";
import { ApiError, apiRequest } from "@/lib/api";
import type {
  AnalysisResult,
  ApiDocumentVersionResponse,
  ClarificationQuestion,
  CompletionSummary,
  Requirement,
  SupportingDocument,
  UnsupportedClaim,
} from "@/lib/types";

type QuestionFilter = "ALL" | "OPEN" | "ANSWERED" | "DISMISSED";

export function QuestionsPanel({
  assessmentId,
  analysis,
  error,
  isLoading,
  onRetry,
}: {
  assessmentId: string;
  analysis: AnalysisResult | null | undefined;
  error: Error | null;
  isLoading: boolean;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<QuestionFilter>("ALL");
  const queryClient = useQueryClient();
  const updateQuestion = useMutation({
    mutationFn: ({ id, status, answer }: {
      id: string;
      status: ClarificationQuestion["status"];
      answer: string;
    }) => apiRequest(`/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, answer: answer.trim() || null }),
    }),
    onSuccess: async () => {
      await invalidateReviewData(queryClient, assessmentId);
      toast.success("Question response saved.");
    },
    onError: (saveError) => toast.error(saveError.message || "Could not save the question response."),
  });

  if (isLoading) return <LoadingSkeleton rows={2} />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (!analysis) {
    return <EmptyState description="Clarification questions appear after an analysis run." icon={FileText} title="No questions yet" />;
  }

  const questions = analysis.questions.filter((question) => filter === "ALL" || question.status === filter);
  const requirementsById = new Map(analysis.requirements.map((requirement) => [requirement.id, requirement]));

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold">Clarification questions</h2>
          <p className="mt-1 text-sm text-muted-foreground">Record answers and track each question’s review state.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filter</span>
          <select
            aria-label="Filter clarification questions by status"
            className="h-9 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setFilter(event.target.value as QuestionFilter)}
            value={filter}
          >
            <option value="ALL">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="ANSWERED">Answered</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </label>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          description={filter === "ALL"
            ? "The latest analysis did not identify any clarification questions."
            : `There are no ${filter.toLowerCase()} questions.`}
          icon={FileText}
          title={filter === "ALL" ? "No clarification questions" : `No ${filter.toLowerCase()} questions`}
        />
      ) : (
        <div className="space-y-3">
          {questions.map((question) => (
            <QuestionCard
              key={`${question.id}-${question.status}-${question.answer ?? ""}`}
              onSave={(status, answer) => updateQuestion.mutate({ id: question.id, status, answer })}
              question={question}
              requirement={question.requirementId ? requirementsById.get(question.requirementId) : undefined}
              saving={updateQuestion.isPending && updateQuestion.variables?.id === question.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QuestionCard({
  question,
  requirement,
  saving,
  onSave,
}: {
  question: ClarificationQuestion;
  requirement?: Requirement;
  saving: boolean;
  onSave: (status: ClarificationQuestion["status"], answer: string) => void;
}) {
  const [status, setStatus] = useState(question.status);
  const [answer, setAnswer] = useState(question.answer ?? "");

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-6">{question.question}</h3>
          {requirement ? (
            <p className="mt-1 text-xs font-medium text-primary">
              {requirement.code}: {requirement.text}
            </p>
          ) : question.requirementId ? (
            <p className="mt-1 text-xs text-muted-foreground">Related requirement reference is unavailable.</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">General clarification</p>
          )}
        </div>
        <StatusChip status={question.status} />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{question.reason}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
        <div>
          <label className="text-sm font-medium" htmlFor={`answer-${question.id}`}>Answer or reviewer note</label>
          <textarea
            className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={`answer-${question.id}`}
            maxLength={5000}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Add an answer or explain why this question can be dismissed."
            value={answer}
          />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor={`question-status-${question.id}`}>Status</label>
          <select
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={`question-status-${question.id}`}
            onChange={(event) => setStatus(event.target.value as ClarificationQuestion["status"])}
            value={status}
          >
            <option value="OPEN">Open</option>
            <option value="ANSWERED">Answered</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>
        <Button
          disabled={saving}
          onClick={() => onSave(status, answer)}
          type="button"
        >
          {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
          Save
        </Button>
      </div>
    </article>
  );
}

export function ClaimsPanel({
  assessmentId,
  analysis,
  error,
  isLoading,
  onRetry,
}: {
  assessmentId: string;
  analysis: AnalysisResult | null | undefined;
  error: Error | null;
  isLoading: boolean;
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  const applicationVersionId = analysis?.run.applicationVersionId;
  const applicationQuery = useQuery({
    queryKey: ["claim-application", assessmentId, applicationVersionId],
    queryFn: async () => {
      const response = await apiRequest<ApiDocumentVersionResponse>(
        `/api/documents/${applicationVersionId}`,
      );
      return response.version.segments ?? [];
    },
    enabled: Boolean(applicationVersionId),
  });
  const updateClaim = useMutation({
    mutationFn: ({ id, reviewDecision }: {
      id: string;
      reviewDecision: UnsupportedClaim["reviewDecision"];
    }) => apiRequest(`/api/claims/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ reviewDecision }),
    }),
    onSuccess: async () => {
      await invalidateReviewData(queryClient, assessmentId);
      toast.success("Claim review saved.");
    },
    onError: (saveError) => toast.error(saveError.message || "Could not save claim review."),
  });

  if (isLoading) return <LoadingSkeleton rows={2} />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (!analysis) {
    return <EmptyState description="Potentially unsupported claims appear after an analysis run." icon={FileText} title="No claims to review yet" />;
  }
  if (!analysis.unsupportedClaims.length) {
    return <EmptyState description="The latest analysis did not identify potentially unsupported claims." icon={FileText} title="No claims flagged" />;
  }

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Potentially unsupported claims</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the exact application passage and record whether it is an issue.
        </p>
      </div>
      {analysis.unsupportedClaims.map((claim) => (
        <ClaimCard
          claim={claim}
          context={applicationQuery.data?.find((segment) => segment.id === claim.segmentId)?.text}
          key={claim.id}
          onDecision={(reviewDecision) => updateClaim.mutate({ id: claim.id, reviewDecision })}
          saving={updateClaim.isPending && updateClaim.variables?.id === claim.id}
        />
      ))}
    </section>
  );
}

function ClaimCard({
  claim,
  context,
  saving,
  onDecision,
}: {
  claim: UnsupportedClaim;
  context?: string;
  saving: boolean;
  onDecision: (decision: UnsupportedClaim["reviewDecision"]) => void;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Potential unsupported claim</h3>
        <StatusChip status={claim.reviewDecision} />
      </div>
      <div className="mt-3">
        <EvidenceQuote
          quote={claim.quote}
          sourceLabel={`Application ${claim.segmentId}`}
          verified={claim.quoteVerified}
        />
      </div>
      {context ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Application context · {claim.segmentId}
          </p>
          <p className="text-sm leading-6 text-foreground">
            {context.includes(claim.quote) ? (
              <>
                {context.slice(0, context.indexOf(claim.quote))}
                <mark className="rounded bg-amber-200 px-0.5 text-foreground">{claim.quote}</mark>
                {context.slice(context.indexOf(claim.quote) + claim.quote.length)}
              </>
            ) : context}
          </p>
        </div>
      ) : null}
      {!claim.quoteVerified ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          This quote could not be verified against the application text.
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{claim.reason}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={saving || claim.reviewDecision === "CONFIRMED_ISSUE"}
          onClick={() => onDecision("CONFIRMED_ISSUE")}
          type="button"
        >
          {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
          Confirm issue
        </Button>
        <Button
          disabled={saving || claim.reviewDecision === "DISMISSED"}
          onClick={() => onDecision("DISMISSED")}
          type="button"
          variant="outline"
        >
          {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <X aria-hidden="true" />}
          Dismiss
        </Button>
      </div>
    </article>
  );
}

const supportingDocumentSchema = z.object({
  name: z.string().trim().min(1, "Enter a document name.").max(255),
  docType: z.string().trim().min(1, "Enter a document type.").max(120),
  status: z.enum(["PROVIDED", "MISSING", "NOT_APPLICABLE"]),
  notes: z.string().max(5000),
  requirementId: z.string(),
});
type SupportingDocumentValues = z.infer<typeof supportingDocumentSchema>;

export function SupportingPanel({
  assessmentId,
  completion,
  completionError,
  completionLoading,
  onCompletionRetry,
  analysis,
}: {
  assessmentId: string;
  completion?: CompletionSummary;
  completionError: Error | null;
  completionLoading: boolean;
  onCompletionRetry: () => void;
  analysis: AnalysisResult | null | undefined;
}) {
  const queryClient = useQueryClient();
  const documents = useSupportingDocuments(assessmentId);
  const [editingDocument, setEditingDocument] = useState<SupportingDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<SupportingDocument | null>(null);
  const form = useForm<SupportingDocumentValues>({
    resolver: zodResolver(supportingDocumentSchema),
    defaultValues: {
      name: "",
      docType: "",
      status: "PROVIDED",
      notes: "",
      requirementId: "",
    },
  });
  const saveDocument = useMutation({
    mutationFn: (values: SupportingDocumentValues) => {
      const body = {
        name: values.name.trim(),
        docType: values.docType.trim(),
        status: values.status,
        notes: values.notes.trim() || null,
        requirementId: values.requirementId || null,
      };
      if (editingDocument) {
        return apiRequest(`/api/assessments/${assessmentId}/supporting-documents/${editingDocument.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiRequest(`/api/assessments/${assessmentId}/supporting-documents`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: async () => {
      await invalidateReviewData(queryClient, assessmentId);
      await queryClient.invalidateQueries({ queryKey: ["supporting-documents", assessmentId] });
      toast.success(editingDocument ? "Supporting document updated." : "Supporting document added.");
      setEditingDocument(null);
      form.reset({ name: "", docType: "", status: "PROVIDED", notes: "", requirementId: "" });
    },
    onError: (saveError) => toast.error(saveError.message || "Could not save the supporting document."),
  });
  const deleteDocument = useMutation({
    mutationFn: (document: SupportingDocument) =>
      apiRequest<void>(`/api/assessments/${assessmentId}/supporting-documents/${document.id}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await invalidateReviewData(queryClient, assessmentId);
      await queryClient.invalidateQueries({ queryKey: ["supporting-documents", assessmentId] });
      toast.success("Supporting document removed.");
      setDeletingDocument(null);
    },
    onError: (deleteError) => toast.error(deleteError.message || "Could not delete the supporting document."),
  });

  function beginEdit(document: SupportingDocument) {
    setEditingDocument(document);
    form.reset({
      name: document.name,
      docType: document.docType,
      status: document.status,
      notes: document.notes ?? "",
      requirementId: document.requirementId ?? "",
    });
  }

  function cancelEdit() {
    setEditingDocument(null);
    form.reset({ name: "", docType: "", status: "PROVIDED", notes: "", requirementId: "" });
  }

  const requirementsNeedingDocuments = (analysis?.requirements ?? [])
    .filter((requirement) => requirement.needsDocument);

  return (
    <section className="space-y-5">
      <MissingDocumentsPanel
        completion={completion}
        error={completionError}
        loading={completionLoading}
        onRetry={onCompletionRetry}
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Supporting document tracker</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Track availability and link supplied documents to a requirement.
            </p>
          </div>
          {editingDocument ? (
            <Button onClick={cancelEdit} size="sm" type="button" variant="outline">
              <X aria-hidden="true" /> Cancel edit
            </Button>
          ) : null}
        </div>

        <form
          className="mt-5 grid gap-3 rounded-xl bg-muted/50 p-4 md:grid-cols-2 xl:grid-cols-6"
          noValidate
          onSubmit={form.handleSubmit((values) => saveDocument.mutate(values))}
        >
          <div className="xl:col-span-2">
            <label className="text-sm font-medium" htmlFor="supporting-name">Document name</label>
            <input
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="supporting-name"
              maxLength={255}
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="supporting-type">Type</label>
            <input
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="supporting-type"
              maxLength={120}
              placeholder="e.g. Audited accounts"
              {...form.register("docType")}
            />
            {form.formState.errors.docType ? (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.docType.message}</p>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="supporting-status">Status</label>
            <select
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="supporting-status"
              {...form.register("status")}
            >
              <option value="PROVIDED">Provided</option>
              <option value="MISSING">Missing</option>
              <option value="NOT_APPLICABLE">Not applicable</option>
            </select>
          </div>
          <div className="md:col-span-2 xl:col-span-2">
            <label className="text-sm font-medium" htmlFor="supporting-requirement">Linked requirement</label>
            <select
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="supporting-requirement"
              {...form.register("requirementId")}
            >
              <option value="">No linked requirement</option>
              {requirementsNeedingDocuments.map((requirement) => (
                <option key={requirement.id} value={requirement.id}>
                  {requirement.code} · {requirement.documentType ?? requirement.text}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <label className="text-sm font-medium" htmlFor="supporting-notes">Notes</label>
            <textarea
              className="mt-1.5 min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="supporting-notes"
              maxLength={5000}
              {...form.register("notes")}
            />
          </div>
          <div className="flex items-end xl:col-span-2">
            <Button className="w-full" disabled={saveDocument.isPending} type="submit">
              {saveDocument.isPending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : editingDocument ? (
                <Save aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              {editingDocument ? "Save changes" : "Add supporting document"}
            </Button>
          </div>
        </form>

        {documents.isLoading ? (
          <div className="mt-5"><LoadingSkeleton rows={2} /></div>
        ) : documents.isError ? (
          <div className="mt-5">
            <ErrorState
              message={documents.error.message}
              onRetry={() => void documents.refetch()}
              title="Supporting documents could not be loaded"
            />
          </div>
        ) : documents.data?.length ? (
          <>
            <div className="mt-5 hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Document</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Linked requirement</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documents.data.map((document) => (
                    <tr key={document.id}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{document.name}</span>
                        {document.notes ? <p className="mt-1 max-w-xs text-xs text-muted-foreground">{document.notes}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{document.docType}</td>
                      <td className="px-4 py-3"><StatusChip status={document.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {requirementsNeedingDocuments.find((requirement) => requirement.id === document.requirementId)?.code ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button onClick={() => beginEdit(document)} size="sm" type="button" variant="ghost">Edit</Button>
                          <Button
                            aria-label={`Delete ${document.name}`}
                            onClick={() => setDeletingDocument(document)}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 space-y-3 md:hidden">
              {documents.data.map((document) => (
                <SupportingDocumentCard
                  document={document}
                  key={document.id}
                  linkedRequirement={requirementsNeedingDocuments.find((requirement) => requirement.id === document.requirementId)}
                  onDelete={() => setDeletingDocument(document)}
                  onEdit={() => beginEdit(document)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-5">
            <EmptyState
              description="Add metadata for certificates, accounts, letters, or other materials. This tracker does not store the files themselves."
              icon={FileText}
              title="No supporting documents tracked"
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        cancelDisabled={deleteDocument.isPending}
        confirmDisabled={deleteDocument.isPending}
        confirmLabel={deleteDocument.isPending ? "Deleting…" : "Delete document"}
        description={deletingDocument
          ? `Remove “${deletingDocument.name}” from this assessment? This only removes its tracking entry.`
          : "Remove this tracking entry?"}
        onCancel={() => setDeletingDocument(null)}
        onConfirm={() => {
          if (deletingDocument) deleteDocument.mutate(deletingDocument);
        }}
        open={Boolean(deletingDocument)}
        title="Delete supporting document?"
      />
    </section>
  );
}

function SupportingDocumentCard({
  document,
  linkedRequirement,
  onEdit,
  onDelete,
}: {
  document: SupportingDocument;
  linkedRequirement?: Requirement;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{document.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{document.docType}</p>
        </div>
        <StatusChip status={document.status} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Linked requirement: {linkedRequirement?.code ?? "None"}
      </p>
      {document.notes ? <p className="mt-2 text-sm leading-5 text-muted-foreground">{document.notes}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={onEdit} size="sm" type="button" variant="outline">Edit</Button>
        <Button onClick={onDelete} size="sm" type="button" variant="ghost">
          <Trash2 aria-hidden="true" /> Delete
        </Button>
      </div>
    </article>
  );
}

function MissingDocumentsPanel({
  completion,
  error,
  loading,
  onRetry,
}: {
  completion?: CompletionSummary;
  error: Error | null;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="font-semibold">Missing documents</h2>
      {loading ? (
        <div className="mt-3"><LoadingSkeleton rows={1} /></div>
      ) : error ? (
        <div className="mt-3">
          <ErrorState message={error.message} onRetry={onRetry} title="Missing document list is unavailable" />
        </div>
      ) : completion?.missingDocuments.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {completion.missingDocuments.map((document, index) => (
            <li
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              key={`${document.docType}-${index}`}
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">{document.name}</strong>
                {document.requirementCode ? ` · ${document.requirementCode}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {completion ? "No missing documents are currently identified." : "Run an analysis to check document requirements."}
        </p>
      )}
    </section>
  );
}

interface ReviewSummaryContent {
  assessment: { id: string; name: string };
  documents: {
    guideline: { id: string; title: string; versionNo: number };
    application: { id: string; title: string; versionNo: number };
  };
  run: {
    id: string;
    provider: string;
    model: string;
    promptVersion: string;
    date: string;
    heuristicFallback: boolean;
  };
  completion: {
    mandatory: CompletionSummary["mandatory"];
    recommended: CompletionSummary["recommended"];
    label: string;
  };
  requirements: Array<{
    code: string;
    text: string;
    level: "MANDATORY" | "RECOMMENDED";
    effectiveStatus: string;
    reviewDecision: string;
    reviewerNote: string | null;
    verifiedEvidenceQuotes: Array<{ source: string; segmentId: string; quote: string }>;
    sourceVerified: boolean;
  }>;
  outstandingMandatory: Array<{ code: string; text: string }>;
  recommendedNotMet: Array<{ code: string; text: string }>;
  missingSupportingDocuments: CompletionSummary["missingDocuments"];
  openClarificationQuestions: Array<{
    id: string;
    requirementCode: string | null;
    question: string;
    reason: string;
  }>;
  unsupportedClaims: {
    confirmedIssues: UnsupportedClaim[];
    pending: UnsupportedClaim[];
  };
  unreviewed: { mappings: number; questions: number; unsupportedClaims: number; total: number };
  unreviewedWarning: string | null;
  unverifiedCitationCount: number;
  stale: boolean;
  staleReasons: string[];
  disclaimer: string;
  generatedAt: string;
}

interface ReviewSummary {
  id: string;
  createdAt: string;
  content: ReviewSummaryContent;
  isStale: boolean;
  currentStaleReasons: string[];
}

export function SummaryPanel({
  assessmentId,
  canGenerate,
}: {
  assessmentId: string;
  canGenerate: boolean;
}) {
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({
    queryKey: ["review-summary", assessmentId],
    queryFn: async () => {
      try {
        const result = await apiRequest<{ summary: ReviewSummary }>(
          `/api/assessments/${assessmentId}/summary/latest`,
        );
        return result.summary;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
  const generate = useMutation({
    mutationFn: () =>
      apiRequest<{ summary: ReviewSummary }>(`/api/assessments/${assessmentId}/summary`, {
        method: "POST",
      }),
    onSuccess: async (result) => {
      await invalidateReviewData(queryClient, assessmentId);
      queryClient.setQueryData(["review-summary", assessmentId], result.summary);
      toast.success("Completeness summary generated.");
    },
    onError: (error) => toast.error(error.message || "Could not generate the summary."),
  });

  if (summaryQuery.isLoading) return <LoadingSkeleton rows={2} />;
  if (summaryQuery.isError) {
    return <ErrorState message={summaryQuery.error.message} onRetry={() => void summaryQuery.refetch()} />;
  }

  const summary = summaryQuery.data;
  return (
    <section className="print-summary rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" id="print-summary">
      <div className="print-hidden flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Reviewed completeness summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated deterministically from the saved analysis and review decisions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canGenerate || generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <FileCheck2 aria-hidden="true" />}
            {generate.isPending ? "Generating…" : summary ? "Regenerate summary" : "Generate summary"}
          </Button>
          {summary ? (
            <>
              <a
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                download
                href={`/api/summary/${summary.id}/export?format=md`}
              >
                <Download aria-hidden="true" className="size-4" /> Markdown
              </a>
              <a
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                download
                href={`/api/summary/${summary.id}/export?format=json`}
              >
                <Download aria-hidden="true" className="size-4" /> JSON
              </a>
              <Button onClick={() => window.print()} type="button" variant="outline">
                <Printer aria-hidden="true" /> Print
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {!canGenerate ? (
        <p className="print-hidden mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Run a completed analysis before generating a completeness summary.
        </p>
      ) : null}
      {summary ? (
        <SummaryReport summary={summary} />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No summary has been generated yet.</p>
      )}
    </section>
  );
}

function SummaryReport({ summary }: { summary: ReviewSummary }) {
  const content = summary.content;
  return (
    <article className="mt-5 space-y-6">
      {summary.isStale ? <StaleBanner reasons={summary.currentStaleReasons} /> : null}
      {content.unreviewedWarning ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p><strong>{content.unreviewedWarning}.</strong> Treat this summary as provisional.</p>
        </div>
      ) : null}
      {content.run.heuristicFallback ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          AI was unavailable; heuristic results.
        </div>
      ) : null}

      <header className="border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Completeness summary</p>
        <h2 className="mt-1 text-2xl font-semibold">{content.assessment.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Run {new Date(content.run.date).toLocaleString()} · {content.run.provider} · {content.run.model}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Prompt version: {content.run.promptVersion}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Guideline: {content.documents.guideline.title} v{content.documents.guideline.versionNo}
          {" · "}
          Application: {content.documents.application.title} v{content.documents.application.versionNo}
        </p>
      </header>

      <section>
        <h3 className="text-base font-semibold">Completion</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SummaryNumberCard
            label="Mandatory requirements"
            confirmed={content.completion.mandatory.confirmedMet}
            suggested={content.completion.mandatory.aiSuggestedMet}
            total={content.completion.mandatory.total}
          />
          <SummaryNumberCard
            label="Recommended requirements"
            confirmed={content.completion.recommended.confirmedMet}
            suggested={content.completion.recommended.aiSuggestedMet}
            total={content.completion.recommended.total}
          />
        </div>
      </section>

      <section>
        <h3 className="text-base font-semibold">Outstanding mandatory requirements</h3>
        <SummaryItems items={content.outstandingMandatory.map((item) => `${item.code}: ${item.text}`)} empty="No outstanding mandatory items are listed." />
      </section>

      <section>
        <h3 className="text-base font-semibold">Recommended items not confirmed</h3>
        <SummaryItems items={content.recommendedNotMet.map((item) => `${item.code}: ${item.text}`)} empty="No recommended items are outstanding." />
      </section>

      <section>
        <h3 className="text-base font-semibold">Missing supporting documents</h3>
        <SummaryItems
          items={content.missingSupportingDocuments.map((item) => `${item.name}${item.requirementCode ? ` (${item.requirementCode})` : ""}`)}
          empty="No missing supporting documents are listed."
        />
      </section>

      <section>
        <h3 className="text-base font-semibold">Open clarification questions</h3>
        {content.openClarificationQuestions.length ? (
          <ul className="mt-3 space-y-2">
            {content.openClarificationQuestions.map((item) => (
              <li className="rounded-xl border border-border p-3" key={item.id}>
                {item.requirementCode ? <p className="text-xs font-semibold text-primary">{item.requirementCode}</p> : null}
                <p className="mt-1 text-sm font-medium">{item.question}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-muted-foreground">No open questions.</p>}
      </section>

      <section>
        <h3 className="text-base font-semibold">Unsupported claims</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ClaimSummaryGroup title="Confirmed issues" claims={content.unsupportedClaims.confirmedIssues} />
          <ClaimSummaryGroup title="Pending review" claims={content.unsupportedClaims.pending} />
        </div>
      </section>

      <section>
        <h3 className="text-base font-semibold">Requirement review detail</h3>
        <div className="mt-3 space-y-3">
          {content.requirements.map((requirement) => (
            <article className="rounded-xl border border-border p-3" key={requirement.code}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{requirement.code} · {requirement.text}</p>
                <div className="flex gap-2">
                  <StatusChip status={requirement.effectiveStatus} />
                  <StatusChip status={requirement.reviewDecision} />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{requirement.level}</p>
              {requirement.reviewerNote ? <p className="mt-2 text-sm text-muted-foreground">{requirement.reviewerNote}</p> : null}
              {requirement.verifiedEvidenceQuotes.length ? (
                <ul className="mt-2 space-y-1">
                  {requirement.verifiedEvidenceQuotes.map((evidence) => (
                    <li className="text-sm text-muted-foreground" key={`${evidence.source}-${evidence.segmentId}-${evidence.quote}`}>
                      <span className="font-medium">{evidence.source} {evidence.segmentId}:</span> “{evidence.quote}”
                    </li>
                  ))}
                </ul>
              ) : null}
              {!requirement.sourceVerified ? (
                <p className="mt-2 text-sm font-medium text-amber-800">Guideline source quote could not be verified.</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
        {content.disclaimer}
      </p>
      <p className="text-sm text-muted-foreground">
        {content.unreviewed.mappings} mappings, {content.unreviewed.questions} questions, and{" "}
        {content.unreviewed.unsupportedClaims} claims remain unreviewed;{" "}
        {content.unverifiedCitationCount} citations could not be verified.
      </p>
    </article>
  );
}

function SummaryNumberCard({
  label,
  confirmed,
  suggested,
  total,
}: {
  label: string;
  confirmed: number;
  suggested: number;
  total: number;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{confirmed} of {total} confirmed</p>
      <p className="mt-1 text-sm text-muted-foreground">With AI suggestions: {suggested} of {total}</p>
    </div>
  );
}

function SummaryItems({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </ul>
  ) : (
    <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
  );
}

function ClaimSummaryGroup({ title, claims }: { title: string; claims: UnsupportedClaim[] }) {
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
      {claims.length ? (
        <ul className="mt-2 space-y-2">
          {claims.map((claim) => (
            <li className="rounded-xl border border-border p-3" key={claim.id}>
              <EvidenceQuote
                quote={claim.quote}
                sourceLabel={`Application ${claim.segmentId}`}
                verified={claim.quoteVerified}
              />
              <p className="mt-2 text-sm text-muted-foreground">{claim.reason}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">None listed.</p>
      )}
    </div>
  );
}

async function invalidateReviewData(
  queryClient: ReturnType<typeof useQueryClient>,
  assessmentId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["analysis-latest", assessmentId] }),
    queryClient.invalidateQueries({ queryKey: ["assessment-completion", assessmentId] }),
    queryClient.invalidateQueries({ queryKey: ["review-summary", assessmentId] }),
    queryClient.invalidateQueries({ queryKey: ["supporting-documents", assessmentId] }),
  ]);
}
