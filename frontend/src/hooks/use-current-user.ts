"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import type { ApiUserResponse } from "@/lib/types";

export function useCurrentUser() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const result = await apiRequest<ApiUserResponse>("/api/auth/me");
      return result.user;
    },
    retry: (failureCount, error) => {
      if (failureCount >= 30) return false;
      if (error instanceof TypeError) return true;
      return error instanceof ApiError && error.status >= 500 && error.status <= 504;
    },
    retryDelay: 2_000,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      router.replace("/login");
    }
  }, [query.error, router]);

  return query;
}
