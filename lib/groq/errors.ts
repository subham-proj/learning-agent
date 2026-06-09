/**
 * Parses an error thrown by the Groq client and returns a user-friendly message.
 *
 * Groq rate-limit errors have this shape:
 *   "429 {"error":{"message":"Rate limit reached...Please try again in 11m48.48s.","code":"rate_limit_exceeded"}}"
 *
 * All other errors fall back to the raw message so we don't swallow useful
 * diagnostic info in non-rate-limit cases.
 */
export function friendlyGroqError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw.startsWith("429") || raw.includes("rate_limit_exceeded")) {
    const retryMatch = raw.match(/try again in ([\d]+m[\d.]+s)/i);
    const retryHint = retryMatch
      ? ` Please try again in ${retryMatch[1]}.`
      : " Please try again in a few minutes.";
    return `AI rate limit reached.${retryHint}`;
  }

  return raw || "An unexpected error occurred.";
}

/** Returns true when the error is a Groq 429 rate-limit response. */
export function isRateLimitError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.startsWith("429") || raw.includes("rate_limit_exceeded");
}
