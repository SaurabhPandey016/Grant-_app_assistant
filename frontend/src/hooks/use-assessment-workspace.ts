"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type {
  ApiAssessmentResponse,
  ApiAssessmentStatusResponse,
  ApiCompletionResponse,
  ApiDocumentsResponse,
  ApiSupportingDocumentsResponse,
} from "@/lib/types";

export function useAssessment(assessmentId: string) {
  return useQuery({
    queryKey: ["assessment", assessmentId],
    queryFn: async () => {
      const result = await apiRequest<ApiAssessmentResponse>(`/api/assessments/${assessmentId}`);
      return result.assessment;
    },
  });
}

export function useAssessmentStatus(assessmentId: string) {
  return useQuery({
    queryKey: ["assessment-status", assessmentId],
    queryFn: () => apiRequest<ApiAssessmentStatusResponse>(`/api/assessments/${assessmentId}/status`),
    refetchInterval: (query) => query.state.data?.latestRun?.status === "RUNNING" ? 2000 : false,
  });
}

export function useAssessmentCompletion(assessmentId: string, enabled = true) {
  return useQuery({
    queryKey: ["assessment-completion", assessmentId],
    queryFn: async () => {
      const result = await apiRequest<ApiCompletionResponse>(`/api/assessments/${assessmentId}/completion`);
      return result.completion;
    },
    enabled,
  });
}

export function useDocumentVersions(assessmentId: string, kind: "GUIDELINE" | "APPLICATION") {
  return useQuery({
    queryKey: ["document-versions", assessmentId, kind],
    queryFn: async () => {
      const result = await apiRequest<ApiDocumentsResponse>(
        `/api/assessments/${assessmentId}/documents?kind=${kind}`,
      );
      return result.versions;
    },
  });
}

export function useSupportingDocuments(assessmentId: string, enabled = true) {
  return useQuery({
    queryKey: ["supporting-documents", assessmentId],
    queryFn: async () => {
      const result = await apiRequest<ApiSupportingDocumentsResponse>(
        `/api/assessments/${assessmentId}/supporting-documents`,
      );
      return result.supportingDocuments;
    },
    enabled,
  });
}
