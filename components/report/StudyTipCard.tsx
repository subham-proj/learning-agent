import { cn } from "@/lib/utils";
import { type StudyTip } from "@/lib/agent/schemas";

interface StudyTipCardProps {
  tip: StudyTip;
  index: number;
}

export function StudyTipCard({ tip, index }: StudyTipCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5 space-y-1.5",
        "border-violet-100 bg-violet-50/60 dark:border-violet-900/40 dark:bg-violet-950/20"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-xs font-bold text-violet-700 dark:text-violet-300 mt-0.5"
        >
          {index + 1}
        </span>
        <div className="space-y-1">
          <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
            {tip.tip}
          </p>
          {tip.sourceChunk && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 italic line-clamp-2">
              &ldquo;{tip.sourceChunk}&rdquo;
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
