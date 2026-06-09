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
        "relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 transition-colors cursor-pointer select-none",
        dragging && "border-violet-500 bg-violet-50",
        !dragging && state === "idle" && "border-zinc-200 bg-zinc-50 hover:border-violet-400 hover:bg-violet-50/50",
        state === "done" && "border-emerald-300 bg-emerald-50 cursor-default",
        state === "error" && "border-red-300 bg-red-50 cursor-default",
        isLoading && "border-violet-300 bg-violet-50 cursor-not-allowed",
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
          <Upload className="h-10 w-10 text-violet-400" />
          <div className="text-center">
            <p className="font-semibold text-zinc-700">Drop your PDF here</p>
            <p className="text-sm text-zinc-400 mt-1">or click to browse</p>
          </div>
        </>
      )}

      {isLoading && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
          <p className="font-medium text-violet-700">
            {state === "uploading" ? "Uploading…" : "Extracting text…"}
          </p>
          {fileName && <p className="text-sm text-zinc-500">{fileName}</p>}
        </>
      )}

      {state === "done" && (
        <>
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <div className="text-center">
            <p className="font-semibold text-emerald-700">PDF processed</p>
            <p className="text-sm text-zinc-500 mt-1">{fileName}</p>
          </div>
        </>
      )}

      {state === "error" && (
        <>
          <AlertCircle className="h-10 w-10 text-red-500" />
          <div className="text-center">
            <p className="font-semibold text-red-700">Something went wrong</p>
            <p className="text-sm text-red-400 mt-1">{errorMsg}</p>
            <button
              onClick={(e) => { e.stopPropagation(); setState("idle"); setErrorMsg(""); }}
              className="mt-3 text-xs text-violet-600 underline"
            >
              Try again
            </button>
          </div>
        </>
      )}

      {state === "idle" && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <FileText className="h-3.5 w-3.5" />
          <span>PDF files only</span>
        </div>
      )}
    </div>
  );
}
