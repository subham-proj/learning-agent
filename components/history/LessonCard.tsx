import Link from "next/link";
import { cn } from "@/lib/utils";

interface LessonCardProps {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  overallScore: number | null;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-900"
      : score >= 60
      ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-900"
      : "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-900";

  return (
    <span className={cn("text-xs font-bold border rounded-full px-2 py-0.5 tabular-nums", color)}>
      {score}%
    </span>
  );
}

function StatusPip({ status }: { status: string }) {
  const isCompleted = status === "completed";
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isCompleted ? "bg-emerald-500" : "bg-amber-400 animate-pulse"
        )}
      />
      <span className={cn(
        "text-xs",
        isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
      )}>
        {isCompleted ? "Completed" : "In progress"}
      </span>
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LessonCard({ id, title, status, createdAt, completedAt, overallScore }: LessonCardProps) {
  const isCompleted = status === "completed";
  const href = isCompleted ? `/lessons/${id}/report` : `/`;

  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-2xl border bg-card/80 glass p-5 space-y-3",
        "border-border/80 transition-all duration-200",
        "hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
        "hover:shadow-[0_4px_20px_oklch(0.558_0.234_293.7_/_10%)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
      aria-label={`${title} — ${isCompleted ? "completed" : "in progress"}${overallScore !== null ? `, score ${overallScore}%` : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground leading-snug
                       group-hover:text-primary transition-colors line-clamp-2">
          {title}
        </h3>
        {overallScore !== null && <ScoreBadge score={overallScore} />}
      </div>

      <div className="flex items-center justify-between">
        <StatusPip status={status} />
        <p className="text-xs text-muted-foreground">
          {completedAt ? `Completed ${formatDate(completedAt)}` : `Started ${formatDate(createdAt)}`}
        </p>
      </div>
    </Link>
  );
}
