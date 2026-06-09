import { z } from "zod";
import { createGroqClient } from "@/lib/groq/client";
import { createServerClient } from "@/lib/supabase/server";
import { retrieveChunks } from "@/lib/rag/retrieve";
import {
  LLMReportOutputSchema,
  AgentState,
  type LLMReportOutput,
  type MasteryByObjective,
  type StudyTip,
  type Objective,
} from "@/lib/agent/schemas";
import { aggregateAttempts } from "@/lib/scoring/aggregate";

const LLM_REPORT_JSON_SCHEMA = z.toJSONSchema(LLMReportOutputSchema);

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

interface SummarizeInput {
  lessonId: string;
  userId: string;
  lessonTitle: string;
  objectives: Objective[];
}

interface SummarizeResult {
  reportId: string;
  overallScore: number;
  masteryByObjective: MasteryByObjective[];
  strengths: string[];
  gaps: string[];
  studyTips: StudyTip[];
}

export async function summarizeNode(input: SummarizeInput): Promise<SummarizeResult | { error: string }> {
  const { lessonId, userId, objectives } = input;
  const supabase = createServerClient();

  // 1. Fetch all attempts for this lesson
  const { data: attemptsData, error: attemptsError } = await supabase
    .from("attempts")
    .select("objective_id, correct, attempt_number")
    .eq("lesson_id", lessonId)
    .eq("user_id", userId);

  if (attemptsError) {
    return { error: attemptsError.message };
  }

  const rawAttempts = (attemptsData ?? []).map((r) => ({
    objectiveId: r.objective_id as string,
    correct: r.correct as boolean,
    attemptNumber: r.attempt_number as number,
  }));

  // 2. Aggregate attempts → mastery metrics
  const { masteryByObjective, overallScore } = aggregateAttempts(rawAttempts, objectives);

  // 3. Generate study tips via Groq (grounded in weak objectives + RAG chunks)
  const weakObjectives = masteryByObjective.filter((m) => m.masteryPercent < 80);
  let llmOutput: LLMReportOutput | null = null;

  try {
    const ragChunks = weakObjectives.length > 0
      ? await retrieveChunks(
          lessonId,
          weakObjectives.map((m) => m.objectiveTitle).join(" "),
          6
        )
      : [];

    const contextText = ragChunks.length > 0
      ? ragChunks.map((c, i) => `[Source ${i + 1}]:\n${c.content}`).join("\n\n")
      : "No additional source content available.";

    const weakSummary = weakObjectives.length > 0
      ? weakObjectives
          .map((m) => `- "${m.objectiveTitle}" (score: ${m.masteryPercent}%, ${m.totalAttempts} attempt${m.totalAttempts !== 1 ? "s" : ""})`)
          .join("\n")
      : "None — excellent work!";

    const strongSummary = masteryByObjective
      .filter((m) => m.masteryPercent >= 80)
      .map((m) => `- "${m.objectiveTitle}" (score: ${m.masteryPercent}%)`)
      .join("\n") || "None yet.";

    const llm = createGroqClient();

    const systemPrompt = `You are an expert learning coach generating a personalized progress report.
Based on the student's performance data and source material, write:
1. strengths: 1-3 specific things the student did well (reference objectives by name)
2. gaps: 1-3 specific knowledge gaps (reference objectives by name; empty array if none)
3. studyTips: 2-5 actionable, specific tips grounded in the source material to address gaps

Rules:
- Tips must cite specific concepts from the source content, not generic advice
- Each tip should directly address one of the identified gaps
- Be encouraging but honest
- Return ONLY valid JSON matching the schema`;

    const userPrompt = `Lesson: "${input.lessonTitle}"
Overall score: ${overallScore}%

Strong areas:
${strongSummary}

Areas needing work:
${weakSummary}

Relevant source material:
${contextText}

JSON Schema:
${JSON.stringify(LLM_REPORT_JSON_SCHEMA, null, 2)}`;

    const response = await llm.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const raw = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    llmOutput = LLMReportOutputSchema.parse(JSON.parse(extractJSON(raw)));
  } catch {
    // Degrade gracefully — computed scores are still accurate even if tips fail.
    llmOutput = {
      strengths: masteryByObjective
        .filter((m) => m.masteryPercent >= 80)
        .slice(0, 3)
        .map((m) => `Mastered "${m.objectiveTitle}"`),
      gaps: weakObjectives.slice(0, 3).map((m) => `Needs work on "${m.objectiveTitle}"`),
      studyTips: weakObjectives.slice(0, 3).map((m) => ({
        tip: `Review the material for "${m.objectiveTitle}" and practice related questions.`,
        objectiveId: m.objectiveId,
      })),
    };
  }

  const { strengths, gaps, studyTips } = llmOutput;

  // 4. Persist report + mark lesson completed
  const { data: reportData, error: reportError } = await supabase
    .from("reports")
    .upsert(
      {
        lesson_id: lessonId,
        user_id: userId,
        overall_score: overallScore,
        mastery_by_objective: masteryByObjective,
        strengths,
        gaps,
        study_tips: studyTips,
      },
      { onConflict: "lesson_id" }
    )
    .select("id")
    .single();

  if (reportError || !reportData) {
    return { error: reportError?.message ?? "Failed to persist report" };
  }

  await supabase
    .from("lessons")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", lessonId);

  return {
    reportId: reportData.id as string,
    overallScore,
    masteryByObjective,
    strengths,
    gaps,
    studyTips,
  };
}

/** LangGraph node wrapper */
export async function summarizeLangGraphNode(state: AgentState): Promise<Partial<AgentState>> {
  const { lessonId, userId, lessonPlan } = state;
  if (!lessonId || !userId || !lessonPlan) return {};

  await summarizeNode({
    lessonId,
    userId,
    lessonTitle: lessonPlan.title,
    objectives: lessonPlan.objectives,
  });

  return {};
}
