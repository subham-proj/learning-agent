import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateMcqNode } from "@/lib/agent/nodes/generateMcq";

const RequestSchema = z.object({
  lessonId: z.string().uuid(),
  objectiveId: z.string().min(1),
  objectiveTitle: z.string().min(1),
  objectiveDescription: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = RequestSchema.parse(body);

    const result = await generateMcqNode(input);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Return only the client-safe MCQ (no correctChoiceId).
    return NextResponse.json({ mcq: result.clientMCQ });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
