"use client";

import { CommitInput, Field, Notice, Segmented, Select } from "@/components/ui";
import type { Mp4Support } from "@/hooks/useCapabilities";
import { LIMITS } from "@/lib/config";
import { ASPECTS, isFullFrame } from "@/lib/edit/crop";
import { FPS_OPTIONS, MP4_QUALITIES, PRESET_IDS, SPEED_OPTIONS, outputSizeFor } from "@/lib/edit/params";
import type { AspectId, EditParams, Mp4Quality, OutputFormat, PresetId, Rect, SourceInfo } from "@/lib/edit/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const int = (s: string) => Math.round(Number(s));
const num = (s: string) => Number(s.replace(/[，,]/g, "."));

export function SettingsPanel({
  params,
  source,
  mp4Support,
  disabled,
  onChange,
  onPreset,
  onAspect,
  onCropField,
  onResetCrop,
}: {
  params: EditParams;
  source: SourceInfo;
  mp4Support: Mp4Support;
  disabled?: boolean;
  onChange: (fn: (p: EditParams) => EditParams) => void;
  onPreset: (id: PresetId) => void;
  onAspect: (a: AspectId) => void;
  onCropField: (field: keyof Rect, value: number) => void;
  onResetCrop: () => void;
}) {
  const { t } = useI18n();
  const size = outputSizeFor(params);
  const limited = size.width < Math.min(params.outputWidth, params.crop.width) - 1;
  const set = <K extends keyof EditParams>(k: K, v: EditParams[K]) => onChange((p) => ({ ...p, [k]: v }));
  const fullFrame = isFullFrame(params.crop, source.width, source.height);

  const loopOptions = [
    { value: 0, label: t("loopForever") },
    { value: 1, label: t("loopOnce") },
    ...[2, 3, 5, 10].map((n) => ({ value: n, label: t("loopTimes", { n }) })),
  ];
  if (!loopOptions.some((o) => o.value === params.gifLoop)) loopOptions.push({ value: params.gifLoop, label: t("loopTimes", { n: params.gifLoop }) });

  const fpsOptions = FPS_OPTIONS.includes(params.fps) ? FPS_OPTIONS : [...FPS_OPTIONS, params.fps].sort((a, b) => a - b);
  const speedOptions = SPEED_OPTIONS.includes(params.speed) ? SPEED_OPTIONS : [...SPEED_OPTIONS, params.speed].sort((a, b) => a - b);

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <Section
        title={t("crop")}
        aside={
          <button type="button" onClick={onResetCrop} disabled={disabled || (fullFrame && params.aspect === "free")} className="text-xs text-accent hover:underline disabled:text-ink-3 disabled:no-underline">
            {t("resetCrop")}
          </button>
        }
      >
        <Segmented<AspectId> label={t("crop")} size="sm" value={params.aspect} options={ASPECTS.map((a) => ({ value: a, label: t(`aspect_${a}`) }))} onChange={onAspect} />
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              ["x", t("cropX")],
              ["y", t("cropY")],
              ["width", t("cropW")],
              ["height", t("cropH")],
            ] as const
          ).map(([field, label]) => (
            <div key={field} className="space-y-1">
              <label htmlFor={`crop-${field}`} className="block text-[11px] text-ink-3">
                {label}
              </label>
              <CommitInput id={`crop-${field}`} inputMode="numeric" value={params.crop[field]} format={(v) => String(Math.round(v))} parse={int} onCommit={(v) => onCropField(field, v)} />
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-ink-3">{t("cropHint")}</p>
      </Section>

      <Section title={t("output")}>
        <Field label={t("format")}>
          <Segmented<OutputFormat>
            label={t("format")}
            value={params.format}
            options={[
              { value: "gif", label: t("formatGif") },
              { value: "mp4", label: t("formatMp4"), disabled: mp4Support !== "yes", title: mp4Support === "no" ? t("mp4UnavailableShort") : undefined },
            ]}
            onChange={(v) => set("format", v)}
          />
          {mp4Support === "no" && <p className="text-xs leading-relaxed text-ink-3">{t("mp4UnavailableHelp")}</p>}
          {mp4Support === "checking" && <p className="text-xs text-ink-3">MP4: {t("checking")}</p>}
        </Field>

        <Field
          label={t("preset")}
          hint={params.preset === "custom" ? <span className="font-medium text-warn">{t("preset_custom")}</span> : t(`presetDesc_${params.preset}`)}
        >
          <Segmented<PresetId>
            label={t("preset")}
            value={params.preset === "custom" ? null : params.preset}
            options={PRESET_IDS.map((id) => ({ value: id, label: t(`preset_${id}`), title: t(`presetDesc_${id}`) }))}
            onChange={onPreset}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("width")} htmlFor="out-width">
            <CommitInput id="out-width" inputMode="numeric" value={params.outputWidth} format={(v) => String(v)} parse={int} onCommit={(v) => set("outputWidth", v)} suffix="px" />
          </Field>
          <Field label={t("outputSize")}>
            <div className="tnum flex h-8 items-center text-sm font-medium text-ink">
              {size.width} × {size.height}
            </div>
          </Field>
        </div>
        {limited && <p className="-mt-1 text-xs text-ink-3">{t("sizeLimited")}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fps")} htmlFor="out-fps">
            <Select id="out-fps" value={params.fps} options={fpsOptions.map((f) => ({ value: f, label: `${f} fps` }))} onChange={(v) => set("fps", v)} />
          </Field>
          <Field label={t("speed")} htmlFor="out-speed">
            <Select id="out-speed" value={params.speed} options={speedOptions.map((s) => ({ value: s, label: `${s}×` }))} onChange={(v) => set("speed", v)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("holdStart")} htmlFor="hold-start">
            <CommitInput id="hold-start" value={params.holdStart} format={(v) => String(v)} parse={num} onCommit={(v) => set("holdStart", v)} suffix={t("seconds")} />
          </Field>
          <Field label={t("holdEnd")} htmlFor="hold-end">
            <CommitInput id="hold-end" value={params.holdEnd} format={(v) => String(v)} parse={num} onCommit={(v) => set("holdEnd", v)} suffix={t("seconds")} />
          </Field>
        </div>

        {params.format === "gif" ? (
          <Field label={t("loop")} htmlFor="gif-loop" hint={params.gifLoop === 0 ? t("loopHelpForever") : t("loopHelpCount", { n: params.gifLoop })}>
            <Select id="gif-loop" value={params.gifLoop} options={loopOptions} onChange={(v) => set("gifLoop", v)} />
          </Field>
        ) : (
          <Notice>{t("mp4LoopNote")}</Notice>
        )}

        <details className="group rounded-md border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-ink-2 select-none">
            {t("advanced")}
            <svg width="10" height="10" viewBox="0 0 10 10" className="transition-transform group-open:rotate-180" aria-hidden>
              <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" fill="none" strokeWidth="1.4" />
            </svg>
          </summary>
          <div className="space-y-3 border-t border-line px-3 py-3">
            <Field label={t("colors")} htmlFor="gif-colors">
              <Select id="gif-colors" value={params.gifColors} options={[32, 64, 128, 192, 256].map((c) => ({ value: c, label: String(c) }))} onChange={(v) => set("gifColors", v)} />
            </Field>
            <label className="flex items-start gap-2 text-xs text-ink-2">
              <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={params.gifDither} onChange={(e) => set("gifDither", e.target.checked)} />
              <span>
                {t("dither")}
                <span className="block text-ink-3">{t("ditherHelp")}</span>
              </span>
            </label>
            <Field label={t("mp4Quality")}>
              <Segmented<Mp4Quality>
                label={t("mp4Quality")}
                size="sm"
                value={params.mp4Quality}
                options={MP4_QUALITIES.map((q) => ({ value: q, label: t(`q_${q}`) }))}
                onChange={(v) => set("mp4Quality", v)}
              />
            </Field>
            <p className="text-[11px] leading-relaxed text-ink-3">
              {LIMITS.fps.min}–{LIMITS.fps.max} fps · {LIMITS.speed.min}–{LIMITS.speed.max}× · {LIMITS.hold.min}–{LIMITS.hold.max} {t("seconds")}
            </p>
          </div>
        </details>
      </Section>
    </fieldset>
  );
}
