"use client";

import { useMemo, useState } from "react";
import type { Mp4Support } from "@/hooks/useCapabilities";
import type { JobState } from "@/hooks/useExportJob";
import { usePlayback } from "@/hooks/usePlayback";
import type { LoadedSource } from "@/hooks/useSourceLoader";
import { aspectRatio } from "@/lib/edit/crop";
import { checkLimits } from "@/lib/edit/params";
import { planGifFrames, totalOutputDuration } from "@/lib/edit/timeline";
import type { AspectId, EditParams, PresetId, Rect } from "@/lib/edit/types";
import { formatBytes, formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { ExportBar } from "./ExportBar";
import { PreviewStage } from "./PreviewStage";
import { SettingsPanel } from "./SettingsPanel";
import { Timeline } from "./Timeline";

export function EditorScreen({
  source,
  params,
  job,
  mp4Support,
  onChange,
  onPreset,
  onAspect,
  onCrop,
  onCropField,
  onResetCrop,
  onExport,
  onCancel,
  onDismiss,
}: {
  source: LoadedSource;
  params: EditParams;
  job: JobState;
  mp4Support: Mp4Support;
  onChange: (fn: (p: EditParams) => EditParams) => void;
  onPreset: (id: PresetId) => void;
  onAspect: (a: AspectId) => void;
  onCrop: (r: Rect) => void;
  onCropField: (field: keyof Rect, value: number) => void;
  onResetCrop: () => void;
  onExport: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const info = source.info;
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [loop, setLoop] = useState(true);
  const playback = usePlayback(video, { start: params.start, end: params.end, speed: params.speed, loop });
  const busy = job.status === "running";
  const issues = useMemo(() => checkLimits(params), [params]);
  const frames = useMemo(() => (params.format === "gif" ? planGifFrames(params).length : 0), [params]);
  const ratio = aspectRatio(params.aspect, info.width, info.height);

  return (
    <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="h-[56vw] max-h-[62vh] min-h-[220px] lg:h-auto lg:max-h-none lg:min-h-0 lg:flex-1">
          <PreviewStage
            url={source.url}
            sourceW={info.width}
            sourceH={info.height}
            crop={params.crop}
            ratio={ratio}
            onCrop={onCrop}
            onVideo={setVideo}
            disabled={busy}
            cropLabel={t("crop")}
            unavailableText={t("previewUnavailable")}
          />
        </div>
        <Timeline
          duration={info.duration}
          start={params.start}
          end={params.end}
          current={playback.current}
          playing={playback.playing}
          loop={loop}
          outputDuration={totalOutputDuration(params)}
          disabled={busy}
          onRange={(start, end) => onChange((p) => ({ ...p, start, end }))}
          onSeek={playback.seek}
          onPlay={playback.play}
          onPause={playback.pause}
          onLoop={setLoop}
        />
      </div>

      <aside className="flex min-h-0 flex-col border-line bg-surface lg:border-l">
        <div className="min-h-0 flex-1 lg:overflow-y-auto">
          <div className="tnum border-b border-line px-4 py-3 text-xs leading-relaxed text-ink-3 sm:px-5" data-testid="source-info">
            <div className="truncate font-medium text-ink-2" title={info.fileName}>
              {info.fileName}
            </div>
            <div>
              {info.width} × {info.height} · {formatDuration(info.duration)} · {info.averageFps ? `${Math.round(info.averageFps * 10) / 10} fps · ` : ""}
              {formatBytes(info.fileSize)} · {info.container} / {info.codec.toUpperCase()}
            </div>
            {info.rotation !== 0 && <div>{t("rotated", { deg: info.rotation })}</div>}
          </div>
          <SettingsPanel
            params={params}
            source={info}
            mp4Support={mp4Support}
            disabled={busy}
            onChange={onChange}
            onPreset={onPreset}
            onAspect={onAspect}
            onCropField={onCropField}
            onResetCrop={onResetCrop}
          />
        </div>
        <div className="border-t border-line px-4 py-4 sm:px-5 lg:sticky lg:bottom-0">
          <ExportBar
            format={params.format}
            job={job}
            issues={issues}
            mp4Blocked={mp4Support !== "yes"}
            frames={frames}
            onExport={() => {
              playback.pause();
              onExport();
            }}
            onCancel={onCancel}
            onDismiss={onDismiss}
          />
        </div>
      </aside>
    </main>
  );
}
