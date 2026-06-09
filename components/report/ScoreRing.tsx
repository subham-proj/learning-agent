"use client";

import { useEffect, useRef, useState } from "react";

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
}

export function ScoreRing({ score, size = 160, strokeWidth = 12 }: ScoreRingProps) {
  const [displayed, setDisplayed] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const duration = 1200;

  useEffect(() => {
    // Reset so the animation always starts from scratch when score changes.
    startRef.current = null;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setTimeout(() => setDisplayed(score), 0);
      return;
    }

    function tick(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * score));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [score]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayed / 100) * circumference;

  const color =
    score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div
      role="img"
      aria-label={`Overall score: ${score}%`}
      className="flex flex-col items-center gap-3"
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-100 dark:text-zinc-800"
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.05s linear" }}
        />
      </svg>
      {/* Centered label — overlaid via absolute positioning */}
      <div className="relative" style={{ marginTop: -(size + 12) }}>
        <div
          className="flex flex-col items-center justify-center"
          style={{ width: size, height: size }}
        >
          <span
            className="text-4xl font-bold tabular-nums"
            style={{ color }}
          >
            {displayed}%
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Overall Score
          </span>
        </div>
      </div>
    </div>
  );
}
