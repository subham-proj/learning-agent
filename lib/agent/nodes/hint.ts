import { createGroqClient } from "@/lib/groq/client";
import { retrieveChunks } from "@/lib/rag/retrieve";

export interface HintInput {
  lessonId: string;
  objectiveTitle: string;
  objectiveDescription: string;
  question: string;
  /** "hint" for a targeted clue; "learn_more" for a deeper explanation. */
  mode: "hint" | "learn_more";
  /** User's free-form follow-up question, if any. */
  userQuery?: string;
}

const GUARDRAIL =
  "\n\nGive it another try — pick the option you think fits best.";

/**
 * Returns a guardrail-safe hint or explanation for the current objective.
 * Never states, paraphrases, or strongly implies the correct MCQ choice.
 */
export async function generateHint(input: HintInput): Promise<string> {
  const { lessonId, objectiveTitle, objectiveDescription, question, mode, userQuery } =
    input;

  const chunks = await retrieveChunks(
    lessonId,
    `${objectiveTitle} ${objectiveDescription} ${userQuery ?? ""}`,
    4
  );

  const contextText =
    chunks.length > 0
      ? chunks.map((c, i) => `[Chunk ${i + 1}]:\n${c.content}`).join("\n\n")
      : "No source chunks available.";

  const systemPrompt =
    mode === "hint"
      ? `You are a supportive tutor. The student is working on a multiple-choice question.
Give a concise hint that helps them think through the problem WITHOUT revealing, paraphrasing, or implying the correct answer.
Focus on the relevant concept from the source material. 2-3 sentences max.`
      : `You are an expert educator. The student wants to understand the topic more deeply.
Explain the concept from the objective using the provided source material.
Do NOT mention which MCQ choice is correct or even hint at it. Stay conceptual. 4-6 sentences.`;

  const userContent = `Objective: ${objectiveTitle}
Description: ${objectiveDescription}

Question the student is answering: ${question}

${userQuery ? `Student's follow-up: ${userQuery}\n\n` : ""}Source content:
${contextText}`;

  const llm = createGroqClient();
  const response = await llm.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]);

  const text =
    typeof response.content === "string"
      ? response.content.trim()
      : JSON.stringify(response.content);

  return text + GUARDRAIL;
}
