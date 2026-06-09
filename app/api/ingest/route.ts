import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/pdf/extract";
import { chunkText } from "@/lib/pdf/chunk";

const ResponseSchema = z.object({
  lessonId: z.string(),
  fileUrl: z.string(),
  rawText: z.string(),
  chunkCount: z.number(),
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const userId = formData.get("userId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "No userId provided" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 413 });
    }

    const supabase = createServerClient();

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const storagePath = `${userId}/${Date.now()}_${file.name}`;

    const { data: storageData, error: storageErr } = await supabase.storage
      .from("pdfs")
      .upload(storagePath, fileBuffer, { contentType: "application/pdf" });

    if (storageErr) {
      return NextResponse.json({ error: storageErr.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("pdfs")
      .getPublicUrl(storageData.path);
    const fileUrl = urlData.publicUrl;

    // Extract and chunk text
    const rawText = await extractPdfText(fileBuffer);
    const chunks = chunkText(rawText);

    // Insert lesson row
    const { data: lesson, error: lessonErr } = await supabase
      .from("lessons")
      .insert({ user_id: userId, file_url: fileUrl, raw_text: rawText, status: "uploaded" })
      .select("id")
      .single();

    if (lessonErr || !lesson) {
      return NextResponse.json({ error: lessonErr?.message ?? "Insert failed" }, { status: 500 });
    }

    // Insert chunks (no embeddings in Phase 1)
    const chunkRows = chunks.map((c) => ({
      lesson_id: lesson.id,
      user_id: userId,
      content: c.content,
      token_count: c.tokenCount,
      chunk_index: c.chunkIndex,
    }));

    const { error: chunkErr } = await supabase.from("chunks").insert(chunkRows);
    if (chunkErr) {
      return NextResponse.json({ error: chunkErr.message }, { status: 500 });
    }

    const result = ResponseSchema.parse({
      lessonId: lesson.id,
      fileUrl,
      rawText,
      chunkCount: chunks.length,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
