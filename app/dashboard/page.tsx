"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";
import { PdfUploader } from "@/components/upload/PdfUploader";
import { LessonPlanCard } from "@/components/plan/LessonPlanCard";
import { MCQCard } from "@/components/quiz/MCQCard";
import { LessonCard } from "@/components/history/LessonCard";
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
  | "summarizing"
  | "completed";

interface LessonSummary {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  overallScore: number | null;
}

/** Replace with real auth session userId in production */
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
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

  // Report state
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  // Lesson history
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const planAbortRef = useRef<AbortController | null>(null);
  const mcqAbortRef = useRef<AbortController | null>(null);

  const searchParams = useSearchParams();

  // Load lesson history on mount
  useEffect(() => {
    fetch(`/api/lessons?userId=${DEMO_USER_ID}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.lessons) setLessons(data.lessons as LessonSummary[]);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  // Refresh history when a lesson completes
  const refreshHistory = useCallback(() => {
    fetch(`/api/lessons?userId=${DEMO_USER_ID}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.lessons) setLessons(data.lessons as LessonSummary[]);
      })
      .catch(() => {});
  }, []);

  // Retry weak objectives: entered via /dashboard?retry=gaps&lessonId=X from the report page.
  // Fetches the lesson plan + report, filters to gap objectives (mastery < 80%), and starts the
  // quiz loop with only those objectives.
  useEffect(() => {
    const retryMode = searchParams.get("retry");
    const retryLessonId = searchParams.get("lessonId");
    if (retryMode !== "gaps" || !retryLessonId) return;

    async function initRetry() {
      const [lessonRes, reportRes] = await Promise.all([
        fetch(`/api/lessons/${retryLessonId}?userId=${DEMO_USER_ID}`),
        fetch(`/api/report/${retryLessonId}?userId=${DEMO_USER_ID}`),
      ]);

      if (!lessonRes.ok || !reportRes.ok) return;

      const [lessonData, reportData] = await Promise.all([
        lessonRes.json() as Promise<{
          lessonId: string;
          lessonPlan: LessonPlan;
          fileUrl: string;
        }>,
        reportRes.json() as Promise<{
          masteryByObjective: { objectiveId: string; masteryPercent: number }[];
        }>,
      ]);

      const gapIds = new Set(
        reportData.masteryByObjective
          .filter((m) => m.masteryPercent < 80)
          .map((m) => m.objectiveId)
      );

      const filteredObjectives = lessonData.lessonPlan.objectives.filter((o) =>
        gapIds.has(o.id)
      );
      if (filteredObjectives.length === 0) return;

      const retryPlan: LessonPlan = { ...lessonData.lessonPlan, objectives: filteredObjectives };
      const fakeIngest: IngestResult = {
        lessonId: lessonData.lessonId,
        fileUrl: lessonData.fileUrl,
        rawText: "",
        chunkCount: 0,
      };

      setIngestResult(fakeIngest);
      setApprovedPlan(retryPlan);
      setCurrentObjectiveIndex(0);
      fetchMCQ(retryPlan, lessonData.lessonId, 0);
    }

    initRetry().catch(() => {});
  // fetchMCQ is a stable function defined inside the component — intentionally excluded from
  // deps to avoid re-triggering on every render. This effect fires once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  async function fetchMCQ(plan: LessonPlan, lessonId: string, objectiveIdx: number) {
    const objective = plan.objectives[objectiveIdx];
    if (!objective) {
      await triggerSummarize(lessonId);
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
  }

  async function triggerSummarize(lessonId: string) {
    setFlowState("summarizing");
    setReportError(null);

    try {
      const res = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, userId: DEMO_USER_ID }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Report generation failed");

      setReportId((data as { reportId: string }).reportId);
      refreshHistory();
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setFlowState("completed");
    }
  }

  function handleStartLearning() {
    if (!approvedPlan || !ingestResult) return;
    setCurrentObjectiveIndex(0);
    fetchMCQ(approvedPlan, ingestResult.lessonId, 0);
  }

  function handleAdvance() {
    if (!approvedPlan || !ingestResult) return;
    const nextIndex = currentObjectiveIndex + 1;

    if (nextIndex >= approvedPlan.objectives.length) {
      triggerSummarize(ingestResult.lessonId);
      return;
    }

    setCurrentObjectiveIndex(nextIndex);
    fetchMCQ(approvedPlan, ingestResult.lessonId, nextIndex);
  }

  const isPlanning = flowState === "planning" || flowState === "regenerating";
  const isGeneratingMcq = flowState === "generating_mcq";

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-8 animate-fade-up">

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          <StepDot
            step={1}
            active={flowState === "idle"}
            done={flowState !== "idle"}
            label="Upload"
          />
          <StepLine done={flowState !== "idle"} />
          <StepDot
            step={2}
            active={isPlanning}
            done={["hitl", "approved", "quiz", "generating_mcq", "summarizing", "completed"].includes(flowState)}
            label="Plan"
          />
          <StepLine done={["hitl", "approved", "quiz", "generating_mcq", "summarizing", "completed"].includes(flowState)} />
          <StepDot
            step={3}
            active={flowState === "hitl"}
            done={["approved", "quiz", "generating_mcq", "summarizing", "completed"].includes(flowState)}
            label="Review"
          />
          <StepLine done={["approved", "quiz", "generating_mcq", "summarizing", "completed"].includes(flowState)} />
          <StepDot
            step={4}
            active={flowState === "quiz" || flowState === "generating_mcq"}
            done={flowState === "summarizing" || flowState === "completed"}
            label="Learn"
          />
          <StepLine done={flowState === "summarizing" || flowState === "completed"} />
          <StepDot
            step={5}
            active={flowState === "summarizing"}
            done={flowState === "completed"}
            label="Report"
          />
        </div>

        {/* Upload — visible until approved */}
        {!["approved", "quiz", "generating_mcq", "summarizing", "completed"].includes(flowState) && (
          <div className="animate-fade-up">
            <PdfUploader userId={DEMO_USER_ID} onComplete={handleUploadComplete} />
          </div>
        )}

        {/* Planning skeleton */}
        {isPlanning && (
          <div className="space-y-3 animate-fade-up">
            <p className="text-sm text-primary font-medium animate-pulse flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              {flowState === "regenerating" ? "Regenerating plan…" : "Generating lesson plan…"}
            </p>
            <LessonPlanCard onApprove={() => {}} onRegenerate={() => {}} loading />
          </div>
        )}

        {/* HITL approval card */}
        {flowState === "hitl" && !planError && lessonPlan && (
          <div className="animate-fade-up">
            <LessonPlanCard
              key={planVersion}
              plan={lessonPlan}
              onApprove={handleApprove}
              onRegenerate={handleRegenerate}
            />
          </div>
        )}

        {/* Planning error */}
        {flowState === "hitl" && planError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 p-6 space-y-3 animate-fade-up">
            <p className="font-semibold text-red-700 dark:text-red-400">Could not generate plan</p>
            <p className="text-sm text-red-500 dark:text-red-400">{planError}</p>
            <button
              type="button"
              onClick={handleRegenerate}
              className="text-sm text-primary underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Approved — start learning prompt */}
        {flowState === "approved" && approvedPlan && (
          <div className={cn(
            "rounded-2xl border border-emerald-500/20 glass p-8 text-center space-y-4",
            "bg-emerald-50/60 dark:bg-emerald-950/20",
            "shadow-[0_0_40px_oklch(0.623_0.194_149.6_/_10%)]",
            "animate-fade-up"
          )}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full
                            bg-emerald-100 dark:bg-emerald-900/40
                            ring-4 ring-emerald-500/20">
              <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">Lesson plan approved!</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                &ldquo;{approvedPlan.title}&rdquo;
              </p>
              <p className="text-xs text-emerald-500 dark:text-emerald-500 mt-1">
                {approvedPlan.objectives.length} objectives · {approvedPlan.estimatedMinutes} min · {approvedPlan.overallDifficulty}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartLearning}
              className={cn(
                "rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm",
                "hover:bg-primary/90 active:scale-95 transition-all duration-150 btn-glow",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
            >
              Start Learning →
            </button>
          </div>
        )}

        {/* MCQ generating skeleton */}
        {isGeneratingMcq && (
          <div className="rounded-2xl border border-border glass bg-card/80 p-8 space-y-4 shadow-sm animate-fade-up">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
              <p className="text-sm text-primary font-medium ml-1">Generating question…</p>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-4 w-full rounded bg-muted animate-pulse" />
            </div>
            <div className="space-y-2 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-full rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* MCQ error */}
        {flowState === "quiz" && mcqError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 p-6 space-y-3 animate-fade-up">
            <p className="font-semibold text-red-700 dark:text-red-400">Could not generate question</p>
            <p className="text-sm text-red-500 dark:text-red-400">{mcqError}</p>
            <button
              type="button"
              onClick={() => {
                if (approvedPlan && ingestResult) {
                  fetchMCQ(approvedPlan, ingestResult.lessonId, currentObjectiveIndex);
                }
              }}
              className="text-sm text-primary underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* MCQ Card */}
        {flowState === "quiz" && !mcqError && currentMCQ && approvedPlan && ingestResult && (
          <MCQCard
            key={currentMCQ.id}
            mcq={currentMCQ}
            lessonId={ingestResult.lessonId}
            userId={DEMO_USER_ID}
            objectiveIndex={currentObjectiveIndex}
            totalObjectives={approvedPlan.objectives.length}
            onAdvance={handleAdvance}
          />
        )}

        {/* Summarizing */}
        {flowState === "summarizing" && (
          <div className={cn(
            "rounded-2xl border border-primary/20 glass p-8 text-center space-y-4",
            "bg-primary/[0.04] dark:bg-primary/[0.08]",
            "animate-fade-up"
          )}>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
            </div>
            <p className="text-sm text-primary font-medium">
              Generating your personalized report…
            </p>
          </div>
        )}

        {/* Completed */}
        {flowState === "completed" && approvedPlan && (
          <div className={cn(
            "rounded-2xl border border-primary/20 glass p-8 text-center space-y-4",
            "bg-primary/[0.04] dark:bg-primary/[0.08]",
            "shadow-[0_0_40px_oklch(0.558_0.234_293.7_/_12%)]",
            "animate-fade-up"
          )}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full
                            bg-primary/10 dark:bg-primary/20
                            ring-4 ring-primary/20">
              <svg className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">Lesson complete!</p>
              <p className="text-sm text-muted-foreground mt-1">
                You finished all {approvedPlan.objectives.length} objectives in &ldquo;{approvedPlan.title}&rdquo;.
              </p>
            </div>

            {reportError && (
              <p className="text-xs text-red-500 dark:text-red-400">{reportError}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {reportId && ingestResult && (
                <a
                  href={`/lessons/${ingestResult.lessonId}/report`}
                  className={cn(
                    "rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm",
                    "hover:bg-primary/90 active:scale-95 transition-all duration-150 btn-glow",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                >
                  View your report →
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setFlowState("idle");
                  setIngestResult(null);
                  setLessonPlan(null);
                  setApprovedPlan(null);
                  setCurrentMCQ(null);
                  setReportId(null);
                  setReportError(null);
                  setCurrentObjectiveIndex(0);
                }}
                className={cn(
                  "rounded-xl bg-muted px-6 py-2.5 text-sm font-semibold text-foreground",
                  "hover:bg-muted/80 active:scale-95 transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                )}
              >
                Start new lesson
              </button>
            </div>
          </div>
        )}

        {/* Lesson history — shown in idle state when there are past lessons */}
        {flowState === "idle" && (
          <section aria-label="Past lessons" className="space-y-4 pt-2 animate-fade-up animation-delay-150">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Past Lessons
              </h2>
              {historyLoading && (
                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
              )}
            </div>

            {!historyLoading && lessons.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
                <p className="text-sm font-medium text-muted-foreground">No lessons yet</p>
                <p className="text-xs text-muted-foreground/70">
                  Upload a PDF above to start your first lesson.
                </p>
              </div>
            )}

            {lessons.length > 0 && (
              <div className="space-y-3">
                {lessons.map((lesson) => (
                  <LessonCard key={lesson.id} {...lesson} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function StepDot({
  step,
  active,
  done,
  label,
}: {
  step: number;
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold",
          "transition-all duration-300 ring-2 ring-offset-2 ring-offset-background",
          done
            ? "bg-emerald-500 text-white ring-emerald-500/40"
            : active
            ? "bg-primary text-primary-foreground ring-primary/40 shadow-lg"
            : "bg-muted text-muted-foreground ring-transparent"
        )}
      >
        {done ? (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          step
        )}
      </div>
      <span
        className={cn(
          "text-[11px] font-medium tracking-wide",
          done
            ? "text-emerald-600 dark:text-emerald-400"
            : active
            ? "text-primary font-semibold"
            : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function StepLine({ done }: { done?: boolean }) {
  return (
    <div
      className={cn(
        "flex-1 h-0.5 mb-5 rounded-full transition-all duration-500",
        done ? "bg-emerald-500" : "bg-border"
      )}
    />
  );
}
