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
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Objective{" "}
          <span className="font-bold text-foreground">{current}</span> of{" "}
          <span className="font-bold text-foreground">{total}</span>
        </span>
        <span className="font-semibold text-primary">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`Objective ${current} of ${total}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            boxShadow: "0 0 6px oklch(0.558 0.234 293.7 / 40%)",
          }}
        />
      </div>
    </div>
  );
}
