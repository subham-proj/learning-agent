"use client";

import { useState, useRef, useCallback } from "react";
import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";
import { PdfUploader } from "@/components/upload/PdfUploader";
import { LessonPlanCard } from "@/components/plan/LessonPlanCard";
import { MCQCard } from "@/components/quiz/MCQCard";
import { type LessonPlan, type IngestResult, type MCQClient } from "@/lib/agent/schemas";
import { cn } from "@/lib/utils";

type FlowState =
  | "idle"
  | "planning"
  | "hitl"
  | "regenerating"
  | "approved"
  | "quiz"
  | "generating_mcq"
  | "completed";

/** Replace with real auth session userId in production */
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export default function DashboardPage() {
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [planVersion, setPlanVersion] = useState(0);
  const [planError, setPlanError] = useState<string | null>(null);
  const [approvedPlan, setApprovedPlan] = useState<LessonPlan | null>(null);

  // Quiz state
  const [currentObjectiveIndex, setCurrentObjectiveIndex] = useState(0);
  const [currentMCQ, setCurrentMCQ] = useState<MCQClient | null>(null);
  const [mcqError, setMcqError] = useState<string | null>(null);

  const planAbortRef = useRef<AbortController | null>(null);
  const mcqAbortRef = useRef<AbortController | null>(null);

  // ── CopilotKit: expose context for sidebar AI ───────────────────────────

  useCopilotReadable({
    description: "The lesson plan currently under review or being learned",
    value: lessonPlan ?? approvedPlan,
  });

  useCopilotReadable({
    description:
      "The current MCQ question (without the correct answer). Used to provide hints.",
    value: currentMCQ
      ? {
          question: currentMCQ.question,
          choices: currentMCQ.choices,
          objectiveId: currentMCQ.objectiveId,
        }
      : null,
  });

  useCopilotReadable({
    description: "Current objective being studied",
    value:
      approvedPlan && currentObjectiveIndex < (approvedPlan.objectives.length ?? 0)
        ? approvedPlan.objectives[currentObjectiveIndex]
        : null,
  });

  // ── CopilotKit actions for sidebar hint / learn-more ───────────────────

  useCopilotAction({
    name: "provide_hint",
    description:
      "Provide a targeted hint for the current question without revealing the correct answer",
    parameters: [],
    handler: async () => {
      if (!ingestResult || !approvedPlan || !currentMCQ) {
        return "No active question to hint on right now.";
      }
      const objective = approvedPlan.objectives[currentObjectiveIndex];
      if (!objective) return "No active objective.";

      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: ingestResult.lessonId,
          objectiveTitle: objective.title,
          objectiveDescription: objective.description,
          question: currentMCQ.question,
          mode: "hint",
        }),
      });
      const data = await res.json();
      return (data.response as string) ?? "Try re-reading the objective description.";
    },
    render: ({ status, result }) => {
      if (status !== "complete" || !result) return <></>;
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
          <p className="font-semibold">Hint</p>
          <p>{result as string}</p>
        </div>
      );
    },
  });

  useCopilotAction({
    name: "explain_more",
    description:
      "Explain the topic of the current objective in more depth, without revealing the MCQ answer",
    parameters: [
      {
        name: "aspect",
        type: "string",
        description: "The specific aspect or concept the user wants explained",
        required: false,
      },
    ],
    handler: async ({ aspect }: { aspect?: string }) => {
      if (!ingestResult || !approvedPlan || !currentMCQ) {
        return "No active question to explain.";
      }
      const objective = approvedPlan.objectives[currentObjectiveIndex];
      if (!objective) return "No active objective.";

      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: ingestResult.lessonId,
          objectiveTitle: objective.title,
          objectiveDescription: objective.description,
          question: currentMCQ.question,
          mode: "learn_more",
          userQuery: aspect,
        }),
      });
      const data = await res.json();
      return (data.response as string) ?? "Focus on the key terms in the objective.";
    },
    render: ({ status, result }) => {
      if (status !== "complete" || !result) return <></>;
      return (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 space-y-1">
          <p className="font-semibold">Deep dive</p>
          <p>{result as string}</p>
        </div>
      );
    },
  });

  // ── Plan flow ───────────────────────────────────────────────────────────

  async function fetchPlan(ingest: IngestResult) {
    planAbortRef.current?.abort();
    planAbortRef.current = new AbortController();
    setPlanError(null);

    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: ingest.lessonId, rawText: ingest.rawText }),
        signal: planAbortRef.current.signal,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Planning failed");

      setLessonPlan(data.lessonPlan);
      setPlanVersion((v) => v + 1);
      setFlowState("hitl");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setPlanError(err instanceof Error ? err.message : "Planning failed");
      setFlowState("hitl");
    }
  }

  function handleUploadComplete(result: IngestResult) {
    setIngestResult(result);
    setFlowState("planning");
    fetchPlan(result);
  }

  function handleApprove(plan: LessonPlan) {
    setApprovedPlan(plan);
    setFlowState("approved");
  }

  function handleRegenerate() {
    if (!ingestResult) return;
    setLessonPlan(null);
    setPlanError(null);
    setFlowState("regenerating");
    fetchPlan(ingestResult);
  }

  // ── Quiz flow ───────────────────────────────────────────────────────────

  const fetchMCQ = useCallback(
    async (plan: LessonPlan, lessonId: string, objectiveIdx: number) => {
      const objective = plan.objectives[objectiveIdx];
      if (!objective) {
        setFlowState("completed");
        return;
      }

      mcqAbortRef.current?.abort();
      mcqAbortRef.current = new AbortController();
      setMcqError(null);
      setCurrentMCQ(null);
      setFlowState("generating_mcq");

      try {
        const res = await fetch("/api/mcq/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            objectiveId: objective.id,
            objectiveTitle: objective.title,
            objectiveDescription: objective.description,
          }),
          signal: mcqAbortRef.current.signal,
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.error ?? "MCQ generation failed");

        setCurrentMCQ(data.mcq as MCQClient);
        setFlowState("quiz");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setMcqError(err instanceof Error ? err.message : "MCQ generation failed");
        setFlowState("quiz");
      }
    },
    []
  );

  function handleStartLearning() {
    if (!approvedPlan || !ingestResult) return;
    setCurrentObjectiveIndex(0);
    fetchMCQ(approvedPlan, ingestResult.lessonId, 0);
  }

  function handleAdvance() {
    if (!approvedPlan || !ingestResult) return;
    const nextIndex = currentObjectiveIndex + 1;

    if (nextIndex >= approvedPlan.objectives.length) {
      setFlowState("completed");
      return;
    }

    setCurrentObjectiveIndex(nextIndex);
    fetchMCQ(approvedPlan, ingestResult.lessonId, nextIndex);
  }

  const isPlanning = flowState === "planning" || flowState === "regenerating";
  const isGeneratingMcq = flowState === "generating_mcq";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50/30 px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900">AI Learning Agent</h1>
          <p className="text-zinc-500">
            Upload a PDF, review your lesson plan, then learn through adaptive quizzes.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          <StepDot active={flowState === "idle"} done={flowState !== "idle"} label="Upload" />
          <StepLine />
          <StepDot
            active={isPlanning}
            done={
              ["hitl", "approved", "quiz", "generating_mcq", "completed"].includes(flowState)
            }
            label="Plan"
          />
          <StepLine />
          <StepDot
            active={flowState === "hitl"}
            done={["approved", "quiz", "generating_mcq", "completed"].includes(flowState)}
            label="Review"
          />
          <StepLine />
          <StepDot
            active={flowState === "quiz" || flowState === "generating_mcq"}
            done={flowState === "completed"}
            label="Learn"
          />
        </div>

        {/* Upload — visible until approved */}
        {!["approved", "quiz", "generating_mcq", "completed"].includes(flowState) && (
          <PdfUploader userId={DEMO_USER_ID} onComplete={handleUploadComplete} />
        )}

        {/* Planning skeleton */}
        {isPlanning && (
          <div className="space-y-3">
            <p className="text-sm text-violet-600 font-medium animate-pulse">
              {flowState === "regenerating" ? "Regenerating plan…" : "Generating lesson plan…"}
            </p>
            <LessonPlanCard onApprove={() => {}} onRegenerate={() => {}} loading />
          </div>
        )}

        {/* HITL approval card */}
        {flowState === "hitl" && !planError && lessonPlan && (
          <LessonPlanCard
            key={planVersion}
            plan={lessonPlan}
            onApprove={handleApprove}
            onRegenerate={handleRegenerate}
          />
        )}

        {/* Planning error */}
        {flowState === "hitl" && planError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 space-y-3">
            <p className="font-semibold text-red-700">Could not generate plan</p>
            <p className="text-sm text-red-500">{planError}</p>
            <button
              onClick={handleRegenerate}
              className="text-sm text-violet-600 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Approved — start learning prompt */}
        {flowState === "approved" && approvedPlan && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg
                className="h-6 w-6 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-emerald-800">Lesson plan approved!</p>
              <p className="text-sm text-emerald-600 mt-1">
                &ldquo;{approvedPlan.title}&rdquo;
              </p>
              <p className="text-xs text-emerald-500 mt-1">
                {approvedPlan.objectives.length} objectives · {approvedPlan.estimatedMinutes}{" "}
                min · {approvedPlan.overallDifficulty}
              </p>
            </div>
            <button
              onClick={handleStartLearning}
              className={cn(
                "rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm",
                "hover:bg-violet-700 active:scale-95 transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
              )}
            >
              Start Learning →
            </button>
          </div>
        )}

        {/* MCQ generating skeleton */}
        {isGeneratingMcq && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.3s]" />
              <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.15s]" />
              <div className="h-2 w-2 rounded-full bg-violet-400 animate-bounce" />
              <p className="text-sm text-violet-600 font-medium ml-1">Generating question…</p>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-3/4 rounded bg-zinc-100 animate-pulse" />
              <div className="h-4 w-full rounded bg-zinc-100 animate-pulse" />
            </div>
            <div className="space-y-2 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-full rounded-xl bg-zinc-100 animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* MCQ error */}
        {flowState === "quiz" && mcqError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 space-y-3">
            <p className="font-semibold text-red-700">Could not generate question</p>
            <p className="text-sm text-red-500">{mcqError}</p>
            <button
              onClick={() => {
                if (approvedPlan && ingestResult) {
                  fetchMCQ(approvedPlan, ingestResult.lessonId, currentObjectiveIndex);
                }
              }}
              className="text-sm text-violet-600 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* MCQ Card */}
        {flowState === "quiz" && !mcqError && currentMCQ && approvedPlan && (
          <MCQCard
            key={currentMCQ.id}
            mcq={currentMCQ}
            lessonId={ingestResult!.lessonId}
            userId={DEMO_USER_ID}
            objectiveIndex={currentObjectiveIndex}
            totalObjectives={approvedPlan.objectives.length}
            onAdvance={handleAdvance}
          />
        )}

        {/* Completed */}
        {flowState === "completed" && approvedPlan && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
              <svg
                className="h-7 w-7 text-violet-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-violet-900">Lesson complete!</p>
              <p className="text-sm text-violet-600 mt-1">
                You finished all {approvedPlan.objectives.length} objectives in &ldquo;
                {approvedPlan.title}&rdquo;.
              </p>
              <p className="text-xs text-violet-400 mt-2">
                Phase 3 summary &amp; scoring coming soon.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "h-2.5 w-2.5 rounded-full transition-colors",
          done ? "bg-emerald-500" : active ? "bg-violet-500" : "bg-zinc-200"
        )}
      />
      <span
        className={cn(
          "text-xs",
          done ? "text-emerald-600" : active ? "text-violet-600 font-medium" : "text-zinc-400"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function StepLine() {
  return <div className="flex-1 h-px bg-zinc-200 mb-4" />;
}
