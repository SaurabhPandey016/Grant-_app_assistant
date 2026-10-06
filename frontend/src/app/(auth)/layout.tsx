import Link from "next/link";
import { Leaf } from "lucide-react";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
      <header className="flex h-20 items-center">
        <Link className="inline-flex items-center gap-2 font-semibold tracking-tight" href="/login">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
            <Leaf aria-hidden="true" className="size-5" />
          </span>
          Grant Completeness Assistant
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center py-10">{children}</main>
    </div>
  );
}
