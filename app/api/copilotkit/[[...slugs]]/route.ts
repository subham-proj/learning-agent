import { CopilotRuntime, GroqAdapter } from "@copilotkit/runtime";
import { createCopilotHonoHandler } from "@copilotkit/runtime/v2";
import { handle } from "hono/vercel";
import { NextRequest } from "next/server";

const runtime = new CopilotRuntime();
runtime.handleServiceAdapter(new GroqAdapter({ model: "llama-3.3-70b-versatile" }));

// Multi-route: handles GET /info, GET /threads, POST /agent/{id}/run, etc.
const multiRouteApp = createCopilotHonoHandler({
  runtime: runtime.instance,
  basePath: "/api/copilotkit",
  mode: "multi-route",
});

// Single-route: handles POST / with JSON envelope {method:"info"} used by ProxiedCopilotRuntimeAgent fallback
const singleRouteApp = createCopilotHonoHandler({
  runtime: runtime.instance,
  basePath: "/api/copilotkit",
  mode: "single-route",
});

const handleMultiRoute = handle(multiRouteApp);
const handleSingleRoute = handle(singleRouteApp);

export const GET = (req: NextRequest) => handleMultiRoute(req as unknown as Request);

export const POST = (req: NextRequest) => {
  const { pathname } = new URL(req.url);
  // Root POST → single-route (handles ProxiedCopilotRuntimeAgent fallback with JSON envelope)
  if (pathname === "/api/copilotkit" || pathname === "/api/copilotkit/") {
    return handleSingleRoute(req as unknown as Request);
  }
  // Sub-path POST → multi-route (handles /agent/{id}/run etc.)
  return handleMultiRoute(req as unknown as Request);
};
