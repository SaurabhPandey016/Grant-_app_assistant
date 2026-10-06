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
    retry: false,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      router.replace("/login");
    }
  }, [query.error, router]);

  return query;
}
