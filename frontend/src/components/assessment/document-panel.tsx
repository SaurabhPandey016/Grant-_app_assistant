"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Eye, LoaderCircle, Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { apiRequest, ApiError } from "@/lib/api";
import { useDocumentVersions } from "@/hooks/use-assessment-workspace";
import type {
  ApiDocumentVersionResponse,
  DocumentVersion,
} from "@/lib/types";

const MAX_DOCUMENT_CHARS = 200_000;

export function DocumentPanel({
  assessmentId,
  kind,
  currentVersionId,
  onVersionCreated,
}: {
  assessmentId: string;
  kind: "GUIDELINE" | "APPLICATION";
  currentVersionId: string | null;
  onVersionCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const versions = useDocumentVersions(assessmentId, kind);

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("title", title.trim());
      if (file) {
        form.set("file", file);
        return apiRequest<{ version: DocumentVersion; unchanged: boolean }>(
          `/api/assessments/${assessmentId}/documents`,
          { method: "POST", body: form },
        );
      }
      return apiRequest<{ version: DocumentVersion; unchanged: boolean }>(
        `/api/assessments/${assessmentId}/documents`,
        {
          method: "POST",
          body: JSON.stringify({ kind, title: title.trim(), content }),
        },
      );
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["document-versions", assessmentId, kind] }),
        queryClient.invalidateQueries({ queryKey: ["assessment-status", assessmentId] }),
        queryClient.invalidateQueries({ queryKey: ["assessment", assessmentId] }),
        queryClient.invalidateQueries({ queryKey: ["assessment-completion", assessmentId] }),
        queryClient.invalidateQueries({ queryKey: ["assessments"] }),
      ]);
      setTitle("");
      setContent("");
      setFile(null);
      setLocalError("");
      if (fileInput.current) fileInput.current.value = "";
      toast.success(result.unchanged ? "This document is unchanged; no new version was created." : "Document version saved.");
      if (!result.unchanged) onVersionCreated();
    },
  });

  const selectedVersion = useQuery({
    queryKey: ["document-version", selectedVersionId],
    queryFn: async () => {
      const response = await apiRequest<ApiDocumentVersionResponse>(
        `/api/documents/${selectedVersionId}`,
      );
      return response.version;
    },
    enabled: Boolean(selectedVersionId),
  });

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setLocalError("");
    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLowerCase();
    if (!["txt", "md"].includes(extension ?? "")) {
      setFile(null);
      setLocalError("Only .txt and .md files are supported.");
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_DOCUMENT_CHARS * 4) {
      setFile(null);
      setLocalError(`Document is too large. The limit is ${MAX_DOCUMENT_CHARS.toLocaleString()} characters.`);
      event.target.value = "";
      return;
    }
    if (!title.trim()) {
      setTitle(selected.name.replace(/\.(txt|md)$/i, ""));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (!title.trim()) {
      setLocalError("Enter a title for this document.");
      return;
    }
    if (!file && !content.trim()) {
      setLocalError("Paste document text or choose a .txt or .md file.");
      return;
    }
    if (!file && content.length > MAX_DOCUMENT_CHARS) {
      setLocalError(`Document is too large. The limit is ${MAX_DOCUMENT_CHARS.toLocaleString()} characters.`);
      return;
    }
    upload.mutate();
  }

  const label = kind === "GUIDELINE" ? "Grant guideline" : "Application draft";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <FileText aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">{label}</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Add text or upload a plain-text or Markdown file.
          </p>
        </div>
      </div>

      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div>
          <label className="text-sm font-medium" htmlFor={`${kind}-title`}>Document title</label>
          <input
            className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={`${kind}-title`}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={kind === "GUIDELINE" ? "Grant guideline title" : "Application draft title"}
            value={title}
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor={`${kind}-content`}>Paste document text</label>
          <textarea
            className="mt-1.5 min-h-40 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={`${kind}-content`}
            maxLength={MAX_DOCUMENT_CHARS}
            onChange={(event) => {
              setContent(event.target.value);
              setFile(null);
              setLocalError("");
              if (fileInput.current) fileInput.current.value = "";
            }}
            placeholder="Paste the document text here…"
            value={content}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {content.length.toLocaleString()} / {MAX_DOCUMENT_CHARS.toLocaleString()} characters
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            accept=".txt,.md,text/plain,text/markdown"
            className="sr-only"
            onChange={chooseFile}
            ref={fileInput}
            type="file"
          />
          <Button onClick={() => fileInput.current?.click()} type="button" variant="outline">
            <Upload aria-hidden="true" />
            Choose .txt or .md
          </Button>
          {file ? (
            <span className="inline-flex max-w-full items-center gap-2 text-sm text-muted-foreground">
              <FileText aria-hidden="true" className="size-4 shrink-0" />
              <span className="max-w-52 truncate">{file.name}</span>
              <button
                aria-label="Remove selected file"
                className="rounded p-1 hover:bg-muted"
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </span>
          ) : null}
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Saving identical text will keep the current version instead of creating a duplicate.
        </p>

        {localError || upload.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900" role="alert">
            {localError || (upload.error ? describeUploadError(upload.error) : "")}
          </p>
        ) : null}

        <Button disabled={upload.isPending} type="submit">
          {upload.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}
          {upload.isPending ? "Saving version…" : "Save document"}
        </Button>
      </form>

      {versions.isLoading ? (
        <div className="mt-8"><LoadingSkeleton rows={2} /></div>
      ) : versions.isError ? (
        <div className="mt-8">
          <ErrorState
            message={versions.error.message}
            onRetry={() => void versions.refetch()}
            title="Version history could not be loaded"
          />
        </div>
      ) : (
        <div className="mt-8 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Version history</h3>
          {!(versions.data ?? []).length ? (
            <p className="mt-3 rounded-xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
              No {label.toLowerCase()} versions yet.
            </p>
          ) : (
            <ol className="mt-3 space-y-2">
              {(versions.data ?? []).map((version) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3"
                  key={version.id}
                >
                  <div>
                    <p className="text-sm font-medium">
                      v{version.versionNo} · {version.title}
                      {version.id === currentVersionId ? (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Current
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    onClick={() => setSelectedVersionId(version.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Eye aria-hidden="true" />
                    View
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {selectedVersionId ? (
        <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Read-only version</h3>
            <Button
              aria-label="Close version viewer"
              onClick={() => setSelectedVersionId(null)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          {selectedVersion.isLoading ? (
            <div className="mt-3"><LoadingSkeleton rows={1} /></div>
          ) : selectedVersion.isError ? (
            <ErrorState
              message={selectedVersion.error.message}
              onRetry={() => void selectedVersion.refetch()}
              title="Document version could not be loaded"
            />
          ) : (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                v{selectedVersion.data?.versionNo} · {selectedVersion.data?.title} ·{" "}
                {selectedVersion.data ? new Date(selectedVersion.data.createdAt).toLocaleString() : ""}
              </p>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-4 font-sans text-sm leading-6">
                {selectedVersion.data?.content}
              </pre>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function describeUploadError(error: Error) {
  if (error instanceof ApiError && error.code === "DOCUMENT_TOO_LARGE") {
    return error.message;
  }
  return error.message;
}
