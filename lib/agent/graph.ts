import {
  StateGraph,
  Annotation,
  interrupt,
  START,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { AgentState, LessonPlan, MCQ } from "@/lib/agent/schemas";
import { ingestNode } from "@/lib/agent/nodes/ingest";
import { planLessonNode } from "@/lib/agent/nodes/plan";
import { generateMcqLangGraphNode } from "@/lib/agent/nodes/generateMcq";
import { evaluateAnswerLangGraphNode } from "@/lib/agent/nodes/evaluateAnswer";
import { summarizeLangGraphNode } from "@/lib/agent/nodes/summarize";

const GraphAnnotation = Annotation.Root({
  lessonId: Annotation<string | undefined>({ reducer: (_, b) => b }),
  fileUrl: Annotation<string | undefined>({ reducer: (_, b) => b }),
  rawText: Annotation<string | undefined>({ reducer: (_, b) => b }),
  chunkCount: Annotation<number | undefined>({ reducer: (_, b) => b }),
  lessonPlan: Annotation<LessonPlan | undefined>({ reducer: (_, b) => b }),
  approvalStatus: Annotation<"approved" | "regenerate" | null | undefined>({
    reducer: (_, b) => b,
  }),
  editedPlan: Annotation<LessonPlan | undefined>({ reducer: (_, b) => b }),
  error: Annotation<string | undefined>({ reducer: (_, b) => b }),
  // Phase 2 quiz fields
  currentObjectiveIndex: Annotation<number | undefined>({ reducer: (_, b) => b }),
  currentMCQ: Annotation<MCQ | undefined>({ reducer: (_, b) => b }),
  objectiveStatuses: Annotation<("pending" | "completed")[] | undefined>({
    reducer: (_, b) => b,
  }),
  quizPhase: Annotation<
    "generating" | "awaiting_answer" | "evaluating" | "completed" | undefined
  >({ reducer: (_, b) => b }),
  lastAnswerCorrect: Annotation<boolean | undefined>({ reducer: (_, b) => b }),
  // Carries the user's selected choice from waitForAnswer → evaluateAnswer.
  selectedChoiceId: Annotation<string | undefined>({ reducer: (_, b) => b }),
  // Injected at invocation time; replaced by real auth session in Phase 3.
  userId: Annotation<string | undefined>({ reducer: (_, b) => b }),
});

type GraphState = typeof GraphAnnotation.State;

// ─── Phase 1 nodes ───────────────────────────────────────────────────────────

async function ingest(state: GraphState): Promise<Partial<GraphState>> {
  return ingestNode(state as AgentState);
}

async function planLesson(state: GraphState): Promise<Partial<GraphState>> {
  return planLessonNode(state as AgentState);
}

async function waitForApproval(state: GraphState): Promise<Partial<GraphState>> {
  const response = interrupt({
    type: "lesson_plan_approval",
    lessonPlan: state.lessonPlan,
  }) as { status: "approved" | "regenerate"; editedPlan?: LessonPlan };

  const objectives = state.lessonPlan?.objectives ?? [];
  const baseState: Partial<GraphState> = {
    approvalStatus: response.status,
    editedPlan: response.editedPlan,
  };

  if (response.status === "approved") {
    return {
      ...baseState,
      currentObjectiveIndex: 0,
      objectiveStatuses: objectives.map(() => "pending" as const),
      quizPhase: "generating",
    };
  }

  return baseState;
}

function routeAfterApproval(
  state: GraphState
): "planLesson" | "generateMcq" {
  return state.approvalStatus === "regenerate" ? "planLesson" : "generateMcq";
}

// ─── Phase 2 nodes ───────────────────────────────────────────────────────────

async function generateMcq(state: GraphState): Promise<Partial<GraphState>> {
  return generateMcqLangGraphNode(state as AgentState);
}

/**
 * HITL interrupt: waits for the user to submit an answer.
 * Resume payload: { selectedChoiceId: string }
 */
async function waitForAnswer(state: GraphState): Promise<Partial<GraphState>> {
  const response = interrupt({
    type: "mcq_answer",
    mcqId: state.currentMCQ?.id,
    question: state.currentMCQ?.question,
    choices: state.currentMCQ?.choices,
  }) as { selectedChoiceId: string };

  return { quizPhase: "evaluating", selectedChoiceId: response.selectedChoiceId };
}

async function evaluateAnswer(state: GraphState): Promise<Partial<GraphState>> {
  return evaluateAnswerLangGraphNode(state as AgentState);
}

function routeAfterEvaluation(
  state: GraphState
): "generateMcq" | "waitForAnswer" | "summarize" | typeof END {
  if (state.quizPhase === "completed") return "summarize";
  if (state.lastAnswerCorrect) return "generateMcq";
  return "waitForAnswer";
}

async function summarize(state: GraphState): Promise<Partial<GraphState>> {
  return summarizeLangGraphNode(state as AgentState);
}

// ─── Graph assembly ───────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

export function buildLessonGraph() {
  const graph = new StateGraph(GraphAnnotation)
    // Phase 1
    .addNode("ingest", ingest)
    .addNode("planLesson", planLesson)
    .addNode("waitForApproval", waitForApproval)
    // Phase 2
    .addNode("generateMcq", generateMcq)
    .addNode("waitForAnswer", waitForAnswer)
    .addNode("evaluateAnswer", evaluateAnswer)
    .addNode("summarize", summarize)
    // Edges — Phase 1
    .addEdge(START, "ingest")
    .addEdge("ingest", "planLesson")
    .addEdge("planLesson", "waitForApproval")
    .addConditionalEdges("waitForApproval", routeAfterApproval, {
      planLesson: "planLesson",
      generateMcq: "generateMcq",
    })
    // Edges — Phase 2 loop
    .addEdge("generateMcq", "waitForAnswer")
    .addEdge("waitForAnswer", "evaluateAnswer")
    .addConditionalEdges("evaluateAnswer", routeAfterEvaluation, {
      generateMcq: "generateMcq",
      waitForAnswer: "waitForAnswer",
      summarize: "summarize",
      [END]: END,
    })
    .addEdge("summarize", END);

  return graph.compile({ checkpointer });
}
