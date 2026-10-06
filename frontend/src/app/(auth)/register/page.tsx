"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import type { ApiUserResponse } from "@/lib/types";

const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(72, "Password must not exceed 72 characters.")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "Password is too long.");
const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address."),
  password: passwordSchema,
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const registerAccount = useMutation({
    mutationFn: (values: RegisterValues) =>
      apiRequest<ApiUserResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(["current-user"], result.user);
      router.replace("/assessments");
    },
  });

  return (
    <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
        <UserRoundPlus aria-hidden="true" className="size-5" />
      </div>
      <p className="text-sm font-medium text-primary">Get started</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Your application materials stay private to your account.
      </p>

      <form
        className="mt-7 space-y-5"
        noValidate
        onSubmit={form.handleSubmit((values) => registerAccount.mutate(values))}
      >
        <div>
          <label className="text-sm font-medium" htmlFor="name">Your name</label>
          <input
            autoComplete="name"
            className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            id="name"
            {...form.register("name")}
          />
          {form.formState.errors.name ? (
            <p className="mt-1.5 text-sm text-destructive">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="email">Email address</label>
          <input
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            id="email"
            type="email"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p className="mt-1.5 text-sm text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="password">Password</label>
          <input
            autoComplete="new-password"
            className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            id="password"
            type="password"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="mt-1.5 text-sm text-destructive">{form.formState.errors.password.message}</p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">At least 12 characters.</p>
          )}
        </div>
        {registerAccount.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900" role="alert">
            {registerAccount.error.message}
          </p>
        ) : null}
        <Button className="h-11 w-full" disabled={registerAccount.isPending} type="submit">
          {registerAccount.isPending ? "Creating account…" : "Create account"}
          {!registerAccount.isPending ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-semibold text-primary underline-offset-4 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </section>
  );
}
