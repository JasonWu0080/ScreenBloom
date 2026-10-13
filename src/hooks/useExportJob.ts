"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditParams, OutputFormat, SourceInfo } from "@/lib/edit/types";
import type { ErrorCode } from "@/lib/jobs/protocol";
import { TaskError, runTask, type Progress, type Task } from "@/lib/jobs/worker-client";

export interface ExportedFile {
  format: OutputFormat;
  mimeType: string;
  url: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  frames: number;
  gifLoop: number;
  /** Identifies the edit (all params except format) this result was made from. */
  editKey: string;
}

export type JobState =
  | { status: "idle" }
  | { status: "running"; format: OutputFormat; progress: Progress | null; startedAt: number }
  | { status: "error"; format: OutputFormat; code: ErrorCode; detail?: string };

/** Everything that affects the picture, i.e. the edit regardless of the chosen format. */
export function editKey(p: EditParams): string {
  return JSON.stringify({ ...p, format: null });
}

/**
 * Runs exports in a dedicated worker and owns the resulting object URLs. Each run uses a
 * fresh worker; cancel terminates it immediately. Results are revoked when replaced,
 * cleared, or when the component unmounts.
 */
export function useExportJob() {
  const [job, setJob] = useState<JobState>({ status: "idle" });
  const [results, setResults] = useState<Partial<Record<OutputFormat, ExportedFile>>>({});
  const taskRef = useRef<Task<unknown> | null>(null);
  const resultsRef = useRef(results);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const start = useCallback(async (file: File, params: EditParams, source: SourceInfo): Promise<ExportedFile | null> => {
    taskRef.current?.cancel();
    const format = params.format;
    setJob({ status: "running", format, progress: null, startedAt: performance.now() });
    const task = runTask({ type: "export", file, params, source }, "export-result", (progress) => {
      if (taskRef.current === task) setJob((j) => (j.status === "running" ? { ...j, progress } : j));
    });
    taskRef.current = task;
    try {
      const { result } = await task.promise;
      if (taskRef.current !== task) return null;
      const blob = new Blob([result.bytes], { type: result.mimeType });
      const file: ExportedFile = {
        format: result.format,
        mimeType: result.mimeType,
        url: URL.createObjectURL(blob),
        size: blob.size,
        width: result.width,
        height: result.height,
        duration: result.duration,
        frames: result.frames,
        gifLoop: params.gifLoop,
        editKey: editKey(params),
      };
      setResults((prev) => {
        const old = prev[format];
        if (old) URL.revokeObjectURL(old.url);
        // A result from a different edit must not be shown next to this one.
        const other = prev[format === "gif" ? "mp4" : "gif"];
        const next: Partial<Record<OutputFormat, ExportedFile>> = { [format]: file };
        if (other) {
          if (other.editKey === file.editKey) next[other.format] = other;
          else URL.revokeObjectURL(other.url);
        }
        return next;
      });
      setJob({ status: "idle" });
      return file;
    } catch (e) {
      if (taskRef.current !== task) return null;
      const err = e instanceof TaskError ? e : new TaskError("failed", String(e));
      setJob(err.code === "cancelled" ? { status: "idle" } : { status: "error", format, code: err.code, detail: err.detail });
      return null;
    } finally {
      if (taskRef.current === task) taskRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    taskRef.current?.cancel();
  }, []);

  const dismissError = useCallback(() => setJob((j) => (j.status === "error" ? { status: "idle" } : j)), []);

  /** Drops results that no longer match the current edit (or all, with no key). */
  const pruneResults = useCallback((keepKey?: string) => {
    setResults((prev) => {
      const next: Partial<Record<OutputFormat, ExportedFile>> = {};
      let changed = false;
      for (const r of Object.values(prev)) {
        if (keepKey && r.editKey === keepKey) next[r.format] = r;
        else {
          URL.revokeObjectURL(r.url);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const reset = useCallback(() => {
    taskRef.current?.cancel();
    taskRef.current = null;
    pruneResults();
    setJob({ status: "idle" });
  }, [pruneResults]);

  useEffect(
    () => () => {
      taskRef.current?.cancel();
      for (const r of Object.values(resultsRef.current)) URL.revokeObjectURL(r.url);
    },
    [],
  );

  return { job, results, start, cancel, dismissError, pruneResults, reset };
}
