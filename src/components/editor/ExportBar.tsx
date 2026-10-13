"use client";

import { useEffect, useState } from "react";
import { ErrorDetails, errorText } from "@/components/errors";
import { Button, Notice } from "@/components/ui";
import type { JobState } from "@/hooks/useExportJob";
import type { LimitIssue } from "@/lib/edit/params";
import type { OutputFormat } from "@/lib/edit/types";
import { isRetryable } from "@/lib/jobs/protocol";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/I18nProvider";

function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (since == null) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [since]);
  return since == null ? 0 : Math.max(0, (now - since) / 1000);
}

export function ExportBar({
  format,
  job,
  issues,
  mp4Blocked,
  frames,
  onExport,
  onCancel,
  onDismiss,
}: {
  format: OutputFormat;
  job: JobState;
  issues: LimitIssue[];
  mp4Blocked: boolean;
  frames: number;
  onExport: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const running = job.status === "running";
  const elapsed = useElapsed(running ? job.startedAt : null);
  const fmtLabel = format === "gif" ? "GIF" : "MP4";

  if (running) {
    const p = job.progress;
    const hasPct = p?.total != null && p.done != null && p.total > 0;
    const pct = hasPct ? Math.round((p!.done! / p!.total!) * 100) : null;
    return (
      <div className="space-y-2.5" aria-live="polite">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-ink">{t(`stage_${p?.stage ?? "opening"}`)}</span>
          <span className="tnum text-xs text-ink-3">{pct != null ? `${pct}%` : ""}</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
          aria-label={t(`stage_${p?.stage ?? "opening"}`)}
        >
          {pct != null ? (
            <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
          ) : (
            // No reliable percentage in this stage: show an indeterminate state, not a fake number.
            <div className="h-full w-1/4 animate-pulse rounded-full bg-accent/50" />
          )}
        </div>
        <div className="tnum flex justify-between text-xs text-ink-3">
          <span>{p?.stage === "encoding" && hasPct ? t("frameProgress", { done: p!.done!, total: p!.total! }) : " "}</span>
          <span>{t("elapsed", { t: formatDuration(elapsed) })}</span>
        </div>
        <Button className="w-full" onClick={onCancel}>
          {t("cancelExport")}
        </Button>
      </div>
    );
  }

  const blocked = issues.length > 0 || (format === "mp4" && mp4Blocked);
  return (
    <div className="space-y-2.5">
      {job.status === "error" && (
        <div className="rounded-md border border-[#f3cdc6] bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger" role="alert">
          <div className="flex items-start justify-between gap-2">
            <span>{errorText(t, job.code, job.detail)}</span>
            <button type="button" onClick={onDismiss} className="shrink-0 text-ink-3 hover:text-ink" aria-label={t("dismiss")}>
              ×
            </button>
          </div>
          <ErrorDetails t={t} detail={job.code === "unsupported_codec" ? undefined : job.detail} />
        </div>
      )}
      {issues.map((i) => (
        <Notice key={i.kind} tone="warn">
          {i.kind === "duration"
            ? t("limitDuration", { actual: formatDuration(i.actual), max: formatDuration(i.max), format: fmtLabel })
            : t("limitFrames", { actual: i.actual, max: i.max })}
        </Notice>
      ))}
      <Button variant="primary" size="lg" className="w-full" disabled={blocked} onClick={onExport}>
        {job.status === "error" && isRetryable(job.code) ? `${t("retry")} · ` : ""}
        {format === "gif" ? t("exportGif") : t("exportMp4")}
      </Button>
      <p className="text-center text-[11px] leading-relaxed text-ink-3">
        {format === "gif" ? `${t("estFrames", { n: frames })} · ` : ""}
        {t("sizeAfterExport")}
      </p>
    </div>
  );
}
