"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LIMITS } from "@/lib/config";
import type { SourceInfo } from "@/lib/edit/types";
import type { ErrorCode } from "@/lib/jobs/protocol";
import { TaskError, runTask, type Task } from "@/lib/jobs/worker-client";

export interface LoadedSource {
  file: File;
  info: SourceInfo;
  /** Object URL for the <video> preview. Revoked when the source is replaced or unmounted. */
  url: string;
}

export type SourceState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | { status: "error"; code: ErrorCode; detail?: string }
  | { status: "ready"; source: LoadedSource };

/** Opens a file: validates it by really demuxing and decoding in a worker, then exposes it. */
export function useSourceLoader() {
  const [state, setState] = useState<SourceState>({ status: "idle" });
  const taskRef = useRef<Task<unknown> | null>(null);
  const urlRef = useRef<string | null>(null);

  const releaseUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  const load = useCallback(async (file: File): Promise<LoadedSource | null> => {
    taskRef.current?.cancel();
    releaseUrl();
    if (file.size > LIMITS.maxFileBytes) {
      setState({ status: "error", code: "source_too_large" });
      return null;
    }
    setState({ status: "loading", fileName: file.name });
    const task = runTask({ type: "probe", file }, "probe-result");
    taskRef.current = task;
    try {
      const { info } = await task.promise;
      if (taskRef.current !== task) return null;
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      const source = { file, info, url };
      setState({ status: "ready", source });
      return source;
    } catch (e) {
      if (taskRef.current !== task) return null;
      const err = e instanceof TaskError ? e : new TaskError("unreadable", String(e));
      if (err.code !== "cancelled") setState({ status: "error", code: err.code, detail: err.detail });
      return null;
    } finally {
      if (taskRef.current === task) taskRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    taskRef.current?.cancel();
    taskRef.current = null;
    releaseUrl();
    setState({ status: "idle" });
  }, []);

  useEffect(
    () => () => {
      taskRef.current?.cancel();
      releaseUrl();
    },
    [],
  );

  return { state, load, reset };
}
