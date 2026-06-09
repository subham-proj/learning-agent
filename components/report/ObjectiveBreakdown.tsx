"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type MasteryByObjective } from "@/lib/agent/schemas";

interface ObjectiveBreakdownProps {
  masteryByObjective: MasteryByObjective[];
}

function MasteryBar({ mastery, index }: { mastery: MasteryByObjective; index: number }) {
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setTimeout(() => setWidth(mastery.masteryPercent), 0);
      return;
    }
    timerRef.current = setTimeout(() => setWidth(mastery.masteryPercent), index * 80);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [mastery.masteryPercent, index]);

  const color =
    mastery.masteryPercent >= 80
      ? "bg-emerald-500"
      : mastery.masteryPercent >= 60
      ? "bg-amber-400"
      : "bg-red-400";

  const textColor =
    mastery.masteryPercent >= 80
      ? "text-emerald-700 dark:text-emerald-400"
      : mastery.masteryPercent >= 60
      ? "text-amber-700 dark:text-amber-400"
      : "text-red-700 dark:text-red-400";

  const glowColor =
    mastery.masteryPercent >= 80
      ? "oklch(0.623 0.194 149.6 / 40%)"
      : mastery.masteryPercent >= 60
      ? "oklch(0.75 0.175 70 / 40%)"
      : "oklch(0.577 0.245 27.325 / 40%)";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground leading-snug line-clamp-1">
          {mastery.objectiveTitle}
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {mastery.firstTryCorrect && (
            <span className="text-[10px] font-bold uppercase tracking-wide
                             text-emerald-700 dark:text-emerald-400
                             bg-emerald-100 dark:bg-emerald-900/30
                             px-1.5 py-0.5 rounded-full">
              First try!
            </span>
          )}
          <span className={cn("text-sm font-bold tabular-nums", textColor)}>
            {mastery.masteryPercent}%
          </span>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", color)}
          style={{
            width: `${width}%`,
            boxShadow: `0 0 8px ${glowColor}`,
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {mastery.correctAttempts}/{mastery.totalAttempts} correct{" "}
        {mastery.totalAttempts > 0 && `· ${mastery.totalAttempts} attempt${mastery.totalAttempts !== 1 ? "s" : ""}`}
      </p>
    </div>
  );
}

export function ObjectiveBreakdown({ masteryByObjective }: ObjectiveBreakdownProps) {
  if (masteryByObjective.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No objectives recorded.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {masteryByObjective.map((mastery, i) => (
        <MasteryBar key={mastery.objectiveId} mastery={mastery} index={i} />
      ))}
    </div>
  );
}
