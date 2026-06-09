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
});

export type Difficulty = z.infer<typeof DifficultySchema>;
export type Objective = z.infer<typeof ObjectiveSchema>;
export type LessonPlan = z.infer<typeof LessonPlanSchema>;
export type Chunk = z.infer<typeof ChunkSchema>;
export type IngestResult = z.infer<typeof IngestResultSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
