# Memorang AI — Adaptive Learning Agent

> Turn any PDF into an interactive lesson: AI-generated plan → human review → adaptive MCQ quiz → personalised report.

Built on **Next.js 16 App Router**, **Groq (llama-3.3-70b)**, **CopilotKit**, **LangGraph JS**, and **Supabase**.

---

## Features

- **PDF ingestion** — drag-drop upload, text extraction, token-aware chunking, stored in Supabase
- **AI lesson planning** — Groq generates a structured lesson plan (title, objectives, difficulty, time estimate)
- **Human-in-the-loop approval** — edit objectives, regenerate, or approve before learning starts
- **Adaptive MCQ quiz** — one question per objective, RAG-grounded against your PDF chunks
- **AI sidebar assistant** — CopilotKit sidebar provides contextual hints and deep-dives without revealing answers
- **Personalised report** — per-objective mastery bars, strengths/gaps analysis, LLM-generated study tips
- **Retry weak objectives** — jump back into a quiz loop targeting only objectives below 80% mastery
- **Lesson history** — dashboard shows all past lessons with scores and completion status
- **Dark mode** — full light/dark/system support via `next-themes`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.7 (App Router, React 19) |
| AI / LLM | Groq API — `llama-3.3-70b-versatile` |
| Agent framework | CopilotKit `@1.59.5` (sidebar, actions, readable state) |
| Graph runtime | LangGraph JS (scaffolded; nodes called directly in serverless) |
| Database | Supabase (Postgres + pgvector + Storage) |
| Schema / validation | Zod v4 |
| Styling | Tailwind CSS v4 + shadcn/ui (base-nova, `@base-ui/react`) |
| Fonts | Geist Sans + Geist Mono |
| Theme | next-themes |
| PDF parsing | unpdf |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Groq](https://console.groq.com) account (free tier works)
- A [Supabase](https://supabase.com) project with pgvector enabled

### 1. Clone and install

```bash
git clone https://github.com/subham-proj/learning-agent.git
cd learning-agent
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Groq
GROQ_API_KEY=your_groq_api_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> **Note:** `SUPABASE_SERVICE_ROLE_KEY` is server-only. It is never sent to the client. Required because Phase 1 has no auth — RLS is bypassed via the service role client.

### 3. Set up Supabase

Enable the **pgvector** extension in your Supabase project (Dashboard → Database → Extensions → vector).

Run the migrations in order via the SQL editor or Supabase CLI:

```bash
supabase db push
```

Or manually in the SQL editor:

```
supabase/migrations/0001_init.sql     — lessons, chunks, pgvector, RLS policies
supabase/migrations/0002_attempts.sql — mcqs, attempts tables
supabase/migrations/0003_reports.sql  — reports table, lessons.completed_at column
```

Create a **Storage bucket** named `pdfs` (public read is fine for local dev; tighten RLS for production).

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/dashboard`.

---

## How It Works

### Full flow

```
1. Upload PDF
   └─ POST /api/ingest
      → upload to Supabase Storage
      → extract text (unpdf)
      → chunk into ~800-token segments
      → insert lessons + chunks rows

2. Generate lesson plan
   └─ POST /api/agent/plan
      → Groq LLM call (structured JSON output)
      → Zod validation
      → persist lesson_plan to lessons row
      → return LessonPlan to client

3. Human-in-the-loop (HITL)
   └─ LessonPlanCard
      → user edits objectives (5–10 enforced), title, difficulty
      → Approve or Regenerate

4. MCQ quiz loop (one question per objective)
   └─ POST /api/mcq/generate
      → keyword RAG over chunks (ILIKE search)
      → Groq generates MCQ with distractors
      → correct answer stored server-side only (never sent to client)
   └─ POST /api/answer
      → server-side correctness check
      → persist attempt to attempts table
      → return boolean + explanation/hint

5. AI sidebar (CopilotKit)
   └─ useCopilotReadable: exposes lesson plan, current MCQ, current objective
   └─ useCopilotAction "provide_hint": calls /api/hint (hint mode)
   └─ useCopilotAction "explain_more": calls /api/hint (learn_more mode)

6. Generate report
   └─ POST /api/report/generate
      → aggregate attempts by objective → mastery %
      → Groq generates strengths, gaps, personalised study tips
      → upsert reports table

7. Report page
   └─ /lessons/[id]/report
      → animated score ring, objective mastery bars
      → strengths/gaps, study tips
      → "Retry weak objectives" link (filters to <80% mastery)
```

### Security note

The correct answer (`correctChoiceId`) is stored in the `mcqs` table and **never** returned to the client. The `MCQClient` type omits it. Answer evaluation is always server-side via `/api/answer`.

---

## Project Structure

```
app/
├── dashboard/page.tsx             # Main flow orchestrator (FlowState machine)
├── lessons/[lessonId]/report/     # Server-rendered completion report
├── api/
│   ├── ingest/                    # PDF upload, extract, chunk
│   ├── agent/plan/                # LLM lesson plan generation
│   ├── mcq/generate/              # RAG-grounded MCQ generation
│   ├── answer/                    # Server-side answer evaluation
│   ├── hint/                      # Contextual hints + deep-dives
│   ├── report/generate/           # Aggregate attempts → report
│   ├── report/[lessonId]/         # Fetch completed report
│   ├── lessons/                   # List lesson history
│   ├── lessons/[lessonId]/        # Fetch lesson plan + metadata
│   └── copilotkit/[[...slugs]]/   # CopilotKit runtime (dual-mode handler)
├── globals.css                    # Tailwind v4 tokens, OKLCH colors, animations
└── layout.tsx                     # Root shell: ThemeProvider, CopilotKit, header

components/
├── upload/PdfUploader.tsx         # Drag-drop uploader (5-state UI)
├── plan/LessonPlanCard.tsx        # HITL approval card with objective editor
├── quiz/
│   ├── MCQCard.tsx                # Quiz card with submit/retry/advance
│   ├── ChoiceButton.tsx           # Individual answer option (glass tile)
│   ├── FeedbackBanner.tsx         # Correct/incorrect feedback with animation
│   └── ProgressBar.tsx            # Objective progress (N of M)
├── report/
│   ├── ScoreRing.tsx              # Animated SVG score ring
│   ├── ObjectiveBreakdown.tsx     # Staggered mastery bars
│   ├── StrengthsGaps.tsx          # Strengths and gaps panels
│   └── StudyTipCard.tsx           # Individual study tip
├── history/LessonCard.tsx         # Past lesson card with score badge
└── ui/
    ├── theme-toggle.tsx           # Light/dark toggle
    └── ...                        # shadcn/ui primitives (button, card, badge, etc.)

lib/
├── agent/
│   ├── schemas.ts                 # Single source of truth — all Zod schemas + TS types
│   ├── graph.ts                   # LangGraph state machine (for LangGraph Cloud)
│   └── nodes/
│       ├── plan.ts                # planLessonNode — Groq structured output
│       ├── generateMcq.ts         # RAG + Groq MCQ gen with retry
│       ├── evaluateAnswer.ts      # Correctness check + attempt persist
│       ├── hint.ts                # Guardrail-safe hint/learn-more generation
│       └── summarize.ts           # Attempt aggregation + study tips
├── groq/
│   ├── client.ts                  # ChatGroq factory (temp 0.3)
│   └── errors.ts                  # Rate-limit detection + error formatting
├── rag/retrieve.ts                # Keyword ILIKE search over chunks
├── scoring/aggregate.ts           # Per-objective mastery calculation
├── pdf/
│   ├── extract.ts                 # unpdf text extraction
│   └── chunk.ts                   # Token-aware chunker (800 tok, 100 overlap)
└── supabase/
    ├── client.ts                  # Browser Supabase client
    └── server.ts                  # Service-role server client (server-only)

supabase/migrations/
├── 0001_init.sql                  # lessons, chunks, pgvector, RLS
├── 0002_attempts.sql              # mcqs, attempts
└── 0003_reports.sql               # reports, lessons.completed_at
```

---

## CopilotKit Integration

CopilotKit powers the AI sidebar assistant during the quiz:

- **`useCopilotReadable`** — exposes the current lesson plan, active MCQ question (no correct answer), and current objective to the sidebar LLM
- **`useCopilotAction("provide_hint")`** — sidebar triggers `/api/hint` in hint mode; renders an amber card with the hint
- **`useCopilotAction("explain_more")`** — sidebar triggers `/api/hint` in learn_more mode; renders a violet deep-dive card

The runtime lives at `app/api/copilotkit/[[...slugs]]/route.ts`. It uses a dual-mode handler to support both CopilotKit's internal root-path probe and sub-path multi-route requests.

---

## LangGraph

The full agent graph is implemented in `lib/agent/graph.ts`:

```
generate_mcq → wait_for_answer → evaluate_answer → (loop or end)
```

It is **not active in the current serverless deployment** — `interrupt()` requires a persistent checkpointer and a long-running process, which Next.js serverless routes don't support. The nodes are called directly by the API routes instead.

The graph is ready for deployment to **LangGraph Cloud** or a self-hosted LangGraph server in a future phase.

---

## Database Schema

```sql
lessons       (id, user_id, file_url, raw_text, lesson_plan jsonb, status, title, completed_at)
chunks        (id, lesson_id, user_id, content, token_count, chunk_index, embedding vector(1536))
mcqs          (id, lesson_id, objective_id, question, choices jsonb, correct_choice_id, explanation, hint, source_chunk_ids)
attempts      (id, mcq_id, lesson_id, objective_id, user_id, selected_choice_id, correct, attempt_number)
reports       (id, lesson_id, user_id, overall_score, mastery_by_objective jsonb, strengths, gaps, study_tips jsonb, created_at)
```

---

## Known Limitations & Roadmap

### Current (Phase 1–3 complete)
- Authentication is a hardcoded `DEMO_USER_ID` — no real auth
- RAG uses keyword ILIKE search — no vector embeddings yet
- LangGraph graph is scaffolded but runs as direct function calls

### Phase 4 (planned)
- **Real auth** — cookie-based SSR sessions via `@supabase/ssr`
- **Vector RAG** — embed chunks on ingest, cosine similarity search at query time
- **LangGraph Cloud** — deploy graph for persistent HITL checkpointing
- **Lesson resume** — pick up a quiz where you left off
- **Embeddings pipeline** — swap char/4 token estimate for `@langchain/textsplitters`
