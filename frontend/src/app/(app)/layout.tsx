"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Sprout } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiRequest } from "@/lib/api";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userQuery = useCurrentUser();

  useEffect(() => {
    if (userQuery.error && !(userQuery.error instanceof Error && "status" in userQuery.error)) {
      toast.error(userQuery.error.message);
    }
  }, [userQuery.error]);

  async function signOut() {
    try {
      await apiRequest<void>("/api/auth/logout", { method: "POST" });
      queryClient.clear();
      router.replace("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  if (userQuery.isLoading || userQuery.isFetching) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <LoadingSkeleton rows={3} />
      </div>
    );
  }

  if (userQuery.error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <ErrorState
          message={userQuery.error.message}
          onRetry={() => void userQuery.refetch()}
          title="We couldn’t verify your session"
        />
      </div>
    );
  }

  if (!userQuery.data) return null;

  return (
    <div className="min-h-[calc(100vh-6rem)]">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link className="inline-flex items-center gap-2 font-semibold tracking-tight" href="/assessments">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
              <Sprout aria-hidden="true" className="size-5" />
            </span>
            <span className="hidden sm:inline">Grant Completeness Assistant</span>
            <span className="sm:hidden">Grant Assistant</span>
          </Link>

          <nav aria-label="Main navigation" className="flex items-center gap-2">
            <Link
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              href="/assessments"
            >
              Assessments
            </Link>
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1.5 pr-2.5 outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {userQuery.data.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-36 truncate text-sm font-medium md:inline">
                  {userQuery.data.name}
                </span>
              </summary>
              <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-border bg-card p-2 shadow-lg">
                <div className="border-b border-border px-3 py-2">
                  <p className="truncate text-sm font-medium">{userQuery.data.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{userQuery.data.email}</p>
                </div>
                <Button
                  className="mt-1 w-full justify-start"
                  onClick={() => void signOut()}
                  size="sm"
                  variant="ghost"
                >
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </div>
            </details>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>
    </div>
  );
}
