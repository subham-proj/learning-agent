"use client";

import { useState, useCallback, useId, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { type MCQClient, type AnswerResult } from "@/lib/agent/schemas";
import { ChoiceButton, type ChoiceState } from "./ChoiceButton";
import { FeedbackBanner } from "./FeedbackBanner";
import { ProgressBar } from "./ProgressBar";

interface MCQCardProps {
  mcq: MCQClient;
  lessonId: string;
  userId: string;
  objectiveIndex: number;
  totalObjectives: number;
  onAdvance: () => void;
}

type SubmitState = "idle" | "submitting" | "correct" | "incorrect";

export function MCQCard({
  mcq,
  lessonId,
  userId,
  objectiveIndex,
  totalObjectives,
  onAdvance,
}: MCQCardProps) {
  const headingId = useId();
  const feedbackRef = useRef<HTMLDivElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [shake, setShake] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Move focus to feedback banner after evaluation.
  useEffect(() => {
    if (submitState === "correct" || submitState === "incorrect") {
      feedbackRef.current?.focus();
    }
  }, [submitState]);

  const handleSelect = useCallback(
    (id: string) => {
      if (submitState === "correct") return;
      // When retrying after a wrong answer, reset to idle so the new pick
      // renders as "selected" (violet) rather than inheriting "incorrect" (red).
      if (submitState === "incorrect") {
        setSubmitState("idle");
      }
      setSelectedId(id);
      setSubmitError(null);
    },
    [submitState]
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedId || submitState === "submitting" || submitState === "correct") return;

    setSubmitState("submitting");
    setSubmitError(null);

    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcqId: mcq.id,
          selectedChoiceId: selectedId,
          lessonId,
          userId,
        }),
      });

      const data: AnswerResult & { error?: string } = await res.json();

      if (!res.ok || data.error) {
        setSubmitError(
          typeof data.error === "string"
            ? data.error
            : "Something went wrong submitting your answer. Try again."
        );
        setSubmitState("idle");
        return;
      }

      const nextAttempt = attemptCount + 1;
      setAttemptCount(nextAttempt);
      setFeedback(data);

      if (data.correct) {
        setSubmitState("correct");
      } else {
        setSubmitState("incorrect");
        setSelectedId(null);
        // Trigger shake — reset then re-apply so it replays on multiple wrong answers.
        setShake(false);
        requestAnimationFrame(() => setShake(true));
      }
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
      setSubmitState("idle");
    }
  }, [selectedId, submitState, mcq.id, lessonId, userId, attemptCount]);

  function choiceState(choiceId: string): ChoiceState {
    if (submitState === "correct" && choiceId === selectedId) return "correct";
    if (submitState === "incorrect" && choiceId === selectedId) return "incorrect";
    if (choiceId === selectedId) return "selected";
    return "idle";
  }

  const choicesDisabled = submitState === "submitting" || submitState === "correct";
  const labels = ["A", "B", "C", "D", "E", "F"];

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Progress */}
      <div className="border-b border-zinc-100 bg-zinc-50/60 px-6 pt-5 pb-4">
        <ProgressBar current={objectiveIndex + 1} total={totalObjectives} />
      </div>

      {/* Question */}
      <div
        className={cn(
          "px-6 pt-6 pb-4",
          shake && "animate-shake"
        )}
        onAnimationEnd={() => setShake(false)}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-3">
          Question
        </p>
        <h2
          id={headingId}
          className="text-lg font-semibold text-zinc-900 leading-snug mb-6"
        >
          {mcq.question}
        </h2>

        {/* Choices — radiogroup so screen readers announce "1 of 4", "2 of 4" etc. */}
        <div role="radiogroup" aria-labelledby={headingId} className="space-y-2.5">
          {mcq.choices.map((choice, i) => (
            <ChoiceButton
              key={choice.id}
              id={choice.id}
              label={labels[i] ?? choice.id}
              text={choice.text}
              state={choiceState(choice.id)}
              disabled={choicesDisabled}
              onClick={() => handleSelect(choice.id)}
            />
          ))}
        </div>
      </div>

      {/* Feedback — also shown in idle when retrying after a wrong answer */}
      {feedback && (
        submitState === "correct" ||
        submitState === "incorrect" ||
        (submitState === "idle" && !feedback.correct)
      ) && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          className="px-6 pb-4 focus-visible:outline-none"
        >
          <FeedbackBanner
            type={feedback.correct ? "correct" : "incorrect"}
            message={
              feedback.correct
                ? (feedback.explanation ?? "Well done!")
                : (feedback.hint ?? "Think it through and try again.")
            }
            attemptCount={attemptCount}
          />
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div
          role="alert"
          className="mx-6 mb-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
        >
          {submitError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-6 pb-6">
        <p className="text-xs text-zinc-400">
          {submitState === "idle" || submitState === "submitting"
            ? "Pick an answer to continue"
            : submitState === "incorrect"
            ? "Select a different answer and try again"
            : ""}
        </p>

        {submitState === "correct" ? (
          <button
            type="button"
            onClick={onAdvance}
            autoFocus
            className={cn(
              "rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm",
              "hover:bg-violet-700 active:scale-95 transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
            )}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedId || submitState === "submitting"}
            className={cn(
              "rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2",
              selectedId && submitState !== "submitting"
                ? "bg-violet-600 text-white hover:bg-violet-700 active:scale-95 shadow-sm"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
          >
            {submitState === "submitting" ? "Checking…" : "Submit"}
          </button>
        )}
      </div>
    </section>
  );
}
