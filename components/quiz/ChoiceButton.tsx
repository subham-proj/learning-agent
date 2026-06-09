import { cn } from "@/lib/utils";

export type ChoiceState = "idle" | "selected" | "correct" | "incorrect";

interface ChoiceButtonProps {
  id: string;
  label: string;
  text: string;
  state: ChoiceState;
  disabled: boolean;
  onClick: () => void;
}

const LABEL_CLASSES: Record<ChoiceState, string> = {
  idle:      "bg-muted text-muted-foreground",
  selected:  "bg-primary/15 text-primary font-bold",
  correct:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  incorrect: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const BUTTON_CLASSES: Record<ChoiceState, string> = {
  idle: [
    "border-border bg-card/60 text-foreground",
    "hover:border-primary/40 hover:bg-accent/30 hover:shadow-sm",
  ].join(" "),
  selected: [
    "border-primary/60 bg-primary/[0.08] text-foreground",
    "shadow-[0_0_0_3px_oklch(0.558_0.234_293.7_/_12%)]",
  ].join(" "),
  correct: [
    "border-emerald-500/50 bg-emerald-50/80 dark:bg-emerald-950/30 text-foreground",
    "shadow-[0_0_0_3px_oklch(0.623_0.194_149.6_/_15%)]",
  ].join(" "),
  incorrect: [
    "border-destructive/50 bg-destructive/5 text-foreground",
    "shadow-[0_0_0_3px_oklch(0.577_0.245_27.325_/_12%)]",
  ].join(" "),
};

export function ChoiceButton({
  id,
  label,
  text,
  state,
  disabled,
  onClick,
}: ChoiceButtonProps) {
  const isChecked = state === "selected" || state === "correct" || state === "incorrect";

  return (
    <button
      type="button"
      id={`choice-${id}`}
      // role="radio" + aria-checked is the correct pattern for single-select
      // option groups. aria-pressed is for toggle buttons (on/off), not MCQs.
      role="radio"
      aria-checked={isChecked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-medium",
        "transition-all duration-150 glass",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_CLASSES[state]
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
          LABEL_CLASSES[state]
        )}
      >
        {label}
      </span>
      <span className="flex-1 leading-snug">{text}</span>
      {state === "correct" && (
        <svg
          aria-label="Correct"
          role="img"
          className="mt-px h-4 w-4 shrink-0 text-emerald-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {state === "incorrect" && (
        <svg
          aria-label="Incorrect"
          role="img"
          className="mt-px h-4 w-4 shrink-0 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
    </button>
  );
}
