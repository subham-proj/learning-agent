# Design Decisions

## Why `[[...slugs]]` catch-all route for CopilotKit

CopilotKit's runtime exposes multiple HTTP sub-paths (`/info`, `/threads`, `/agent/{id}/run`).
A single `route.ts` at `/api/copilotkit/route.ts` only matches the exact root path — Next.js returns 404 for all sub-paths before app code runs.
Optional catch-all `[[...slugs]]` matches both root (`/api/copilotkit`) and all sub-paths.

## Why dual-mode (single-route root + multi-route sub-paths)

`mode: "multi-route"` has no handler for root POST. `ProxiedCopilotRuntimeAgent` (internal CopilotKit class) falls back to `POST /` with a `{method:"info"}` JSON envelope — independent of the `useSingleEndpoint` prop.
Splitting by pathname routes root POST to single-route and everything else to multi-route, satisfying both internal classes simultaneously.

## Why direct API calls instead of LangGraph in serverless routes

LangGraph's `interrupt()` requires a persistent checkpointer and a long-lived graph execution context.
In a serverless Next.js route, each request is stateless — there's no process to resume.
Nodes (`planLessonNode`, `generateMcqNode`, `summarizeLangGraphNode`, etc.) are called directly from their respective API routes.
The graph (`lib/agent/graph.ts`) is implemented but invoked only when a persistent runner (LangGraph Cloud / self-hosted) is available.

## Why `key={planVersion}` instead of `useEffect` for LessonPlanCard reset

ESLint rule `react-hooks/set-state-in-effect` blocks calling `setState` inside a `useEffect` that watches props.
Incrementing `planVersion` in the parent causes React to unmount and remount `LessonPlanCard`, which re-runs `useState(plan ?? null)` with the latest prop. Clean, no lint violations, no stale closure risk.

## Why `z.toJSONSchema()` instead of `zod-to-json-schema`

Project uses Zod v4. The `zod-to-json-schema` package targets Zod v3 and is incompatible.
Zod v4 ships `z.toJSONSchema()` natively — no extra dependency needed.

## Why service role key in server Supabase client

Phase 1 has no auth. Using the anon key with RLS would block every insert (RLS policy requires `auth.uid() = user_id`, but there's no auth session).
The service role key bypasses RLS on the server. This is intentional and safe as long as `lib/supabase/server.ts` is never imported from client components.
Because RLS is bypassed, every API route that accepts a `userId` performs an explicit ownership check: select the row, compare `row.user_id` to the supplied `userId`, return 403 on mismatch.
Production will swap to `@supabase/ssr` cookie client so RLS enforces ownership automatically.

## Why `AbortController` on `fetchPlan`

`fetchPlan` is called on upload complete AND on every regenerate. Without abort, clicking Regenerate rapidly or uploading a new file mid-generation leaves orphaned fetches that can overwrite newer state when they eventually resolve.
`planAbortRef.current?.abort()` at the top of `fetchPlan` cancels any prior in-flight request before starting a new one.

## Why file size check before `arrayBuffer()`

`file.arrayBuffer()` reads the entire file into Node.js heap. A 200 MB PDF would OOM the serverless function.
`file.size` is available on the `File` object from `formData.get()` before any buffering.
The 20 MB limit is enforced with a 413 response before touching memory.

## Why token-estimate chunking instead of a proper tokenizer

`unpdf` returns raw text; accurate token counting requires loading a full tokenizer (e.g. `tiktoken`) which adds ~5 MB WASM to cold-start time.
The `estimateTokens` heuristic (`chars / 4`) is within ±15% for English prose — sufficient for retrieval chunking.

## Why `lib/groq/errors.ts` instead of inline error handling

Every LLM call site (plan, MCQ generation, hint, summarize) needs to distinguish rate-limit errors from other failures. Without a shared utility: duplicate regex patterns, inconsistent HTTP status codes (some routes returned 500 on 429), and raw `"429 {...}"` JSON surfaced directly in the UI.

`friendlyGroqError()` extracts the human-readable retry wait from the Groq error string and returns a single consistent message. `isRateLimitError()` lets routes return HTTP 429 (not 500) and lets retry loops bail out immediately — there's no point retrying a daily token-exhaustion error.

## Why 5–10 objectives are enforced at three layers

A single enforcement point is insufficient:
- **Schema only** (`LessonPlanSchema.objectives.min(5).max(10)`): rejects bad LLM output at parse time, but gives no guidance to the model — causes silent retries.
- **LLM prompt only**: the model is instructed but not constrained — a future model change or prompt injection could bypass it.
- **UI only**: server never validates the HITL-edited plan — a tampered request could slip through.

All three layers together form defense-in-depth: the schema fails fast on bad LLM output, the prompt prevents most bad output, and the UI prevents editors from accidentally submitting an under-count plan.

The schema change (`min(1)` → `min(5)`) also propagates automatically to the JSON schema sent to the LLM in the user prompt via `z.toJSONSchema(LessonPlanSchema)`, so the model sees the structural constraint without any extra prompt engineering.

## Why `Suspense` wrapper for `useSearchParams` in dashboard

Next.js App Router requires components that call `useSearchParams()` to be wrapped in a `<Suspense>` boundary, or the build fails with: _"useSearchParams() should be wrapped in a suspense boundary"_.

`DashboardPage` is a thin Suspense shell; `DashboardContent` (the real component) calls `useSearchParams`. This split also gives the loading fallback UI for free.

## Why `crypto.randomUUID()` for new objectives in `LessonPlanCard`

New objectives added by the editor need a stable `id` immediately — for React `key`, and to match the `ObjectiveSchema` shape. `crypto.randomUUID()` is available in all modern browsers and in Node.js without any import. No extra dependency; no server round-trip needed for a client-only addition.

## Why `fakeIngest` for the retry-weak-objectives flow

When the user clicks "Retry weak objectives" from the report page, the dashboard needs to restart the MCQ loop for a subset of objectives without re-uploading the PDF.

Only `lessonId` is used downstream (`generateMcqNode` fetches chunks via `lessonId`). Constructing a minimal `IngestResult` with the `lessonId` and empty/zero fields (`rawText: ""`, `chunkCount: 0`) avoids a full re-ingest while keeping the existing `FlowState` machine's type contract intact.

## Why `historyLoading` is initialized to `true` instead of set in `useEffect`

The ESLint rule `react-hooks/set-state-in-effect` blocks synchronous `setState` calls in effect bodies. Initializing `historyLoading` to `true` in `useState(true)` is equivalent — the component starts in the loading state — and avoids the lint violation without the `setTimeout` workaround needed elsewhere.
