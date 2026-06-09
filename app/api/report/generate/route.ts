import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { summarizeNode } from "@/lib/agent/nodes/summarize";
import { createServerClient } from "@/lib/supabase/server";
import { LessonPlanSchema } from "@/lib/agent/schemas";

const BodySchema = z.object({
  lessonId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lessonId, userId } = BodySchema.parse(body);

    // Fetch lesson plan to get objectives
    const supabase = createServerClient();
    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("lesson_plan, title")
      .eq("id", lessonId)
      .single();

    if (error || !lesson?.lesson_plan) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const lessonPlan = LessonPlanSchema.parse(lesson.lesson_plan);

    const result = await summarizeNode({
      lessonId,
      userId,
      lessonTitle: lessonPlan.title,
      objectives: lessonPlan.objectives,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
