"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { ApiAssessmentsResponse } from "@/lib/types";

export function useAssessments() {
  return useQuery({
    queryKey: ["assessments"],
    queryFn: async () => {
      const result = await apiRequest<ApiAssessmentsResponse>("/api/assessments");
      return result.assessments;
    },
  });
}
