import { createGroqClient } from "@/lib/groq/client";
import { LessonPlanSchema, AgentState } from "@/lib/agent/schemas";
import { friendlyGroqError } from "@/lib/groq/errors";
import { z } from "zod";

const SYSTEM_PROMPT = `You are an expert instructional designer.
Given raw text extracted from a PDF, produce a structured lesson plan.
You MUST include between 5 and 10 learning objectives — never fewer than 5.
Return ONLY valid JSON matching the schema — no markdown fences, no explanation.`;

/** Strip ```json … ``` fences the model sometimes adds despite instructions. */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

/**
 * plan_lesson node: sends rawText to Groq and returns a Zod-validated LessonPlan.
 * If the user sent back an editedPlan via HITL, that is used directly.
 */
export async function planLessonNode(state: AgentState): Promise<Partial<AgentState>> {
  const { rawText, editedPlan } = state;

  if (!rawText) return { error: "No rawText to plan from" };

  if (editedPlan) {
    return { lessonPlan: editedPlan, editedPlan: undefined };
  }

  const llm = createGroqClient();
  const schema = z.toJSONSchema(LessonPlanSchema);

  let response;
  try {
    response = await llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `JSON Schema:\n${JSON.stringify(schema, null, 2)}\n\nPDF Text (first 8000 chars):\n${rawText.slice(0, 8000)}`,
      },
    ]);
  } catch (err) {
    return { error: friendlyGroqError(err) };
  }

  const raw =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  try {
    const parsed = JSON.parse(extractJSON(raw));
    const plan = LessonPlanSchema.parse(parsed);
    return { lessonPlan: plan };
  } catch {
    return { error: "LLM returned an invalid or unparseable lesson plan" };
  }
}
