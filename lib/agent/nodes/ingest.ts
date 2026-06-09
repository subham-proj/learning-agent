import { createServerClient } from "@/lib/supabase/server";
import { AgentState } from "@/lib/agent/schemas";

/**
 * Ingest node: reads rawText already stored on state (uploaded via /api/ingest),
 * and persists chunk records to Supabase. Passes lessonId and chunkCount forward.
 */
export async function ingestNode(state: AgentState): Promise<Partial<AgentState>> {
  const { lessonId, rawText } = state;

  if (!lessonId || !rawText) {
    return { error: "Missing lessonId or rawText in state" };
  }

  const supabase = createServerClient();

  // Update lesson status
  const { error: updateErr } = await supabase
    .from("lessons")
    .update({ raw_text: rawText, status: "ingested" })
    .eq("id", lessonId);

  if (updateErr) return { error: updateErr.message };

  return { lessonId, rawText };
}
