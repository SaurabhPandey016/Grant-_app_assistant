export function LevelChip({ level }: { level: "MANDATORY" | "RECOMMENDED" }) {
  const mandatory = level === "MANDATORY";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        mandatory
          ? "bg-slate-800 text-white"
          : "bg-slate-100 text-slate-700"
      }`}
    >
      {mandatory ? "Mandatory" : "Recommended"}
    </span>
  );
}
