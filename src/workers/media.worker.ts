/// <reference lib="webworker" />
// All decoding and encoding happens here, off the main thread. Each job gets a fresh worker
// that is terminated afterwards (or on cancel), so no state leaks between jobs.
import { checkLimits, normalizeParams } from "@/lib/edit/params";
import { exportClip } from "@/lib/encode/export";
import { JobError, classifyError } from "@/lib/media/errors";
import { detectCapabilities, probeFile } from "@/lib/media/probe";
import type { WorkerRequest, WorkerResponse } from "@/lib/jobs/protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

let lastProgress = 0;

scope.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    if (typeof VideoDecoder === "undefined" || typeof OffscreenCanvas === "undefined") {
      post({ type: "error", code: "browser_unsupported" });
      return;
    }
    if (req.type === "probe") {
      post({ type: "probe-result", info: await probeFile(req.file) });
    } else if (req.type === "capabilities") {
      post({ type: "capabilities-result", caps: await detectCapabilities() });
    } else if (req.type === "export") {
      // Apply the same rules as the UI to the snapshot, so invalid values never reach the encoders.
      const params = normalizeParams(req.params, req.source);
      const issues = checkLimits(params);
      if (issues.length) throw new JobError("failed", issues.map((i) => `${i.kind} ${i.actual} > ${i.max}`).join("; "));
      const result = await exportClip(req.file, params, (stage, done, total) => {
        // Throttle progress messages; always send stage changes and completion.
        const now = performance.now();
        if (done !== undefined && done !== total && done !== 0 && now - lastProgress < 80) return;
        lastProgress = now;
        post({ type: "progress", stage, done, total });
      });
      post({ type: "export-result", result }, [result.bytes]);
    }
  } catch (e) {
    const { code, detail } = classifyError(e, req.type === "export" ? "failed" : "unreadable");
    post({ type: "error", code, detail });
  }
};

post({ type: "ready" });
