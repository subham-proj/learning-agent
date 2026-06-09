import { createServerClient } from "@/lib/supabase/server";
import { AgentState, AnswerResult } from "@/lib/agent/schemas";

export interface EvaluateAnswerInput {
  mcqId: string;
  selectedChoiceId: string;
  lessonId: string;
  userId: string;
}

export async function evaluateAnswer(
  input: EvaluateAnswerInput
): Promise<AnswerResult & { attemptNumber: number }> {
  const { mcqId, selectedChoiceId, lessonId, userId } = input;
  const supabase = createServerClient();

  // Look up the stored MCQ.
  const { data: mcq, error: mcqErr } = await supabase
    .from("mcqs")
    .select("correct_choice_id, explanation, hint, objective_id")
    .eq("id", mcqId)
    .single();

  if (mcqErr || !mcq) {
    throw new Error(mcqErr?.message ?? "MCQ not found");
  }

  const correct = mcq.correct_choice_id === selectedChoiceId;

  // Count prior attempts for this MCQ + user.
  const { count } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("mcq_id", mcqId)
    .eq("user_id", userId);

  const attemptNumber = (count ?? 0) + 1;

  // Persist attempt.
  await supabase.from("attempts").insert({
    mcq_id: mcqId,
    lesson_id: lessonId,
    objective_id: mcq.objective_id,
    user_id: userId,
    selected_choice_id: selectedChoiceId,
    correct,
    attempt_number: attemptNumber,
  });

  if (correct) {
    return { correct, explanation: mcq.explanation as string, attemptNumber };
  }

  return { correct, hint: mcq.hint as string, attemptNumber };
}

/** LangGraph node wrapper */
export async function evaluateAnswerLangGraphNode(
  state: AgentState & { selectedChoiceId?: string; userId?: string }
): Promise<Partial<AgentState>> {
  const { currentMCQ, lessonId, selectedChoiceId, userId = "00000000-0000-4000-8000-000000000001" } =
    state;

  if (!currentMCQ || !lessonId || !selectedChoiceId) {
    return { error: "Missing mcq, lessonId, or selectedChoiceId" };
  }

  const result = await evaluateAnswer({
    mcqId: currentMCQ.id,
    selectedChoiceId,
    lessonId,
    userId,
  });

  const objectives = state.lessonPlan?.objectives ?? [];
  const currentIndex = state.currentObjectiveIndex ?? 0;
  const statuses = state.objectiveStatuses ?? objectives.map(() => "pending" as const);

  if (result.correct) {
    const nextStatuses = [...statuses] as ("pending" | "completed")[];
    nextStatuses[currentIndex] = "completed";
    const allDone = nextStatuses.every((s) => s === "completed");

    return {
      lastAnswerCorrect: true,
      objectiveStatuses: nextStatuses,
      currentObjectiveIndex: allDone ? currentIndex : currentIndex + 1,
      quizPhase: allDone ? "completed" : "generating",
    };
  }

  return { lastAnswerCorrect: false, quizPhase: "awaiting_answer" };
}
