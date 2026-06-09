import { ChatGroq } from "@langchain/groq";

export const GROQ_MODEL = "llama-3.3-70b-versatile";

/** Singleton Groq LLM configured for structured JSON output. */
export function createGroqClient() {
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY!,
    model: GROQ_MODEL,
    temperature: 0.3,
  });
}
