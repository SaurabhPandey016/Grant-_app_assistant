export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          className="h-24 animate-pulse rounded-2xl border border-border bg-card"
          key={index}
        />
      ))}
      <span className="sr-only">Loading content</span>
    </div>
  );
}
