import {
  StateGraph,
  Annotation,
  interrupt,
  START,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { AgentState, LessonPlan } from "@/lib/agent/schemas";
import { ingestNode } from "@/lib/agent/nodes/ingest";
import { planLessonNode } from "@/lib/agent/nodes/plan";

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
});

type GraphState = typeof GraphAnnotation.State;

async function ingest(state: GraphState): Promise<Partial<GraphState>> {
  return ingestNode(state as AgentState);
}

async function planLesson(state: GraphState): Promise<Partial<GraphState>> {
  return planLessonNode(state as AgentState);
}

/** HITL node — pauses via interrupt() and waits for human approval. */
async function waitForApproval(state: GraphState): Promise<Partial<GraphState>> {
  const response = interrupt({
    type: "lesson_plan_approval",
    lessonPlan: state.lessonPlan,
  }) as { status: "approved" | "regenerate"; editedPlan?: LessonPlan };

  return {
    approvalStatus: response.status,
    editedPlan: response.editedPlan,
  };
}

function routeAfterApproval(state: GraphState): "planLesson" | typeof END {
  return state.approvalStatus === "regenerate" ? "planLesson" : END;
}

/** Module-level checkpointer so the compiled graph can persist interrupt() state. */
const checkpointer = new MemorySaver();

export function buildLessonGraph() {
  const graph = new StateGraph(GraphAnnotation)
    .addNode("ingest", ingest)
    .addNode("planLesson", planLesson)
    .addNode("waitForApproval", waitForApproval)
    .addEdge(START, "ingest")
    .addEdge("ingest", "planLesson")
    .addEdge("planLesson", "waitForApproval")
    .addConditionalEdges("waitForApproval", routeAfterApproval, {
      planLesson: "planLesson",
      [END]: END,
    });

  return graph.compile({ checkpointer });
}
