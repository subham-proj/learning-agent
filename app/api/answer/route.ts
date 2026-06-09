import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AnswerSubmissionSchema } from "@/lib/agent/schemas";
import { evaluateAnswer } from "@/lib/agent/nodes/evaluateAnswer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mcqId, selectedChoiceId, lessonId, userId } =
      AnswerSubmissionSchema.parse(body);

    const result = await evaluateAnswer({ mcqId, selectedChoiceId, lessonId, userId });

    return NextResponse.json({
      correct: result.correct,
      ...(result.correct
        ? { explanation: result.explanation }
        : { hint: result.hint }),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
