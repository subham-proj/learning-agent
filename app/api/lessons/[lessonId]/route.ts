import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { LessonPlanSchema } from "@/lib/agent/schemas";

// TODO(auth): replace userId query param with server-session userId in production.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;

  const rawUserId = req.nextUrl.searchParams.get("userId");
  const parsed = z.string().uuid().safeParse(rawUserId);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId must be a valid UUID" }, { status: 400 });
  }
  const userId = parsed.data;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("id, title, lesson_plan, file_url, status, user_id")
    .eq("id", lessonId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (data.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!data.lesson_plan) {
    return NextResponse.json({ error: "Lesson plan not found" }, { status: 404 });
  }

  const lessonPlan = LessonPlanSchema.parse(data.lesson_plan);

  return NextResponse.json({
    lessonId: data.id,
    title: data.title ?? "Untitled Lesson",
    status: data.status,
    lessonPlan,
    fileUrl: data.file_url ?? "",
  });
}
