# Architecture — AI Learning Agent

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.7 (App Router) |
| LLM | Groq `llama-3.3-70b-versatile` via `@langchain/groq` |
| Agent runtime | CopilotKit `@copilotkit/runtime@1.59.5` |
| Graph / HITL | LangGraph JS `@langchain/langgraph` |
| Database | Supabase (Postgres + pgvector) |
| Storage | Supabase Storage (`pdfs` bucket) |
| PDF parsing | `unpdf` |
| Schema validation | Zod v4 (`z.toJSONSchema()` — NOT `zod-to-json-schema`) |
| Styling | Tailwind CSS v4 + shadcn/ui (base-nova style) |
| Dark mode | `next-themes` (`ThemeProvider`, `attribute="class"`) |

## Data Flow

```
Browser                   Next.js API                    External
───────                   ──────────                     ────────
Upload PDF
  │
  ▼
POST /api/ingest ─────────────────────────────────────► Supabase Storage (pdfs/)
                          extract text (unpdf)
                          chunk text (800 tok / 100 overlap)
                          INSERT lessons (id, user_id, file_url, raw_text)
                          INSERT chunks  (lesson_id, content, token_count)
                          ◄── { lessonId, fileUrl, rawText, chunkCount }
  │
  ▼
POST /api/agent/plan ─────────────────────────────────► Groq (llama-3.3-70b)
                          planLessonNode()
                            → strip JSON fences
                            → LessonPlanSchema.parse()   [min 5, max 10 objectives]
                          UPDATE lessons SET lesson_plan, status="planned"
                          ◄── { lessonPlan }
  │
  ▼
LessonPlanCard (HITL)
  User views/edits/approves
  Add/remove objectives (count badge, 5–10 guard)
  │
  ▼
MCQ Quiz loop (one objective at a time):
  │
  ├─► POST /api/mcq/generate ──────────────────────────► Groq (llama-3.3-70b)
  │                         retrieveChunks() [pgvector]
  │                         generateMcqNode() — 3-attempt retry, breaks on 429
  │                         INSERT mcqs (question, choices, correct_choice_id, ...)
  │                         ◄── { clientMCQ }  [correctChoiceId stripped]
  │
  ├─► POST /api/answer ────────────────────────────────► (no external call)
  │                         look up mcqs.correct_choice_id server-side
  │                         INSERT attempts (mcq_id, lesson_id, objective_id,
  │                                          is_correct, attempt_number)
  │                         ◄── { isCorrect, explanation }
  │
  ├─► POST /api/hint ──────────────────────────────────► Groq (llama-3.3-70b)
  │                         generateHint() — hint or learn_more mode
  │                         ◄── { response }
  │
  └─► [repeat for next objective]
  │
  ▼
POST /api/report/generate
                          SELECT attempts WHERE lesson_id
                          aggregateAttempts() — per-objective mastery, overallScore
                          retrieveChunks() on weak objectives → Groq study tips
                          UPSERT reports (overall_score, mastery_by_objective,
                                          strengths, gaps, study_tips)
                          UPDATE lessons SET status="completed", completed_at
                          ◄── { reportId }
  │
  ▼
GET /lessons/[lessonId]/report  (Server Component)
  getReport() + getLessonTitle() in Promise.all
  Renders: ScoreRing, ObjectiveBreakdown, StrengthsGaps, StudyTipCard[]
  Retry CTA → /dashboard?retry=gaps&lessonId=[id]
```

## Key Files

```
app/
  layout.tsx                   ThemeProvider + CopilotKit provider (dual-mode)
  page.tsx                     Redirect → /dashboard
  dashboard/page.tsx           DashboardPage (Suspense) + DashboardContent (useSearchParams)
  lessons/
    [lessonId]/report/page.tsx  Server-rendered completion report
  api/
    ingest/route.ts             PDF upload → text extract → DB insert
    agent/plan/route.ts         LLM lesson planning → DB persist
    mcq/generate/route.ts       Generate + persist one MCQ per objective
    answer/route.ts             Evaluate answer, record attempt
    hint/route.ts               Contextual hint or deep-dive explanation
    report/
      generate/route.ts         Summarize attempts → upsert report
      [lessonId]/route.ts       Fetch report data (with ownership check)
    lessons/
      route.ts                  List lesson history (GET) / create (POST via ingest)
      [lessonId]/route.ts       Fetch lesson plan + metadata
    copilotkit/[[...slugs]]/    Dual-mode CopilotKit handler (see below)
      route.ts

lib/
  agent/
    schemas.ts                  Single source of truth for all Zod types + TS types
    graph.ts                    LangGraph graph (nodes wired; called directly in serverless)
    nodes/
      ingest.ts                 LangGraph ingest node
      plan.ts                   planLessonNode() — Groq → LessonPlan
      generateMcq.ts            generateMcqNode() — RAG + Groq, 3-attempt retry
      evaluateAnswer.ts         evaluateAnswerNode() — server-side correctness check
      hint.ts                   generateHint() — hint / learn_more modes
      summarize.ts              summarizeLangGraphNode() — mastery agg + Groq study tips
  groq/
    client.ts                   ChatGroq factory (temp 0.3)
    errors.ts                   friendlyGroqError(), isRateLimitError()
  scoring/
    aggregate.ts                aggregateAttempts() — mastery formula, overallScore
  rag/
    retrieve.ts                 retrieveChunks() — pgvector similarity search
  pdf/
    extract.ts                  extractPdfText() via unpdf
    chunk.ts                    chunkText() — 800 tok target, 100 tok overlap
  supabase/
    server.ts                   Service-role client (bypasses RLS, server only)
    client.ts                   Anon browser client

components/
  plan/LessonPlanCard.tsx       HITL card — add/remove objectives (5–10), approve guard
  quiz/
    MCQCard.tsx                 MCQ card with choice buttons, feedback, hint drawer
    ChoiceButton.tsx            Animated choice button (correct/incorrect state)
    FeedbackBanner.tsx          Post-answer explanation banner
    ProgressBar.tsx             Objective progress indicator
  report/
    ScoreRing.tsx               Animated SVG score ring with count-up
    ObjectiveBreakdown.tsx      Staggered mastery bars per objective
    StrengthsGaps.tsx           LLM-generated strengths and gaps lists
    StudyTipCard.tsx            Study tip with priority badge and RAG source
  history/
    LessonCard.tsx              History card — title, score, status, date
  upload/PdfUploader.tsx        5-state drag-drop uploader
  ui/
    theme-toggle.tsx            Light/dark/system theme switcher
    badge.tsx, button.tsx, ...  shadcn primitives

supabase/migrations/
  0001_init.sql                 lessons + chunks tables, pgvector, RLS policies
  0002_attempts.sql             mcqs + attempts tables
  0003_reports.sql              reports table, lessons.completed_at column
```

## CopilotKit Integration

### The dual-mode handler problem
CopilotKit has two internal classes with independent transport detection:
- `AgentRegistry` — respects `useSingleEndpoint={false}` → uses `GET /info`
- `ProxiedCopilotRuntimeAgent` — has its own auto-detect; falls back to `POST /api/copilotkit` (root) with a `{method:"info"}` JSON envelope when `GET /info` fails

**Multi-route mode** (`createCopilotHonoHandler({ mode: "multi-route" })`) has no root POST handler → 404 → `runtime_info_fetch_failed`.

### Solution (`app/api/copilotkit/[[...slugs]]/route.ts`)
Two handler instances sharing the same `runtime.instance`:
- `GET *` → multi-route (`GET /info`, `GET /threads`)
- `POST /api/copilotkit` (root) → single-route (handles JSON envelope fallback)
- `POST /api/copilotkit/*` (sub-paths) → multi-route (`/agent/{id}/run`)

`[[...slugs]]` optional catch-all matches both the root and all sub-paths.

### Import path
`createCopilotHonoHandler` is NOT exported from `@copilotkit/runtime` main index.
Must import from **`@copilotkit/runtime/v2`** subpath.

## Database Schema (Supabase)

```sql
lessons (id uuid PK, user_id uuid, title text, file_url text,
         raw_text text, lesson_plan jsonb, status text,
         completed_at timestamptz, created_at, updated_at)

chunks  (id uuid PK, lesson_id uuid FK→lessons, user_id uuid,
         content text, token_count int, chunk_index int,
         embedding vector(1536), created_at)

mcqs    (id uuid PK, lesson_id uuid FK→lessons, objective_id uuid,
         question text, choices jsonb, correct_choice_id text,
         explanation text, hint text, source_chunk_ids uuid[])

attempts (id uuid PK, mcq_id uuid FK→mcqs, lesson_id uuid FK→lessons,
          objective_id uuid, user_id uuid, selected_choice_id text,
          is_correct bool, attempt_number int, created_at)

reports (id uuid PK, lesson_id uuid FK→lessons UNIQUE, user_id uuid,
         overall_score int, mastery_by_objective jsonb,
         strengths text[], gaps text[], study_tips jsonb,
         created_at, updated_at)
```

RLS policies: `auth.uid() = user_id` on all tables.
Server client uses service role key → bypasses RLS; ownership enforced explicitly in each API route.

## Mastery Scoring

```
For each objective:
  if no correct attempt:          masteryPercent = 0
  if correct on first attempt:    masteryPercent = 100
  otherwise:                      masteryPercent = round(60 + 40 / totalAttempts)

overallScore = average(masteryPercent for all objectives)
```

`lib/scoring/aggregate.ts` owns this formula; `summarize.ts` calls it before the Groq study-tips call.

## Serverless LangGraph Constraint

`interrupt()` in LangGraph requires a persistent checkpointer and long-lived execution context — incompatible with stateless serverless functions. The full graph in `lib/agent/graph.ts` is implemented for future LangGraph Cloud / self-hosted deployment; in the current serverless environment, nodes are called directly from API routes.

## Known Limitations

| Issue | Status |
|---|---|
| No real auth — demo UUID hardcoded | Known; swap to session JWT in production |
| `raw_text` truncated to 8000 chars for LLM | Rough limit, no sentence boundary |
| LangGraph graph wired but nodes called directly | Serverless constraint — intentional |
| Approved plan not separately persisted (relies on `lessons.lesson_plan`) | By design for now |
| In-progress lesson cards link to dashboard, not resume mid-quiz | Resume flow not yet implemented |
| `ScoreRing` negative margin layout hack for label overlay | Low-impact cosmetic debt |
| Hardcoded hex colors in `ScoreRing` (dark-mode unaware) | Will drift if palette changes |
| `setTimeout` workaround in `theme-toggle.tsx` for lint rule | Code smell; safe but brittle |
| `timerRef` not cleaned up in reduced-motion path of `ObjectiveBreakdown` | Minor leak |
| `lessons.update` failure silently ignored in `summarizeNode` | Low blast-radius; add alerting later |
| Report page casts Supabase JSONB without Zod validation | Add parse on read in production |
