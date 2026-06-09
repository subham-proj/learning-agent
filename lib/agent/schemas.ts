import { z } from "zod";

export const DifficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

export const ObjectiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  difficulty: DifficultySchema,
});

export const LessonPlanSchema = z.object({
  title: z.string(),
  objectives: z.array(ObjectiveSchema).min(1).max(10),
  overallDifficulty: DifficultySchema,
  estimatedMinutes: z.number().int().positive(),
});

export const ChunkSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  content: z.string(),
  tokenCount: z.number().int(),
  chunkIndex: z.number().int(),
});

export const IngestResultSchema = z.object({
  lessonId: z.string(),
  fileUrl: z.string(),
  rawText: z.string(),
  chunkCount: z.number().int(),
});

// ─── Phase 2: MCQ ────────────────────────────────────────────────────────────

export const ChoiceSchema = z.object({
  id: z.string(),
  text: z.string(),
});

/** Full MCQ — server-side only. Never send correctChoiceId to the client. */
export const MCQSchema = z.object({
  id: z.string(),
  objectiveId: z.string(),
  question: z.string(),
  choices: z.array(ChoiceSchema).min(2).max(6),
  correctChoiceId: z.string(),
  explanation: z.string(),
  hint: z.string(),
  sourceChunkIds: z.array(z.string()),
});

/** Client-safe MCQ — omits correctChoiceId. */
export const MCQClientSchema = MCQSchema.omit({ correctChoiceId: true });

export const AttemptSchema = z.object({
  id: z.string(),
  mcqId: z.string(),
  lessonId: z.string(),
  objectiveId: z.string(),
  userId: z.string(),
  selectedChoiceId: z.string(),
  correct: z.boolean(),
  attemptNumber: z.number().int(),
  createdAt: z.string(),
});

export const AnswerSubmissionSchema = z.object({
  mcqId: z.string().uuid(),
  selectedChoiceId: z.string().min(1).max(10),
  lessonId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const AnswerResultSchema = z.object({
  correct: z.boolean(),
  explanation: z.string().optional(),
  hint: z.string().optional(),
});

// ─── Phase 2: LangGraph state extensions ─────────────────────────────────────

/** LangGraph state — all fields optional so nodes can merge partial updates */
export const AgentStateSchema = z.object({
  lessonId: z.string().optional(),
  fileUrl: z.string().optional(),
  rawText: z.string().optional(),
  chunkCount: z.number().optional(),
  lessonPlan: LessonPlanSchema.optional(),
  /** "approved" | "regenerate" | null (null = awaiting HITL) */
  approvalStatus: z.enum(["approved", "regenerate"]).nullable().optional(),
  /** Edited plan sent back from the HITL card */
  editedPlan: LessonPlanSchema.optional(),
  error: z.string().optional(),
  // Phase 2 quiz fields
  currentObjectiveIndex: z.number().int().optional(),
  /** Full MCQ with correctChoiceId — never forwarded to client. */
  currentMCQ: MCQSchema.optional(),
  objectiveStatuses: z.array(z.enum(["pending", "completed"])).optional(),
  quizPhase: z
    .enum(["generating", "awaiting_answer", "evaluating", "completed"])
    .optional(),
  lastAnswerCorrect: z.boolean().optional(),
  // Carries user's selected choice through the interrupt resume cycle.
  selectedChoiceId: z.string().optional(),
  // Injected at graph invocation time; replaced by real auth in Phase 3.
  userId: z.string().uuid().optional(),
});

export type Difficulty = z.infer<typeof DifficultySchema>;
export type Objective = z.infer<typeof ObjectiveSchema>;
export type LessonPlan = z.infer<typeof LessonPlanSchema>;
export type Chunk = z.infer<typeof ChunkSchema>;
export type IngestResult = z.infer<typeof IngestResultSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
export type MCQ = z.infer<typeof MCQSchema>;
export type MCQClient = z.infer<typeof MCQClientSchema>;
export type Attempt = z.infer<typeof AttemptSchema>;
export type AnswerSubmission = z.infer<typeof AnswerSubmissionSchema>;
export type AnswerResult = z.infer<typeof AnswerResultSchema>;

// ─── Phase 3: Report ─────────────────────────────────────────────────────────

export const MasteryByObjectiveSchema = z.object({
  objectiveId: z.string(),
  objectiveTitle: z.string(),
  totalAttempts: z.number().int().nonnegative(),
  correctAttempts: z.number().int().nonnegative(),
  masteryPercent: z.number().min(0).max(100),
  firstTryCorrect: z.boolean(),
});

export const StudyTipSchema = z.object({
  tip: z.string(),
  objectiveId: z.string().optional(),
  sourceChunk: z.string().optional(),
});

export const ReportSchema = z.object({
  id: z.string().uuid(),
  lessonId: z.string().uuid(),
  userId: z.string().uuid(),
  overallScore: z.number().min(0).max(100),
  masteryByObjective: z.array(MasteryByObjectiveSchema),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  studyTips: z.array(StudyTipSchema),
  createdAt: z.string(),
});

/** LLM output schema — without DB-generated fields */
export const LLMReportOutputSchema = z.object({
  strengths: z.array(z.string()).min(1).max(5),
  gaps: z.array(z.string()).min(0).max(5),
  studyTips: z.array(StudyTipSchema).min(1).max(6),
});

export type MasteryByObjective = z.infer<typeof MasteryByObjectiveSchema>;
export type StudyTip = z.infer<typeof StudyTipSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type LLMReportOutput = z.infer<typeof LLMReportOutputSchema>;
