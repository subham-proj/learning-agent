import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("lesson_id", lessonId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    lessonId: data.lesson_id,
    userId: data.user_id,
    overallScore: Number(data.overall_score),
    masteryByObjective: data.mastery_by_objective,
    strengths: data.strengths,
    gaps: data.gaps,
    studyTips: data.study_tips,
    createdAt: data.created_at,
  });
}
