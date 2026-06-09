import { z } from "zod";
import { createGroqClient } from "@/lib/groq/client";
import { MCQSchema, AgentState, type MCQ } from "@/lib/agent/schemas";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { createServerClient } from "@/lib/supabase/server";

/** LLM-facing MCQ schema — uses simple A/B/C/D IDs the model handles reliably. */
const LLMMCQSchema = MCQSchema.omit({ id: true, sourceChunkIds: true }).extend({
  choices: z.array(
    z.object({ id: z.enum(["A", "B", "C", "D"]), text: z.string() })
  ).length(4),
  correctChoiceId: z.enum(["A", "B", "C", "D"]),
});

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

export interface GenerateMcqInput {
  lessonId: string;
  objectiveId: string;
  objectiveTitle: string;
  objectiveDescription: string;
}

export async function generateMcqNode(
  input: GenerateMcqInput
): Promise<{ mcq: MCQ; clientMCQ: Omit<MCQ, "correctChoiceId"> } | { error: string }> {
  const { lessonId, objectiveId, objectiveTitle, objectiveDescription } = input;

  const chunks = await retrieveChunks(
    lessonId,
    `${objectiveTitle} ${objectiveDescription}`,
    5
  );

  const contextText =
    chunks.length > 0
      ? chunks.map((c, i) => `[Chunk ${i + 1}]:\n${c.content}`).join("\n\n")
      : "No source chunks available.";

  const sourceChunkIds = chunks.map((c) => c.id);

  const llm = createGroqClient();
  const schema = z.toJSONSchema(LLMMCQSchema);

  const systemPrompt = `You are an expert MCQ designer for educational content.
Generate one multiple-choice question (MCQ) grounded in the provided source text.

Rules:
- Exactly 4 choices with ids "A", "B", "C", "D"
- correctChoiceId must be one of "A","B","C","D" and must be correct
- hint must NOT state, paraphrase, or imply the correct answer — guide thinking only
- explanation should teach, citing the source
- Return ONLY valid JSON matching the schema — no markdown fences, no extra text`;

  const userPrompt = `Objective: ${objectiveTitle}
Description: ${objectiveDescription}

Source content:
${contextText}

JSON Schema:
${JSON.stringify(schema, null, 2)}`;

  let lastError = "MCQ generation failed after retries";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await llm.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      const raw =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      // LLMMCQSchema.parse() throws ZodError if the JSON is malformed or
      // correctChoiceId/choice ids are not in ["A","B","C","D"] — caught below.
      const parsed = JSON.parse(extractJSON(raw));
      const llmMcq = LLMMCQSchema.parse(parsed);

      // Persist to DB so /api/answer can look up correctChoiceId server-side.
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from("mcqs")
        .insert({
          lesson_id: lessonId,
          objective_id: objectiveId,
          question: llmMcq.question,
          choices: llmMcq.choices,
          correct_choice_id: llmMcq.correctChoiceId,
          explanation: llmMcq.explanation,
          hint: llmMcq.hint,
          source_chunk_ids: sourceChunkIds,
        })
        .select("id")
        .single();

      if (error || !data) {
        lastError = error?.message ?? "DB insert failed";
        continue;
      }

      const mcq: MCQ = {
        id: data.id as string,
        objectiveId,
        question: llmMcq.question,
        choices: llmMcq.choices,
        correctChoiceId: llmMcq.correctChoiceId,
        explanation: llmMcq.explanation,
        hint: llmMcq.hint,
        sourceChunkIds,
      };

      const { correctChoiceId: _, ...clientMCQ } = mcq;
      void _;

      return { mcq, clientMCQ };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error";
    }
  }

  return { error: lastError };
}

/** LangGraph node wrapper */
export async function generateMcqLangGraphNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const { lessonId, lessonPlan, currentObjectiveIndex = 0 } = state;
  if (!lessonId || !lessonPlan) return { error: "Missing lessonId or lessonPlan" };

  const objective = lessonPlan.objectives[currentObjectiveIndex];
  if (!objective) return { error: "No objective at index " + currentObjectiveIndex };

  const result = await generateMcqNode({
    lessonId,
    objectiveId: objective.id,
    objectiveTitle: objective.title,
    objectiveDescription: objective.description,
  });

  if ("error" in result) return { error: result.error, quizPhase: "generating" };

  return { currentMCQ: result.mcq, quizPhase: "awaiting_answer" };
}
