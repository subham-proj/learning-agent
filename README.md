# AI Learning Agent — Phase 1

Turns a PDF into an interactive, AI-drafted lesson plan with human-in-the-loop approval.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key (llama-3.3-70b-versatile) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |

### 3. Set up Supabase

Run the migration in your Supabase SQL editor or via CLI:

```bash
supabase db push
# or manually run:
supabase/migrations/0001_init.sql
```

Create a **Storage bucket** named `pdfs` (public or private — update RLS as needed).

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture — Phase 1

```
PDF upload → /api/ingest → Supabase Storage + chunks table
                         ↓
               LangGraph: ingest → plan_lesson → interrupt (HITL)
                                                      ↓
                                      CopilotKit renderAndWaitForResponse
                                      (LessonPlanCard: Approve / Edit / Regenerate)
                                                      ↓
                                            approved → done
                                            regenerate → plan_lesson (loop)
```

### Key files

| File | Role |
|---|---|
| `lib/agent/schemas.ts` | **Single source of truth** — all Zod schemas and exported TS types |
| `lib/agent/graph.ts` | LangGraph state machine (ingest → plan → HITL interrupt) |
| `lib/agent/nodes/plan.ts` | Groq LLM call, Zod-validated `LessonPlan` output |
| `lib/agent/nodes/ingest.ts` | Writes extracted text to Supabase lessons row |
| `lib/pdf/extract.ts` | `unpdf` text extraction |
| `lib/pdf/chunk.ts` | Token-aware chunking (800 tok, 100 overlap) |
| `app/api/ingest/route.ts` | Upload PDF → Storage, extract, chunk, insert to Supabase |
| `app/api/copilotkit/route.ts` | CopilotKit runtime (GroqAdapter) for HITL orchestration |
| `components/upload/PdfUploader.tsx` | Drag-and-drop uploader with state machine UI |
| `components/plan/LessonPlanCard.tsx` | HITL approval card (editable objectives, difficulty badges) |

---

## Phase 2 contract — what to import

Phase 2 (MCQ generation) should import exclusively from:

```typescript
import {
  LessonPlan,
  LessonPlanSchema,
  Objective,
  ObjectiveSchema,
  Difficulty,
  AgentState,
} from "@/lib/agent/schemas";
```

The `lessonPlan` field in `AgentState` (and the `lesson_plan` JSONB column in Supabase) holds the approved plan. Phase 2 extends the LangGraph graph by adding nodes after the `approved` branch.
