"use client";

import { useEffect, useState } from "react";
import { TaskError, runTask } from "@/lib/jobs/worker-client";

export type LocalSupport = "ok" | "insecure" | "unsupported";

/** Synchronous check for the APIs local processing depends on. WebCodecs only exist in secure contexts. */
export function localProcessingSupport(): LocalSupport {
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  return typeof Worker !== "undefined" && typeof VideoDecoder !== "undefined" && typeof OffscreenCanvas !== "undefined" ? "ok" : "unsupported";
}

export type Mp4Support = "checking" | "yes" | "no";

/** Detects real H.264 encoding support inside a worker, once the editor is shown. */
export function useMp4Support(enabled: boolean): Mp4Support {
  const [state, setState] = useState<Mp4Support>("checking");
  useEffect(() => {
    if (!enabled || state !== "checking") return;
    const task = runTask({ type: "capabilities" }, "capabilities-result");
    task.promise.then(
      (r) => setState(r.caps.mp4 ? "yes" : "no"),
      (e) => {
        if (!(e instanceof TaskError && e.code === "cancelled")) setState("no");
      },
    );
    return () => task.cancel();
  }, [enabled, state]);
  return state;
}
