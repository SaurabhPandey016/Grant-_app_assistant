"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BackendConnectionState } from "@/components/shared/backend-connection-state";
import { ErrorState } from "@/components/shared/error-state";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function HomePage() {
  const router = useRouter();
  const userQuery = useCurrentUser();

  useEffect(() => {
    if (userQuery.data) router.replace("/assessments");
  }, [router, userQuery.data]);

  if (userQuery.error && "status" in userQuery.error && userQuery.error.status === 401) {
    return <BackendConnectionState message="Taking you to sign in" />;
  }

  if (userQuery.error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorState
          message="The backend could not be reached after several attempts. Retry, or try again shortly."
          onRetry={() => void userQuery.refetch()}
          title="Could not connect to the service"
        />
      </div>
    );
  }

  return <BackendConnectionState />;
}
