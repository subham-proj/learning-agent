import { cn } from "@/lib/utils";

interface ProgressBarProps {
  current: number;
  total: number;
  className?: string;
}

export function ProgressBar({ current, total, className }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Objective{" "}
          <span className="font-semibold text-zinc-700">{current}</span> of{" "}
          <span className="font-semibold text-zinc-700">{total}</span>
        </span>
        <span>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`Objective ${current} of ${total}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"
      >
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
