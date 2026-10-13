import type { ErrorCode, Stage, WorkerRequest, WorkerResponse } from "./protocol";

export class TaskError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
  ) {
    super(code);
  }
}

export interface Progress {
  stage: Stage;
  done?: number;
  total?: number;
}

export interface Task<T> {
  promise: Promise<T>;
  /** Terminates the worker immediately; the promise rejects with code "cancelled". */
  cancel(): void;
}

type ResultOf<R extends WorkerResponse["type"]> = Extract<WorkerResponse, { type: R }>;

/**
 * Runs one request in a brand-new worker and terminates it when done, failed or cancelled.
 * The worker bundle (Mediabunny + GIF encoder) is only fetched the first time this runs.
 */
export function runTask<R extends WorkerResponse["type"]>(
  request: WorkerRequest,
  resultType: R,
  onProgress?: (p: Progress) => void,
): Task<ResultOf<R>> {
  let worker: Worker | null = null;
  let settle: ((fn: () => void) => void) | null = null;
  let rejectFn: ((e: TaskError) => void) | null = null;
  const promise = new Promise<ResultOf<R>>((resolve, reject) => {
    rejectFn = reject;
    let settled = false;
    let ready = false;
    settle = (fn) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      worker = null;
      fn();
    };
    try {
      worker = new Worker(new URL("../../workers/media.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      settle(() => reject(new TaskError("load_failed", String(e))));
      return;
    }
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.type === "ready") {
        ready = true;
        return;
      }
      if (msg.type === "progress") onProgress?.(msg);
      else if (msg.type === "error") settle!(() => reject(new TaskError(msg.code, msg.detail)));
      else if (msg.type === resultType) settle!(() => resolve(msg as ResultOf<R>));
    };
    worker.onerror = (ev) => {
      ev.preventDefault();
      // Before "ready" the script itself failed to load or evaluate.
      settle!(() => reject(new TaskError(ready ? "failed" : "load_failed", ev.message)));
    };
    worker.onmessageerror = () => settle!(() => reject(new TaskError("failed", "message error")));
    worker.postMessage(request);
  });
  return {
    promise,
    cancel: () => settle?.(() => rejectFn?.(new TaskError("cancelled"))),
  };
}
