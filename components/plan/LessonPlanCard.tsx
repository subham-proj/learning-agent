"use client";

import { useState } from "react";
import { Check, RefreshCw, Clock, BookOpen, Pencil, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { type LessonPlan, type Objective, type Difficulty } from "@/lib/agent/schemas";
import { cn } from "@/lib/utils";

const MIN_OBJECTIVES = 5;
const MAX_OBJECTIVES = 10;

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  beginner:     "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  intermediate: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  advanced:     "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

interface LessonPlanCardProps {
  plan?: LessonPlan;
  onApprove: (plan: LessonPlan) => void;
  onRegenerate: () => void;
  loading?: boolean;
}

function ObjectiveRow({
  objective,
  editable,
  removable,
  onChange,
  onRemove,
}: {
  objective: Objective;
  editable: boolean;
  removable: boolean;
  onChange: (updated: Objective) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-start gap-3 py-3 border-b border-border/60 last:border-0
                   rounded-lg px-2 -mx-2 transition-colors hover:bg-muted/40">
      <div className="flex-1 min-w-0">
        {editable ? (
          <Input
            value={objective.title}
            onChange={(e) => onChange({ ...objective, title: e.target.value })}
            className="text-sm font-medium mb-1"
            aria-label="Objective title"
            placeholder="Objective title"
          />
        ) : (
          <p className="text-sm font-medium text-foreground">{objective.title}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{objective.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge
          variant="outline"
          className={cn("capitalize text-xs", DIFFICULTY_STYLES[objective.difficulty])}
        >
          {objective.difficulty}
        </Badge>
        {editable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={!removable}
            aria-label="Remove objective"
            className={cn(
              "h-6 w-6 flex items-center justify-center rounded-md transition-colors",
              removable
                ? "text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

export function LessonPlanCard({ plan, onApprove, onRegenerate, loading }: LessonPlanCardProps) {
  // `key={planVersion}` in the parent remounts this component on each new plan,
  // so useState(plan) always initializes from the freshly received plan.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LessonPlan | null>(plan ?? null);

  if (loading) {
    return (
      <Card className="rounded-2xl shadow-sm glass bg-card/80 animate-fade-up">
        <CardHeader>
          <Skeleton className="h-6 w-2/3" />
          <div className="flex gap-4 mt-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-3 w-32 mb-4" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-10 w-36 rounded-xl" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!plan || !draft) return null;

  const count = draft.objectives.length;
  const canApprove = count >= MIN_OBJECTIVES;
  const canAdd = count < MAX_OBJECTIVES;
  const canRemove = count > MIN_OBJECTIVES;

  function updateObjective(index: number, updated: Objective) {
    setDraft((prev) =>
      prev
        ? { ...prev, objectives: prev.objectives.map((o, i) => (i === index ? updated : o)) }
        : prev
    );
  }

  function addObjective() {
    if (!canAdd) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            objectives: [
              ...prev.objectives,
              {
                id: crypto.randomUUID(),
                title: "",
                description: "",
                difficulty: prev.objectives.at(-1)?.difficulty ?? "beginner",
              },
            ],
          }
        : prev
    );
  }

  function removeObjective(index: number) {
    if (!canRemove) return;
    setDraft((prev) =>
      prev
        ? { ...prev, objectives: prev.objectives.filter((_, i) => i !== index) }
        : prev
    );
  }

  // Badge color: green within range, amber near max, red at max
  const countBadgeClass =
    count >= MAX_OBJECTIVES
      ? "text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-900"
      : count >= MAX_OBJECTIVES - 1
      ? "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-900"
      : "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-900";

  return (
    <Card className="rounded-2xl shadow-sm border-border/80 glass bg-card/80 animate-fade-up">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-xl font-bold text-foreground leading-snug">
            {draft.title}
          </CardTitle>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? "Stop editing" : "Edit plan"}
            className="shrink-0 text-muted-foreground hover:text-primary transition-colors mt-0.5"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-primary" />
            {draft.estimatedMinutes} min
          </span>
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="capitalize">{draft.overallDifficulty}</span>
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {/* Section header with objective count badge */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Learning Objectives
          </p>
          <span
            className={cn(
              "text-xs font-semibold border rounded-full px-2 py-0.5 tabular-nums",
              countBadgeClass
            )}
            aria-label={`${count} of ${MAX_OBJECTIVES} objectives`}
          >
            {count} / {MAX_OBJECTIVES}
          </span>
        </div>

        <ul className={cn("mb-2", editing ? "mb-3" : "mb-6")}>
          {draft.objectives.map((obj, i) => (
            <ObjectiveRow
              key={obj.id}
              objective={obj}
              editable={editing}
              removable={canRemove}
              onChange={(updated) => updateObjective(i, updated)}
              onRemove={() => removeObjective(i)}
            />
          ))}
        </ul>

        {/* Add objective — only in edit mode */}
        {editing && (
          <button
            type="button"
            onClick={addObjective}
            disabled={!canAdd}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-sm mb-5 transition-colors",
              canAdd
                ? "border-primary/30 text-primary hover:bg-accent"
                : "border-border text-muted-foreground/50 cursor-not-allowed"
            )}
            aria-disabled={!canAdd}
            title={!canAdd ? `Maximum ${MAX_OBJECTIVES} objectives reached` : "Add an objective"}
          >
            <Plus className="h-3.5 w-3.5" />
            {canAdd ? "Add objective" : `Max ${MAX_OBJECTIVES} reached`}
          </button>
        )}

        {/* Min-objectives warning */}
        {!canApprove && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3" role="alert">
            At least {MIN_OBJECTIVES} objectives are required. Add{" "}
            {MIN_OBJECTIVES - count} more to approve.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => canApprove && onApprove(editing ? draft : plan)}
            disabled={!canApprove}
            className={cn(
              "rounded-xl px-6 transition-all",
              canApprove
                ? "bg-primary hover:bg-primary/90 text-primary-foreground btn-glow"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            title={!canApprove ? `At least ${MIN_OBJECTIVES} objectives required` : undefined}
          >
            <Check className="h-4 w-4 mr-2" />
            {editing ? "Approve Edits" : "Approve Plan"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(false);
              onRegenerate();
            }}
            className="rounded-xl text-foreground border-border hover:border-primary/50 hover:text-primary hover:bg-accent transition-all"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
