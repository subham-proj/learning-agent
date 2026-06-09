import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

// TODO(auth): replace userId query param with server-session userId in production.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("userId");
  const parsed = z.string().uuid().safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId must be a valid UUID" }, { status: 400 });
  }
  const userId = parsed.data;

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("lessons")
    .select(`
      id,
      title,
      status,
      created_at,
      completed_at,
      reports (overall_score)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lessons = (data ?? []).map((l) => ({
    id: l.id as string,
    title: (l.title as string) ?? "Untitled Lesson",
    status: l.status as string,
    createdAt: l.created_at as string,
    completedAt: l.completed_at as string | null,
    overallScore: Array.isArray(l.reports) && l.reports.length > 0
      ? Number((l.reports[0] as { overall_score: number }).overall_score)
      : null,
  }));

  return NextResponse.json({ lessons });
}
