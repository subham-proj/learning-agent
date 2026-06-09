# AI Learning Agent

Turns a PDF into an interactive, AI-drafted lesson with human-in-the-loop approval, adaptive MCQ quizzes, and a personalised completion report.

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

Run the migrations in your Supabase SQL editor or via CLI:

```bash
supabase db push
# or manually run in order:
supabase/migrations/0001_init.sql      # lessons, chunks, pgvector, RLS
supabase/migrations/0002_attempts.sql  # mcqs, attempts tables
supabase/migrations/0003_reports.sql   # reports table, lessons.completed_at
```

Create a **Storage bucket** named `pdfs` (public or private — update RLS as needed).

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Architecture

```
PDF upload → /api/ingest → Supabase Storage + lessons + chunks
                         ↓
               /api/agent/plan (Groq LLM)
                         ↓
               LessonPlanCard (HITL — edit / approve / regenerate)
               5–10 objectives enforced at schema + LLM prompt + UI
                         ↓
               MCQ Quiz loop (per objective):
                 /api/mcq/generate → Groq + RAG retrieval
                 User answers → /api/answer → evaluateAnswer
                 /api/hint → Groq (hint or learn_more mode)
                         ↓
               /api/report/generate → aggregateAttempts → Groq study tips
                         ↓
               /lessons/[id]/report — score ring, objective breakdown,
                                      strengths/gaps, study tips
                         ↓
               Dashboard lesson history (last 20 lessons)
```

### Key files

| File | Role |
|---|---|
| `lib/agent/schemas.ts` | **Single source of truth** — all Zod schemas and exported TS types |
| `lib/agent/graph.ts` | LangGraph state machine (wired up for LangGraph Cloud; nodes called directly in serverless) |
| `lib/agent/nodes/plan.ts` | Groq LLM call, Zod-validated `LessonPlan` output |
| `lib/agent/nodes/ingest.ts` | Writes extracted text to Supabase lessons row |
| `lib/agent/nodes/generateMcq.ts` | RAG-grounded MCQ generation with 3-attempt retry loop |
| `lib/agent/nodes/evaluateAnswer.ts` | Scores user answer, updates attempts table |
| `lib/agent/nodes/hint.ts` | Groq-powered contextual hints and deep-dive explanations |
| `lib/agent/nodes/summarize.ts` | Aggregates attempts → Groq study tips → upserts reports table |
| `lib/groq/client.ts` | `ChatGroq` factory (temp 0.3) |
| `lib/groq/errors.ts` | Shared rate-limit detection and friendly error formatting |
| `lib/scoring/aggregate.ts` | Per-objective mastery scoring from raw attempt rows |
| `lib/rag/retrieve.ts` | pgvector similarity search over lesson chunks |
| `lib/pdf/extract.ts` | `unpdf` text extraction |
| `lib/pdf/chunk.ts` | Token-aware chunking (800 tok, 100 overlap) |
| `app/api/ingest/route.ts` | Upload PDF → Storage, extract, chunk, insert to Supabase |
| `app/api/agent/plan/route.ts` | LLM lesson planning → DB persist |
| `app/api/mcq/generate/route.ts` | Generate and persist one MCQ for an objective |
| `app/api/answer/route.ts` | Evaluate user answer, record attempt |
| `app/api/hint/route.ts` | Generate contextual hint or learn-more response |
| `app/api/report/generate/route.ts` | Trigger summarize node → upsert report |
| `app/api/report/[lessonId]/route.ts` | Fetch completed report data |
| `app/api/lessons/route.ts` | List lesson history for a user |
| `app/api/lessons/[lessonId]/route.ts` | Fetch lesson plan + metadata |
| `app/api/copilotkit/route.ts` | CopilotKit runtime (GroqAdapter) for HITL orchestration |
| `app/dashboard/page.tsx` | Main flow orchestrator with Suspense for `useSearchParams` |
| `app/lessons/[lessonId]/report/page.tsx` | Server-rendered completion report page |
| `components/plan/LessonPlanCard.tsx` | HITL approval card — add/remove objectives, count badge, approve guard |
| `components/quiz/MCQCard.tsx` | Animated MCQ card with hint/learn-more drawer |
| `components/report/ScoreRing.tsx` | Animated SVG score ring |
| `components/report/ObjectiveBreakdown.tsx` | Staggered mastery bars per objective |
| `components/report/StrengthsGaps.tsx` | Strengths and gaps lists from LLM |
| `components/report/StudyTipCard.tsx` | Individual study tip with priority badge |
| `components/history/LessonCard.tsx` | Lesson history card with score and status |
| `components/upload/PdfUploader.tsx` | Drag-and-drop uploader with 5-state UI |
| `components/ui/theme-toggle.tsx` | Light/dark/system theme switcher |
