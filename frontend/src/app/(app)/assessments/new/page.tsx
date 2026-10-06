"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import type { ApiAssessmentCreateResponse } from "@/lib/types";

const assessmentSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for this assessment.").max(160),
});
type AssessmentValues = z.infer<typeof assessmentSchema>;

export default function NewAssessmentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: { name: "" },
  });
  const createAssessment = useMutation({
    mutationFn: (values: AssessmentValues) =>
      apiRequest<ApiAssessmentCreateResponse>("/api/assessments", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["assessments"] });
      router.push(`/assessments/${result.assessment.id}`);
    },
  });

  return (
    <section className="mx-auto max-w-2xl">
      <Link
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        href="/assessments"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to assessments
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
          <FilePlus2 aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-5 text-sm font-medium text-primary">New assessment</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Name your review</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Use a name that helps you recognize the grant or project. You can add documents in the next step.
        </p>

        <form
          className="mt-7 space-y-5"
          noValidate
          onSubmit={form.handleSubmit((values) => createAssessment.mutate(values))}
        >
          <div>
            <label className="text-sm font-medium" htmlFor="name">Assessment name</label>
            <input
              autoFocus
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              id="name"
              placeholder="e.g. Community Green Innovation Fund"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="mt-1.5 text-sm text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          {createAssessment.error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900" role="alert">
              {createAssessment.error.message}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button disabled={createAssessment.isPending} type="submit">
              {createAssessment.isPending ? "Creating…" : "Create assessment"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
