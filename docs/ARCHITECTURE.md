# Architecture — AI Learning Agent (Phase 1)

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
                            → LessonPlanSchema.parse()
                          UPDATE lessons SET lesson_plan, status="planned"
                          ◄── { lessonPlan }
  │
  ▼
LessonPlanCard (HITL)
  User edits / approves
  │
  ▼
approved state (in-memory, Phase 1)
```

## Key Files

```
app/
  layout.tsx                   CopilotKit provider (dual-mode, useSingleEndpoint=false)
  page.tsx                     Redirect → /dashboard
  dashboard/page.tsx           Main flow orchestrator (FlowState machine)
  api/
    ingest/route.ts            PDF upload → text extract → DB insert
    agent/plan/route.ts        LLM lesson planning → DB persist
    copilotkit/[[...slugs]]/   Dual-mode CopilotKit handler (see below)
      route.ts

lib/
  agent/
    schemas.ts                 Single source of truth for all Zod types
    graph.ts                   LangGraph graph (Phase 2 — not yet invoked)
    nodes/
      ingest.ts                LangGraph ingest node (Phase 2)
      plan.ts                  planLessonNode() — called directly by API route
  groq/client.ts               ChatGroq factory (temp 0.3)
  pdf/extract.ts               extractPdfText() via unpdf
  pdf/chunk.ts                 chunkText() — 800 tok target, 100 tok overlap
  supabase/
    server.ts                  Service-role client (bypasses RLS, server only)
    client.ts                  Anon browser client

components/
  plan/LessonPlanCard.tsx      HITL card — edit objectives, approve/regenerate
  upload/PdfUploader.tsx       5-state drag-drop uploader
  ui/                          shadcn primitives (card, badge, button, input, skeleton)

supabase/migrations/
  0001_init.sql                lessons + chunks tables, pgvector, RLS policies
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
         raw_text text, lesson_plan jsonb, status text, created_at, updated_at)

chunks  (id uuid PK, lesson_id uuid FK→lessons, user_id uuid,
         content text, token_count int, chunk_index int,
         embedding vector(1536), created_at)
```

RLS policies: `auth.uid() = user_id`. Server client uses service role key → bypasses RLS.

## Phase 2 TODOs

- Wire `buildLessonGraph()` into API routes (currently dead code)
- Replace `DEMO_USER_ID` with real Supabase Auth session
- Add embeddings pipeline for chunks (OpenAI `text-embedding-3-small` or similar)
- Persist approved plan with a dedicated `POST /api/agent/approve` route
- Add rate limiting on `/api/ingest` and `/api/agent/plan`
