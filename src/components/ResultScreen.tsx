"use client";

import { Button, Notice } from "@/components/ui";
import type { ExportedFile, JobState } from "@/hooks/useExportJob";
import { LIMITS } from "@/lib/config";
import type { OutputFormat } from "@/lib/edit/types";
import { downloadName, formatBytes, formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { ExportBar } from "./editor/ExportBar";

/** Shows the actual exported file (never the source) with its real measured properties. */
export function ResultScreen({
  result,
  other,
  sourceName,
  job,
  canExportOther,
  onBack,
  onShow,
  onExportOther,
  onCancel,
  onDismiss,
}: {
  result: ExportedFile;
  other: ExportedFile | undefined;
  sourceName: string;
  job: JobState;
  canExportOther: boolean;
  onBack: () => void;
  onShow: (f: OutputFormat) => void;
  onExportOther: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const otherFormat: OutputFormat = result.format === "gif" ? "mp4" : "gif";
  const label = (f: OutputFormat) => (f === "gif" ? "GIF" : t("formatMp4"));
  const name = downloadName(sourceName, result.format, result.width, result.height);
  const running = job.status === "running";

  return (
    <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-h-[50vh] items-center justify-center overflow-hidden bg-stage p-4 sm:p-6 lg:min-h-0">
        {result.format === "gif" ? (
          // eslint-disable-next-line @next/next/no-img-element -- must show the exact exported bytes, unoptimized
          <img src={result.url} alt={t("result")} data-testid="result-preview" className="max-h-full max-w-full object-contain" style={{ imageRendering: "auto" }} />
        ) : (
          <video src={result.url} data-testid="result-preview" className="max-h-full max-w-full" controls autoPlay loop muted playsInline />
        )}
      </div>

      <aside className="flex flex-col gap-4 border-line bg-surface px-4 py-5 sm:px-5 lg:overflow-y-auto lg:border-l">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold">{t("result")}</h1>
          {other && (
            <div className="flex gap-1">
              {(["gif", "mp4"] as const).map((f) => (
                <Button key={f} size="sm" variant={f === result.format ? "primary" : "secondary"} onClick={() => onShow(f)}>
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          )}
        </div>

        <dl className="tnum grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-testid="result-info">
          <dt className="text-ink-3">{t("resultFormat")}</dt>
          <dd className="text-right font-medium">{label(result.format)}</dd>
          <dt className="text-ink-3">{t("resultSize")}</dt>
          <dd className="text-right font-medium">
            {result.width} × {result.height}
          </dd>
          <dt className="text-ink-3">{t("resultDuration")}</dt>
          <dd className="text-right font-medium">{formatDuration(result.duration)}</dd>
          <dt className="text-ink-3">{t("resultFrames")}</dt>
          <dd className="text-right font-medium">{result.frames}</dd>
          {result.format === "gif" && (
            <>
              <dt className="text-ink-3">{t("loopInfo")}</dt>
              <dd className="text-right font-medium">{result.gifLoop === 0 ? t("loopForever") : t("loopTimes", { n: result.gifLoop })}</dd>
            </>
          )}
          <dt className="text-ink-3">{t("resultFileSize")}</dt>
          <dd className="text-right text-base font-semibold" data-testid="result-size">
            {formatBytes(result.size)}
          </dd>
        </dl>

        {result.format === "gif" && result.size > LIMITS.largeGifBytes && <Notice tone="warn">{t("largeGifHint")}</Notice>}

        <a
          href={result.url}
          download={name}
          data-testid="download"
          className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-[15px] font-medium text-white hover:bg-accent-hover"
        >
          {t("download")}
        </a>
        <Button size="lg" onClick={onBack} disabled={running}>
          {t("backToEdit")}
        </Button>

        <div className="border-t border-line pt-4">
          {other ? (
            <Button className="w-full" onClick={() => onShow(otherFormat)}>
              {t("showResult", { format: label(otherFormat) })}
            </Button>
          ) : running || job.status === "error" ? (
            <ExportBar format={otherFormat} job={job} issues={[]} mp4Blocked={!canExportOther} frames={0} onExport={onExportOther} onCancel={onCancel} onDismiss={onDismiss} />
          ) : (
            <Button className="w-full" onClick={onExportOther} disabled={!canExportOther}>
              {t("alsoExport", { format: label(otherFormat) })}
            </Button>
          )}
        </div>
        <p className="text-xs leading-relaxed text-ink-3">{t("resultLocal")}</p>
      </aside>
    </main>
  );
}
