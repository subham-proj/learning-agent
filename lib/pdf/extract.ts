import { extractText } from "unpdf";

/**
 * Extracts all text from a PDF buffer.
 * Returns a single string with page breaks preserved via newlines.
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdf = await extractText(new Uint8Array(buffer), { mergePages: true });
  return pdf.text.trim();
}
