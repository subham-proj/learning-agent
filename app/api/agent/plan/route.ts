import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LessonPlanSchema } from "@/lib/agent/schemas";
import { planLessonNode } from "@/lib/agent/nodes/plan";
import { createServerClient } from "@/lib/supabase/server";
import { friendlyGroqError, isRateLimitError } from "@/lib/groq/errors";

const RequestSchema = z.object({
  lessonId: z.string().uuid(),
  rawText: z.string().min(1),
  editedPlan: LessonPlanSchema.optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lessonId, rawText, editedPlan } = RequestSchema.parse(body);

    const result = await planLessonNode({ lessonId, rawText, editedPlan });

    if (result.error || !result.lessonPlan) {
      return NextResponse.json(
        { error: result.error ?? "No plan generated" },
        { status: 500 }
      );
    }

    const plan = result.lessonPlan;

    // Persist plan and update lesson status
    const supabase = createServerClient();
    const { error: dbErr } = await supabase
      .from("lessons")
      .update({ lesson_plan: plan, title: plan.title, status: "planned" })
      .eq("id", lessonId);

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ lessonPlan: plan });
  } catch (err) {
    const status = isRateLimitError(err) ? 429 : 500;
    return NextResponse.json({ error: friendlyGroqError(err) }, { status });
  }
}
