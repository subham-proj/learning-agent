import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedbackBannerProps {
  type: "correct" | "incorrect";
  message: string;
  attemptCount?: number;
}

export function FeedbackBanner({ type, message, attemptCount }: FeedbackBannerProps) {
  const isCorrect = type === "correct";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border px-4 py-3.5 text-sm",
        "animate-in fade-in slide-in-from-bottom-2 duration-300",
        isCorrect
          ? [
              "border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100",
              "shadow-[0_0_20px_oklch(0.623_0.194_149.6_/_15%)]",
            ].join(" ")
          : "border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100"
      )}
    >
      <div className="flex items-start gap-2.5">
        {isCorrect ? (
          <Sparkles
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
          />
        ) : (
          <svg
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        )}
        <div className="space-y-0.5">
          <p className="font-bold text-base leading-snug">
            {isCorrect ? "Correct!" : "Not quite — keep going!"}
          </p>
          <p className="leading-relaxed">{message}</p>
          {!isCorrect && attemptCount && attemptCount > 1 && (
            <p className="text-xs mt-1 opacity-80">
              Attempt {attemptCount} — you&apos;ve got this.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
