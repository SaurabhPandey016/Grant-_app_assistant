import type { Metadata } from "next";
import { DisclaimerBanner } from "@/components/shared/disclaimer-banner";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grant Completeness Assistant",
  description: "A workflow aid for reviewing grant application completeness.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <QueryProvider>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <footer className="mx-auto w-full max-w-7xl px-4 pb-5 pt-3 sm:px-6 lg:px-8">
              <DisclaimerBanner />
            </footer>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
