"use client";

import { useRef } from "react";
import { Button, CommitInput } from "@/components/ui";
import { LIMITS } from "@/lib/config";
import { formatDuration, formatTime, parseTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/I18nProvider";

type DragKind = "start" | "end" | "seek";

export function Timeline({
  duration,
  start,
  end,
  current,
  playing,
  loop,
  outputDuration,
  disabled,
  onRange,
  onSeek,
  onPlay,
  onPause,
  onLoop,
}: {
  duration: number;
  start: number;
  end: number;
  current: number;
  playing: boolean;
  loop: boolean;
  outputDuration: number;
  disabled?: boolean;
  onRange: (start: number, end: number) => void;
  onSeek: (t: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onLoop: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragKind | null>(null);
  const minClip = Math.min(LIMITS.minClipSeconds, duration);
  const pct = (v: number) => `${(Math.min(duration, Math.max(0, v)) / duration) * 100}%`;

  const timeAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
  };

  const setStart = (v: number) => {
    const s = Math.max(0, Math.min(v, end - minClip));
    onRange(s, end);
    return s;
  };
  const setEnd = (v: number) => {
    const e = Math.min(duration, Math.max(v, start + minClip));
    onRange(start, e);
    return e;
  };

  const apply = (kind: DragKind, x: number) => {
    const v = timeAt(x);
    if (kind === "start") onSeek(setStart(v));
    else if (kind === "end") onSeek(setEnd(v));
    else onSeek(v);
  };

  const down = (e: React.PointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0) return;
    const kind = (e.currentTarget.dataset.kind ?? "seek") as DragKind;
    e.preventDefault();
    e.stopPropagation();
    if (playing) onPause();
    trackRef.current!.setPointerCapture(e.pointerId);
    drag.current = kind;
    apply(kind, e.clientX);
  };
  const move = (e: React.PointerEvent) => {
    if (drag.current) apply(drag.current, e.clientX);
  };
  const up = () => {
    drag.current = null;
  };

  const keyHandle = (e: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const kind = e.currentTarget.dataset.kind as "start" | "end";
    const step = e.shiftKey ? 1 : 0.1;
    const delta = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : e.key === "ArrowRight" || e.key === "ArrowUp" ? step : 0;
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const target = e.key === "Home" ? 0 : duration;
      onSeek(kind === "start" ? setStart(target) : setEnd(target));
      return;
    }
    if (!delta) return;
    e.preventDefault();
    onSeek(kind === "start" ? setStart(start + delta) : setEnd(end + delta));
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="space-y-3 border-t border-line bg-surface px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={playing ? onPause : onPlay} disabled={disabled} className="min-w-[96px]">
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <rect x="2" y="1.5" width="3" height="9" rx="0.5" fill="currentColor" />
              <rect x="7" y="1.5" width="3" height="9" rx="0.5" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 1.8v8.4c0 .4.4.6.7.4l6.6-4.2a.5.5 0 0 0 0-.8L3.7 1.4c-.3-.2-.7 0-.7.4Z" fill="currentColor" />
            </svg>
          )}
          {playing ? t("pause") : t("play")}
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={loop} onChange={(e) => onLoop(e.target.checked)} className="accent-[var(--accent)]" />
          {t("loopPreview")}
        </label>
        <span className="tnum ml-auto text-xs text-ink-3" aria-label={t("playhead")}>
          {formatTime(current, 2)} / {formatTime(duration, 2)}
        </span>
      </div>

      {/* Track */}
      <div className="px-2">
        <div
          ref={trackRef}
          className={`relative h-10 touch-none select-none ${disabled ? "opacity-60" : "cursor-pointer"}`}
          data-kind="seek"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-surface-2 ring-1 ring-line" />
          <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-accent/80" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />
          {/* playhead */}
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink" style={{ left: pct(current) }}>
            <div className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-ink" />
          </div>
          {(["start", "end"] as const).map((kind) => {
            const v = kind === "start" ? start : end;
            return (
              <div
                key={kind}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label={kind === "start" ? t("startHandle") : t("endHandle")}
                aria-valuemin={0}
                aria-valuemax={Math.round(duration * 100) / 100}
                aria-valuenow={Math.round(v * 100) / 100}
                aria-valuetext={formatTime(v, 2)}
                data-kind={kind}
                onPointerDown={down}
                onKeyDown={keyHandle}
                className="absolute top-1/2 z-10 flex h-8 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-[4px] border border-accent bg-surface shadow-sm"
                style={{ left: pct(v) }}
              >
                <div className="h-3.5 w-0.5 rounded bg-accent" />
              </div>
            );
          })}
        </div>
        <div className="tnum relative mt-0.5 h-4 text-[10px] text-ink-3">
          {ticks.map((f) => (
            <span key={f} className="absolute -translate-x-1/2" style={{ left: `${f * 100}%`, transform: f === 0 ? "none" : f === 1 ? "translateX(-100%)" : undefined }}>
              {formatTime(duration * f, 1)}
            </span>
          ))}
        </div>
      </div>

      {/* Exact inputs */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-[auto_auto_1fr] sm:items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-2" htmlFor="clip-start">
            {t("start")}
          </label>
          <div className="flex gap-1.5">
            <CommitInput id="clip-start" className="w-24" value={start} format={(v) => formatTime(v, 2)} parse={parseTime} onCommit={(v) => onSeek(setStart(v))} disabled={disabled} />
            <Button size="sm" className="h-8" onClick={() => setStart(current)} disabled={disabled || current >= end - minClip} title={t("setStart")}>
              {t("setStart")}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-2" htmlFor="clip-end">
            {t("end")}
          </label>
          <div className="flex gap-1.5">
            <CommitInput id="clip-end" className="w-24" value={end} format={(v) => formatTime(v, 2)} parse={parseTime} onCommit={(v) => onSeek(setEnd(v))} disabled={disabled} />
            <Button size="sm" className="h-8" onClick={() => setEnd(current)} disabled={disabled || current <= start + minClip} title={t("setEnd")}>
              {t("setEnd")}
            </Button>
          </div>
        </div>
        <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 sm:col-span-1 sm:justify-end sm:pb-2">
          <span>
            {t("selection")} <b className="tnum font-semibold text-ink">{formatDuration(end - start)}</b>
          </span>
          <span>
            {t("outputLength")} <b className="tnum font-semibold text-ink">{formatDuration(outputDuration)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
