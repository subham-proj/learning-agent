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

### Groq rate limit errors shown as raw JSON in the UI
**Symptom:** When the Groq daily token quota was exhausted, the UI displayed the raw error string: `{ "error": "429 {\"error\":{\"message\":\"Rate limit reached...\",\"code\":\"rate_limit_exceeded\"}}" }` — entirely opaque to the user.
**Root cause:** API routes caught the Groq error and returned `err.message` directly. `err.message` from `@langchain/groq` on a 429 is the raw HTTP response body including the status code prefix. MCQ generation's retry loop also needlessly retried a daily token exhaustion (no wait could fix it).
**Fix:**
- Created `lib/groq/errors.ts` with `friendlyGroqError()` (extracts "try again in Xm Ys" from the message, returns human-readable string) and `isRateLimitError()` (detects 429/rate_limit_exceeded).
- All LLM call sites use `friendlyGroqError` for the error message.
- Routes return HTTP 429 (not 500) when `isRateLimitError` is true.
- MCQ retry loop calls `break` immediately on rate limit — no point retrying.
**Files:** `lib/groq/errors.ts` (new), `lib/agent/nodes/plan.ts`, `lib/agent/nodes/generateMcq.ts`, `app/api/agent/plan/route.ts`, `app/api/hint/route.ts`

### No authorization on Phase 3 API routes (IDOR risk)
**Symptom:** Any caller supplying an arbitrary `lessonId` could read or generate reports for lessons they don't own. Service role client bypasses RLS, so Supabase itself provided no protection.
**Root cause:** Phase 3 routes accepted `userId` from request body/query without UUID format validation and without checking that the lesson belongs to that user.
**Fix:**
- `userId` validated as `z.string().uuid()` everywhere; returns 400 on malformed input.
- `/api/report/generate`: selects `user_id` from the lesson row; returns 403 if it doesn't match the supplied `userId`.
- `/api/report/[lessonId]`: ownership check on fetch; returns 403 on mismatch.
- `/api/lessons/[lessonId]`: new route with ownership check.
**Files:** `app/api/report/generate/route.ts`, `app/api/report/[lessonId]/route.ts`, `app/api/lessons/route.ts`, `app/api/lessons/[lessonId]/route.ts`

---

## Animation / UI

### `ScoreRing` count-up animation restarts stale on second view
**Symptom:** Navigating away from the report page and back caused the score ring to count from an incorrect mid-animation value instead of 0.
**Root cause:** `startRef.current` stored the `Date.now()` timestamp from the previous animation run and was never cleared between renders. On the next mount, the `requestAnimationFrame` loop read a stale past timestamp and computed an inflated elapsed time.
**Fix:** Added `startRef.current = null;` at the very top of the `useEffect` before the animation starts. The `if (!startRef.current)` check then correctly treats each mount as a fresh animation.
**File:** `components/report/ScoreRing.tsx`

---

## Routing / Next.js

### `/dashboard` returning 404
**Symptom:** Navigating to `/dashboard` returns 404.
**Root cause:** Page was at `app/(dashboard)/page.tsx`. Route group parentheses don't add URL segments — it served `/`, not `/dashboard`. Conflicted with `app/page.tsx`.
**Fix:** Deleted `app/(dashboard)/page.tsx`; created `app/dashboard/page.tsx`; replaced `app/page.tsx` with a redirect to `/dashboard`.

### Stale `.next` cache after route group deletion
**Symptom:** TypeScript complained about missing old file after deleting the route group.
**Fix:** `rm -rf .next` before type check.

### `useSearchParams()` crash without Suspense boundary
**Symptom:** Build error: _"useSearchParams() should be wrapped in a suspense boundary at page "/dashboard"."_ The report page's retry CTA linked to `/dashboard?retry=gaps&lessonId=X`, but the dashboard page called `useSearchParams()` directly without a Suspense boundary.
**Root cause:** Next.js App Router requires any component that calls `useSearchParams()` to be inside a `<Suspense>` boundary; otherwise the entire route is statically rendered without access to search params.
**Fix:** Split `dashboard/page.tsx` into `DashboardPage` (Suspense shell) and `DashboardContent` (the real component using `useSearchParams`). The `initRetry` effect reads `?retry=gaps&lessonId=X`, fetches lesson + report data in `Promise.all`, filters gap objectives, and restarts the MCQ loop.
**File:** `app/dashboard/page.tsx`

### Dead retry CTA on report page
**Symptom:** "Retry weak objectives" button linked to `/?retry=gaps&lessonId=X`. The dashboard never read those query params, so clicking the button just loaded a fresh dashboard with no retry behaviour.
**Root cause:** URL pointed to wrong path (`/` instead of `/dashboard`), and even after the path was corrected, `DashboardContent` had no `initRetry` logic consuming the params.
**Fix:** URL changed to `/dashboard?retry=gaps&lessonId=X`. Full `initRetry` flow implemented: fetches lesson plan and report, filters objectives whose `id` appears in `report.gaps`, constructs a minimal `fakeIngest`, and calls `fetchMCQ` to enter the quiz loop. Requires the Suspense split above.
**Files:** `app/lessons/[lessonId]/report/page.tsx`, `app/dashboard/page.tsx`

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

## Known Limitations

| Issue | Status |
|---|---|
| No real auth — demo UUID hardcoded | Known; swap to `@supabase/ssr` session JWT in production |
| `raw_text` truncated to 8000 chars for LLM | Rough limit, no sentence boundary |
| LangGraph graph wired but nodes called directly | Serverless constraint — intentional |
| In-progress lesson cards link to dashboard, not mid-quiz resume | Resume flow not yet implemented |
| `ScoreRing` negative margin layout hack for label overlay | Low-impact cosmetic debt |
| Hardcoded hex colors in `ScoreRing` (dark-mode unaware) | Will drift if palette changes |
| `setTimeout` workaround in `theme-toggle.tsx` for lint rule | Code smell; safe but brittle |
| `timerRef` not cleaned up in reduced-motion path of `ObjectiveBreakdown` | Minor leak |
| `lessons.update` failure silently ignored in `summarizeNode` | Low blast-radius; add alerting later |
| Report page casts Supabase JSONB without Zod validation | Add `ReportSchema.parse()` on read in production |
| Redundant DB index `reports_lesson_id_idx` alongside unique index | Drop one in next migration |
