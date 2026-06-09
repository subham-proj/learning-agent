import { createServerClient } from "@/lib/supabase/server";

export interface RetrievedChunk {
  id: string;
  content: string;
  chunkIndex: number;
}

/**
 * Retrieves relevant chunks for an objective.
 *
 * Strategy (Phase 2): keyword matching via ILIKE on key terms from the query,
 * falling back to the first `topK` chunks by index when no matches found.
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

  if (keywords.length > 0) {
    // Build OR filter: content ilike %keyword%
    const orFilter = keywords.map((kw) => `content.ilike.%${kw}%`).join(",");

    const { data, error } = await supabase
      .from("chunks")
      .select("id, content, chunk_index")
      .eq("lesson_id", lessonId)
      .or(orFilter)
      .order("chunk_index")
      .limit(topK);

    if (!error && data && data.length > 0) {
      return data.map((r) => ({
        id: r.id as string,
        content: r.content as string,
        chunkIndex: r.chunk_index as number,
      }));
    }
  }

  // Fallback: return first topK chunks in order.
  const { data, error } = await supabase
    .from("chunks")
    .select("id, content, chunk_index")
    .eq("lesson_id", lessonId)
    .order("chunk_index")
    .limit(topK);

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id as string,
    content: r.content as string,
    chunkIndex: r.chunk_index as number,
  }));
}
