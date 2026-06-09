import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

// TODO(auth): replace userId query param with server-session userId in production.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;

  const rawUserId = req.nextUrl.searchParams.get("userId");
  if (rawUserId !== null) {
    const parsed = z.string().uuid().safeParse(rawUserId);
    if (!parsed.success) {
      return NextResponse.json({ error: "userId must be a valid UUID" }, { status: 400 });
    }
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("lesson_id", lessonId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // When a userId is supplied by the caller, verify ownership.
  if (rawUserId && data.user_id !== rawUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
