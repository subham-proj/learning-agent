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
  idle: "bg-zinc-100 text-zinc-500",
  selected: "bg-violet-100 text-violet-700",
  correct: "bg-emerald-100 text-emerald-700",
  incorrect: "bg-red-100 text-red-700",
};

const BUTTON_CLASSES: Record<ChoiceState, string> = {
  idle: "border-zinc-200 bg-white text-zinc-800 hover:border-violet-300 hover:bg-violet-50/40",
  selected: "border-violet-400 bg-violet-50 text-zinc-900",
  correct: "border-emerald-400 bg-emerald-50 text-zinc-900",
  incorrect: "border-red-400 bg-red-50 text-zinc-900",
};

export function ChoiceButton({
  id,
  label,
  text,
  state,
  disabled,
  onClick,
}: ChoiceButtonProps) {
  return (
    <button
      type="button"
      id={`choice-${id}`}
      aria-pressed={state === "selected" || state === "correct" || state === "incorrect"}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
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
          className="mt-px h-4 w-4 shrink-0 text-red-500"
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
