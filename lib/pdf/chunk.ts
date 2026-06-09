/** Rough token estimate: 1 token ≈ 4 characters */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface TextChunk {
  content: string;
  tokenCount: number;
  chunkIndex: number;
}

/**
 * Splits text into overlapping chunks.
 * Defaults: ~800 tokens per chunk, 100-token overlap.
 */
export function chunkText(
  text: string,
  targetTokens = 800,
  overlapTokens = 100
): TextChunk[] {
  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + targetChars, text.length);
    const content = text.slice(start, end).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        tokenCount: estimateTokens(content),
        chunkIndex: index++,
      });
    }

    if (end === text.length) break;
    start = end - overlapChars;
  }

  return chunks;
}
