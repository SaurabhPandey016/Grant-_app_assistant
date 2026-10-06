import { CheckCircle2, CircleHelp } from "lucide-react";

export function EvidenceQuote({
  quote,
  verified,
  sourceLabel,
}: {
  quote: string;
  verified: boolean;
  sourceLabel?: string;
}) {
  const Icon = verified ? CheckCircle2 : CircleHelp;

  return (
    <figure
      className={`rounded-xl border p-4 ${
        verified ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"
      }`}
    >
      <blockquote className="text-sm leading-6 text-slate-800">“{quote}”</blockquote>
      <figcaption className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <Icon aria-hidden="true" className="size-3.5" />
        {verified ? "Verified source quote" : "Quote not verified"}
        {sourceLabel ? ` · ${sourceLabel}` : ""}
      </figcaption>
    </figure>
  );
}
