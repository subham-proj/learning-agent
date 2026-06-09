import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateHint } from "@/lib/agent/nodes/hint";

const RequestSchema = z.object({
  lessonId: z.string().uuid(),
  objectiveTitle: z.string().min(1),
  objectiveDescription: z.string().min(1),
  question: z.string().min(1),
  mode: z.enum(["hint", "learn_more"]),
  userQuery: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = RequestSchema.parse(body);

    const response = await generateHint(input);
    return NextResponse.json({ response });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
