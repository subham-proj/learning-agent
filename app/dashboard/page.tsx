"use client";

import { useState, useRef } from "react";
import { useCopilotReadable } from "@copilotkit/react-core";
import { PdfUploader } from "@/components/upload/PdfUploader";
import { LessonPlanCard } from "@/components/plan/LessonPlanCard";
import { LessonPlan, IngestResult } from "@/lib/agent/schemas";
import { cn } from "@/lib/utils";

type FlowState = "idle" | "planning" | "hitl" | "regenerating" | "approved";

/** Replace with real auth session userId in production */
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

export default function DashboardPage() {
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [planVersion, setPlanVersion] = useState(0);
  const [planError, setPlanError] = useState<string | null>(null);
  const [approvedPlan, setApprovedPlan] = useState<LessonPlan | null>(null);

  const planAbortRef = useRef<AbortController | null>(null);

  // Expose current plan to the CopilotKit context for future agent integration
  useCopilotReadable({
    description: "The lesson plan currently under review",
    value: lessonPlan,
  });

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

      if (!res.ok) {
        throw new Error(data.error ?? "Planning failed");
      }

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

  const isPlanning = flowState === "planning" || flowState === "regenerating";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50/30 px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900">AI Learning Agent</h1>
          <p className="text-zinc-500">
            Upload a PDF and get a structured lesson plan — reviewed and approved by you.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          <StepDot active={flowState === "idle"} done={flowState !== "idle"} label="Upload" />
          <StepLine />
          <StepDot
            active={isPlanning}
            done={flowState === "hitl" || flowState === "approved"}
            label="Plan"
          />
          <StepLine />
          <StepDot active={flowState === "hitl"} done={flowState === "approved"} label="Review" />
          <StepLine />
          <StepDot active={false} done={flowState === "approved"} label="Approved" />
        </div>

        {/* Upload zone — visible until approved */}
        {flowState !== "approved" && (
          <PdfUploader userId={DEMO_USER_ID} onComplete={handleUploadComplete} />
        )}

        {/* Planning / regenerating skeleton */}
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

        {/* Approved state */}
        {flowState === "approved" && approvedPlan && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-emerald-800">Lesson plan approved!</p>
            <p className="text-sm text-emerald-600">
              &ldquo;{approvedPlan.title}&rdquo;
            </p>
            <p className="text-xs text-emerald-500 mt-1">
              {approvedPlan.objectives.length} objectives · {approvedPlan.estimatedMinutes} min · {approvedPlan.overallDifficulty}
            </p>
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
