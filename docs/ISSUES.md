# Issues & Fixes Log

## Runtime / Integration

### `runtime_info_fetch_failed` — status 404 on CopilotKit init
**Symptom:** Browser console shows `Code: runtime_info_fetch_failed, status 404` on every page load.
**Root cause (layered):**
1. Old `app/api/copilotkit/route.ts` only matched exact path `/api/copilotkit` — Next.js returned 404 for `/api/copilotkit/threads`, `/api/copilotkit/info`, etc.
2. Switching to `[[...slugs]]` + `mode: "multi-route"` fixed sub-paths but left root `POST /api/copilotkit` with no handler — `ProxiedCopilotRuntimeAgent` fallback hit 404.
3. `useSingleEndpoint={false}` fixed `AgentRegistry` but not `ProxiedCopilotRuntimeAgent` (separate class, own transport detection).
**Fix:** Dual-mode handler in `[[...slugs]]/route.ts` — root POST → single-route, all else → multi-route. See `docs/DECISIONS.md`.
**Files:** `app/api/copilotkit/[[...slugs]]/route.ts`, `app/layout.tsx`

### `useAgent: Agent 'lessonAgent' not found after runtime sync`
**Symptom:** Runtime error on load; no agents registered.
**Root cause:** `<CopilotKit agent="lessonAgent">` requires an agent registered in the CopilotKit runtime. `LangGraphAgent` needs a remote `deploymentUrl` — it cannot wrap a locally compiled graph.
**Fix:** Removed `agent="lessonAgent"` from `<CopilotKit>`. Runtime uses `GroqAdapter` only (no agent registration needed for Phase 1 chat features).
**Files:** `app/layout.tsx`

### `createCopilotHonoHandler` TypeScript error — not found in main package
**Symptom:** TS error `Module '"@copilotkit/runtime"' has no exported member 'createCopilotHonoHandler'`.
**Root cause:** Main `dist/index.d.cts` is 29 lines, doesn't expose v2 APIs. Function lives in `dist/v2/runtime/endpoints/hono.mjs`.
**Fix:** Import from `@copilotkit/runtime/v2` subpath.

---

## Data / API

### UUID validation error on PDF upload
**Symptom:** `{ "error": "invalid input syntax for type uuid: \"demo-user-001\"" }`
**Root cause:** `DEMO_USER_ID = "demo-user-001"` in `dashboard/page.tsx`. `lessons.user_id` column is `uuid NOT NULL` in Postgres.
**Fix:** Changed to valid UUID `"00000000-0000-0000-0000-000000000001"`.
**File:** `app/dashboard/page.tsx:12`

### `raw_text` never persisted on ingest
**Symptom:** Lesson row in DB had no `raw_text`; regenerating a plan would require re-uploading the PDF.
**Root cause:** `/api/ingest` INSERT only sent `{ user_id, file_url, status }`. `rawText` was extracted but discarded after the request.
**Fix:** Added `raw_text: rawText` to the INSERT. Text is available at that point (extracted before the insert).
**File:** `app/api/ingest/route.ts:52`

### Unhandled `JSON.parse` crash in plan node
**Symptom:** `/api/agent/plan` returns 500 with `SyntaxError: Unexpected token` when LLM wraps output in markdown fences or adds prose.
**Root cause:** `JSON.parse(extractJSON(raw))` and `LessonPlanSchema.parse()` were unguarded. `extractJSON()` strips fences but doesn't handle all LLM output formats.
**Fix:** Wrapped both calls in try/catch; returns `{ error: "LLM returned an invalid or unparseable lesson plan" }`.
**File:** `lib/agent/nodes/plan.ts:44`

### `lessonId` not validated as UUID in plan route
**Symptom:** Malformed `lessonId` values passed client-side reached the DB query without rejection.
**Fix:** Changed `z.string()` to `z.string().uuid()` in `RequestSchema`.
**File:** `app/api/agent/plan/route.ts:8`

---

## Routing / Next.js

### `/dashboard` returning 404
**Symptom:** Navigating to `/dashboard` returns 404.
**Root cause:** Page was at `app/(dashboard)/page.tsx`. Route group parentheses don't add URL segments — it served `/`, not `/dashboard`. Conflicted with `app/page.tsx`.
**Fix:** Deleted `app/(dashboard)/page.tsx`; created `app/dashboard/page.tsx`; replaced `app/page.tsx` with a redirect to `/dashboard`.

### Stale `.next` cache after route group deletion
**Symptom:** TypeScript complained about missing old file after deleting the route group.
**Fix:** `rm -rf .next` before type check.

---

## Frontend / UX

### "Uploading…" state never rendered
**Symptom:** Users always see "Extracting text…" — "Uploading…" was invisible.
**Root cause:** `setState("uploading")` and `setState("parsing")` both happened synchronously before the React paint cycle. Only "parsing" was ever rendered.
**Fix:** Moved `setState("parsing")` to after `await fetch(...)` resolves. "Uploading…" is now shown for the full network round-trip.
**File:** `components/upload/PdfUploader.tsx:43`

### Local `cn()` without `tailwind-merge` in dashboard
**Symptom:** Conflicting Tailwind classes (e.g., two `bg-*`) not resolved — later class wins unpredictably.
**Root cause:** `dashboard/page.tsx` defined its own `cn(...classes) { return classes.filter(Boolean).join(" ") }` without `tailwind-merge`.
**Fix:** Replaced with `import { cn } from "@/lib/utils"` (uses `clsx` + `tailwind-merge`).
**File:** `app/dashboard/page.tsx`

### Duplicate `IngestResult` interface in three files
**Root cause:** Defined locally in `dashboard/page.tsx`, `PdfUploader.tsx`, and exported from `lib/agent/schemas.ts`.
**Fix:** Both components now import from `@/lib/agent/schemas`. Local copies deleted.

### Race condition on rapid regenerate / re-upload
**Symptom:** If user clicked Regenerate twice quickly, both fetches raced and the slower one could overwrite state.
**Fix:** Added `AbortController` with `planAbortRef` — previous fetch is aborted before starting a new one.
**File:** `app/dashboard/page.tsx:24,35`

---

## Dependencies

### `zod-to-json-schema` incompatible with Zod v4
**Symptom:** TypeScript errors when calling `zodToJsonSchema()`.
**Root cause:** Package targets Zod v3 API. Project uses Zod v4 which changed the schema internals.
**Fix:** Removed package. Used `z.toJSONSchema()` (Zod v4 native).

### `groq-sdk` missing from node_modules
**Symptom:** `Cannot find module 'groq-sdk'` at runtime.
**Root cause:** Initial `npm install` failed due to peer dependency conflict with `groq-sdk`; package was skipped.
**Fix:** `npm install "groq-sdk@>=0.3.0 <1.0.0" --legacy-peer-deps` → installed `0.37.0`.

---

## Known Limitations (Phase 1)

| Issue | Status | Phase |
|---|---|---|
| LangGraph graph built but not invoked | Intentional — serverless constraint | Phase 2 |
| No real auth — demo UUID hardcoded | Known, flagged in comment | Phase 2 |
| `raw_text` truncated to 8000 chars for LLM | Rough limit, no sentence boundary | Phase 2 |
| No embeddings on chunks | Column exists, not populated | Phase 2 |
| Approved plan stored only in React state | Not persisted to DB | Phase 2 |
| RLS policies never enforced | Service role bypasses RLS | Phase 2 |
