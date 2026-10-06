import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  RefreshCw,
  XCircle,
} from "lucide-react";

const statusStyles: Record<
  string,
  { icon: typeof CheckCircle2; className: string; label?: string }
> = {
  COMPLETED: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  SUPPORTED: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  PROVIDED: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  CONFIRMED: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  RUNNING: {
    icon: Clock3,
    className: "border-sky-200 bg-sky-50 text-sky-800",
  },
  STALE: {
    icon: RefreshCw,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  PARTIAL: {
    icon: AlertCircle,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  AMBIGUOUS: {
    icon: AlertCircle,
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  MISSING: {
    icon: AlertCircle,
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
  FAILED: {
    icon: XCircle,
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
  REJECTED: {
    icon: XCircle,
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
};

function readableStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusChip({ status }: { status: string }) {
  const style = statusStyles[status] ?? {
    icon: CircleDashed,
    className: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const Icon = style.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.className}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {style.label ?? readableStatus(status)}
    </span>
  );
}
