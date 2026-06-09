"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IngestResult } from "@/lib/agent/schemas";

type UploadState = "idle" | "uploading" | "parsing" | "done" | "error";

interface PdfUploaderProps {
  userId: string;
  onComplete: (result: IngestResult) => void;
}

export function PdfUploader({ userId, onComplete }: PdfUploaderProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File) {
    if (file.type !== "application/pdf") {
      setErrorMsg("Please upload a PDF file.");
      setState("error");
      return;
    }

    setFileName(file.name);
    setState("uploading");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", userId);

    try {
      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      setState("parsing");
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? "Upload failed");
      }
      const result: IngestResult = await res.json();
      setState("done");
      onComplete(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  const isLoading = state === "uploading" || state === "parsing";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload PDF"
      onClick={() => !isLoading && inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && !isLoading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed p-14",
        "cursor-pointer select-none transition-all duration-300 glass",
        dragging && [
          "border-primary bg-primary/5 dark:bg-primary/10",
          "scale-[1.01] shadow-[0_0_32px_oklch(0.558_0.234_293.7_/_20%)]",
        ],
        !dragging && state === "idle" && [
          "border-border bg-card/60 dark:bg-card/40",
          "hover:border-primary/50 hover:bg-primary/[0.03] hover:shadow-md",
        ],
        state === "done" && [
          "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20",
          "shadow-[0_0_24px_oklch(0.623_0.194_149.6_/_12%)]",
          "cursor-default",
        ],
        state === "error" && "border-destructive/40 bg-destructive/5 cursor-default",
        isLoading && "border-primary/30 bg-primary/5 cursor-not-allowed",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={onChange}
        aria-hidden
      />

      {state === "idle" && (
        <>
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl scale-150 pointer-events-none" />
            <div className="relative h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20
                            flex items-center justify-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-base font-semibold text-foreground">Drop your PDF here</p>
            <p className="text-sm text-muted-foreground">or click to browse · PDF files only</p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border
                          bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>PDF files only · up to 20 MB</span>
          </div>
        </>
      )}

      {isLoading && (
        <>
          <div className="relative h-14 w-14">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20
                            border-t-primary animate-spin" />
            <div className="absolute inset-2 rounded-full bg-primary/10
                            flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-foreground">
              {state === "uploading" ? "Uploading your PDF…" : "Extracting & indexing…"}
            </p>
            {fileName && (
              <p className="text-sm text-muted-foreground font-mono truncate max-w-48">{fileName}</p>
            )}
          </div>
        </>
      )}

      {state === "done" && (
        <>
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <div className="text-center">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">PDF processed</p>
            <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
          </div>
        </>
      )}

      {state === "error" && (
        <>
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div className="text-center">
            <p className="font-semibold text-destructive">Something went wrong</p>
            <p className="text-sm text-destructive/80 mt-1">{errorMsg}</p>
            <button
              onClick={(e) => { e.stopPropagation(); setState("idle"); setErrorMsg(""); }}
              className="mt-3 text-xs text-primary underline"
            >
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  );
}
