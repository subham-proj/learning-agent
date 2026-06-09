import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { ScoreRing } from "@/components/report/ScoreRing";
import { ObjectiveBreakdown } from "@/components/report/ObjectiveBreakdown";
import { StudyTipCard } from "@/components/report/StudyTipCard";
import { StrengthsGaps } from "@/components/report/StrengthsGaps";
import { type Report } from "@/lib/agent/schemas";

interface PageProps {
  params: Promise<{ lessonId: string }>;
}

async function getReport(lessonId: string): Promise<Report | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("lesson_id", lessonId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id as string,
    lessonId: data.lesson_id as string,
    userId: data.user_id as string,
    overallScore: Number(data.overall_score),
    masteryByObjective: data.mastery_by_objective as Report["masteryByObjective"],
    strengths: data.strengths as string[],
    gaps: data.gaps as string[],
    studyTips: data.study_tips as Report["studyTips"],
    createdAt: data.created_at as string,
  };
}

async function getLessonTitle(lessonId: string): Promise<string> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("lessons")
    .select("title")
    .eq("id", lessonId)
    .single();
  return (data?.title as string) ?? "Lesson Report";
}

export default async function ReportPage({ params }: PageProps) {
  const { lessonId } = await params;
  const [report, title] = await Promise.all([getReport(lessonId), getLessonTitle(lessonId)]);

  if (!report) notFound();

  const gapObjectiveIds = new Set(
    report.masteryByObjective
      .filter((m) => m.masteryPercent < 80)
      .map((m) => m.objectiveId)
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50/30 dark:from-zinc-950 dark:to-violet-950/10 px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to learning
        </Link>

        {/* Header */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">Lesson Report</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
            {title}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Completed {new Date(report.createdAt).toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric"
            })}
          </p>
        </div>

        {/* Score ring */}
        <section
          aria-label="Overall score"
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 flex flex-col items-center shadow-sm"
        >
          <ScoreRing score={report.overallScore} />
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-xs">
            {report.overallScore >= 80
              ? "Excellent work! You have a strong grasp of this material."
              : report.overallScore >= 60
              ? "Good effort — review the study tips below to strengthen your understanding."
              : "Keep going — use the study tips below to focus your review."}
          </p>
        </section>

        {/* Objective breakdown */}
        <section aria-label="Objective breakdown" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Objective Breakdown
          </h2>
          <ObjectiveBreakdown masteryByObjective={report.masteryByObjective} />
        </section>

        {/* Strengths & gaps */}
        <section aria-label="Strengths and areas to improve">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
            Strengths &amp; Areas to Improve
          </h2>
          <StrengthsGaps strengths={report.strengths} gaps={report.gaps} />
        </section>

        {/* Study tips */}
        {report.studyTips.length > 0 && (
          <section aria-label="Study tips" className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Personalized Study Tips
            </h2>
            <div className="space-y-3">
              {report.studyTips.map((tip, i) => (
                <StudyTipCard key={i} tip={tip} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          {gapObjectiveIds.size > 0 && (
            <Link
              href={`/dashboard?retry=gaps&lessonId=${lessonId}`}
              className="flex-1 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white text-center shadow-sm hover:bg-violet-700 active:scale-95 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
            >
              Retry weak objectives
            </Link>
          )}
          <Link
            href="/dashboard"
            className="flex-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 text-center hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
          >
            Start a new lesson
          </Link>
        </div>
      </div>
    </main>
  );
}
