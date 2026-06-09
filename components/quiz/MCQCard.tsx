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
      // renders as "selected" rather than inheriting "incorrect".
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
      className="rounded-2xl border border-border/80 glass bg-card/90 shadow-sm overflow-hidden animate-fade-up"
    >
      {/* Progress */}
      <div className="border-b border-border/50 bg-muted/30 px-6 pt-5 pb-4">
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
        <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
          Question
        </p>
        <h2
          id={headingId}
          className="text-lg font-semibold text-foreground leading-snug mb-6"
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
          className="mx-6 mb-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"
        >
          {submitError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-6 pb-6">
        <p className="text-xs text-muted-foreground">
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
              "rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm",
              "hover:bg-primary/90 active:scale-95 transition-all duration-150 btn-glow",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selectedId && submitState !== "submitting"
                ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-sm btn-glow"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {submitState === "submitting" ? "Checking…" : "Submit"}
          </button>
        )}
      </div>
    </section>
  );
}
