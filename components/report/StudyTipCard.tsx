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
        "rounded-xl border px-4 py-4 space-y-1.5 glass transition-colors",
        "border-primary/15 bg-primary/[0.03] dark:bg-primary/[0.08]",
        "hover:border-primary/25 hover:bg-primary/[0.05]"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                     bg-primary/15 text-xs font-bold text-primary mt-0.5"
        >
          {index + 1}
        </span>
        <div className="space-y-1">
          <p className="text-sm text-foreground leading-relaxed">
            {tip.tip}
          </p>
          {tip.sourceChunk && (
            <p className="text-xs text-muted-foreground italic line-clamp-2">
              &ldquo;{tip.sourceChunk}&rdquo;
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
