interface StrengthsGapsProps {
  strengths: string[];
  gaps: string[];
}

export function StrengthsGaps({ strengths, gaps }: StrengthsGapsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Strengths */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Strengths
          </h3>
        </div>
        {strengths.length > 0 ? (
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="text-sm text-emerald-700 dark:text-emerald-400 leading-snug flex gap-2">
                <span aria-hidden="true" className="text-emerald-400 shrink-0">·</span>
                {s}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-emerald-500 dark:text-emerald-600">Keep practicing — strengths will emerge!</p>
        )}
      </div>

      {/* Gaps */}
      <div className="rounded-xl border border-amber-100 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.75 1.5-.217 3.374-1.948 3.374H4.645C2.914 19.5 1.897 17.626 2.648 16.126L11.027 4.5c.75-1.5 2.77-1.5 3.518 0l8.38 11.626ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Areas to improve
          </h3>
        </div>
        {gaps.length > 0 ? (
          <ul className="space-y-2">
            {gaps.map((g, i) => (
              <li key={i} className="text-sm text-amber-700 dark:text-amber-400 leading-snug flex gap-2">
                <span aria-hidden="true" className="text-amber-400 shrink-0">·</span>
                {g}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-amber-500 dark:text-amber-600">No significant gaps — great job!</p>
        )}
      </div>
    </div>
  );
}
