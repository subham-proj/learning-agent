# Design Decisions

## Why `[[...slugs]]` catch-all route for CopilotKit

CopilotKit's runtime exposes multiple HTTP sub-paths (`/info`, `/threads`, `/agent/{id}/run`).
A single `route.ts` at `/api/copilotkit/route.ts` only matches the exact root path — Next.js returns 404 for all sub-paths before app code runs.
Optional catch-all `[[...slugs]]` matches both root (`/api/copilotkit`) and all sub-paths.

## Why dual-mode (single-route root + multi-route sub-paths)

`mode: "multi-route"` has no handler for root POST. `ProxiedCopilotRuntimeAgent` (internal CopilotKit class) falls back to `POST /` with a `{method:"info"}` JSON envelope — independent of the `useSingleEndpoint` prop.
Splitting by pathname routes root POST to single-route and everything else to multi-route, satisfying both internal classes simultaneously.

## Why direct API calls instead of LangGraph in Phase 1

LangGraph's `interrupt()` requires a persistent checkpointer and a long-lived graph execution context.
In a serverless Next.js route, each request is stateless — there's no process to resume.
Phase 1 uses direct `planLessonNode()` calls and manages HITL state in React (`FlowState` machine).
The graph (`lib/agent/graph.ts`) is implemented but wired up only in Phase 2 when a persistent runner (LangGraph Cloud / self-hosted) is available.

## Why `key={planVersion}` instead of `useEffect` for LessonPlanCard reset

ESLint rule `react-hooks/set-state-in-effect` blocks calling `setState` inside a `useEffect` that watches props.
Incrementing `planVersion` in the parent causes React to unmount and remount `LessonPlanCard`, which re-runs `useState(plan ?? null)` with the latest prop. Clean, no lint violations, no stale closure risk.

## Why `z.toJSONSchema()` instead of `zod-to-json-schema`

Project uses Zod v4. The `zod-to-json-schema` package targets Zod v3 and is incompatible.
Zod v4 ships `z.toJSONSchema()` natively — no extra dependency needed.

## Why service role key in server Supabase client

Phase 1 has no auth. Using the anon key with RLS would block every insert (RLS policy requires `auth.uid() = user_id`, but there's no auth session).
The service role key bypasses RLS on the server. This is intentional and safe as long as `lib/supabase/server.ts` is never imported from client components.
Phase 2 will switch inserts to use the user's session JWT via `@supabase/ssr` cookie client.

## Why `AbortController` on `fetchPlan`

`fetchPlan` is called on upload complete AND on every regenerate. Without abort, clicking Regenerate rapidly or uploading a new file mid-generation leaves orphaned fetches that can overwrite newer state when they eventually resolve.
`planAbortRef.current?.abort()` at the top of `fetchPlan` cancels any prior in-flight request before starting the new one.

## Why file size check before `arrayBuffer()`

`file.arrayBuffer()` reads the entire file into Node.js heap. A 200 MB PDF would OOM the serverless function.
`file.size` is available on the `File` object from `formData.get()` before any buffering.
The 20 MB limit is enforced with a 413 response before touching memory.

## Why token-estimate chunking instead of a proper tokenizer

`unpdf` returns raw text; accurate token counting requires loading a full tokenizer (e.g. `tiktoken`) which adds ~5 MB WASM to cold-start time.
The `estimateTokens` heuristic (`chars / 4`) is within ±15% for English prose — sufficient for retrieval chunking in Phase 1.
Phase 2 can swap in `tiktoken` or `@langchain/textsplitters` when embedding quality matters.
