import { createServerClient } from "@/lib/supabase/server";

export interface RetrievedChunk {
  id: string;
  content: string;
  chunkIndex: number;
}

/**
 * Retrieves relevant chunks for an objective.
 *
 * Strategy (Phase 2): keyword matching via ILIKE on key terms from the query.
 * A single query is issued; when keyword matching yields no rows the OR filter
 * is omitted and the first `topK` chunks by index are returned instead.
 *
 * Phase 3 upgrade: populate the `embedding` column during ingest (e.g. with
 * OpenAI text-embedding-3-small / Cohere embed-v3) and replace this with a
 * pgvector cosine-similarity query:
 *   .rpc("match_chunks", { query_embedding, match_count: topK, filter: { lesson_id } })
 */
export async function retrieveChunks(
  lessonId: string,
  queryText: string,
  topK = 5
): Promise<RetrievedChunk[]> {
  const supabase = createServerClient();

  // Extract meaningful keywords (>3 chars, deduplicated, max 6).
  const keywords = [
    ...new Set(
      queryText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    ),
  ].slice(0, 6);

  // Build base query once; conditionally attach the keyword OR filter.
  let query = supabase
    .from("chunks")
    .select("id, content, chunk_index")
    .eq("lesson_id", lessonId)
    .order("chunk_index")
    .limit(topK);

  if (keywords.length > 0) {
    query = query.or(keywords.map((kw) => `content.ilike.%${kw}%`).join(","));
  }

  const { data, error } = await query;

  // If keyword search returned nothing, fall back to first topK chunks.
  if (error || !data || data.length === 0) {
    if (keywords.length === 0) return [];

    const { data: fallback, error: fbErr } = await supabase
      .from("chunks")
      .select("id, content, chunk_index")
      .eq("lesson_id", lessonId)
      .order("chunk_index")
      .limit(topK);

    if (fbErr || !fallback) return [];
    return fallback.map((r) => ({
      id: r.id as string,
      content: r.content as string,
      chunkIndex: r.chunk_index as number,
    }));
  }

  return data.map((r) => ({
    id: r.id as string,
    content: r.content as string,
    chunkIndex: r.chunk_index as number,
  }));
}
