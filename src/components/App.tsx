"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditorScreen } from "@/components/editor/EditorScreen";
import { HomeScreen } from "@/components/HomeScreen";
import { Logo } from "@/components/Logo";
import { ResultScreen } from "@/components/ResultScreen";
import { Button } from "@/components/ui";
import { localProcessingSupport, useMp4Support, type LocalSupport } from "@/hooks/useCapabilities";
import { editKey, useExportJob } from "@/hooks/useExportJob";
import { useSourceLoader } from "@/hooks/useSourceLoader";
import { aspectRatio, fullRect, setRectField } from "@/lib/edit/crop";
import { applyPreset, checkLimits, defaultParams, detectPreset, normalizeParams, setAspect, withCrop } from "@/lib/edit/params";
import type { EditParams, OutputFormat } from "@/lib/edit/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function App() {
  const { t, lang, setLang } = useI18n();
  const loader = useSourceLoader();
  const exporter = useExportJob();
  const { pruneResults } = exporter;
  const [params, setParams] = useState<EditParams | null>(null);
  const [initialParams, setInitialParams] = useState<string>("");
  const [view, setView] = useState<"editor" | "result">("editor");
  const [shown, setShown] = useState<OutputFormat>("gif");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [support, setSupport] = useState<LocalSupport>({ status: "ok" });
  const fileInput = useRef<HTMLInputElement>(null);

  const source = loader.state.status === "ready" ? loader.state.source : null;
  const mp4Support = useMp4Support(source != null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser feature detection after hydration
    setSupport(localProcessingSupport());
  }, []);

  // Results that no longer match the current edit are released immediately.
  const currentKey = params ? editKey(params) : "";
  useEffect(() => {
    if (currentKey) pruneResults(currentKey);
  }, [currentKey, pruneResults]);

  const openFile = useCallback(
    async (file: File) => {
      exporter.reset();
      setParams(null);
      setView("editor");
      const loaded = await loader.load(file);
      if (loaded) {
        const p = defaultParams(loaded.info);
        setParams(p);
        setInitialParams(JSON.stringify(p));
      }
    },
    [exporter, loader],
  );

  const info = source?.info;
  const update = useCallback(
    (fn: (p: EditParams) => EditParams) => {
      if (!info) return;
      setParams((p) => {
        if (!p) return p;
        const next = normalizeParams(fn(p), info);
        return { ...next, preset: detectPreset(next) };
      });
    },
    [info],
  );

  const exportWith = useCallback(
    async (p: EditParams) => {
      if (!source) return;
      const r = await exporter.start(source.file, p, source.info);
      if (r) {
        setShown(r.format);
        setView("result");
      }
    },
    [exporter, source],
  );

  const hasWork = params != null && (JSON.stringify(params) !== initialParams || Object.keys(exporter.results).length > 0);
  const requestReplace = () => {
    if (hasWork) setConfirmOpen(true);
    else fileInput.current?.click();
  };

  const results = exporter.results;
  const result = results[shown];
  const otherFormat: OutputFormat = shown === "gif" ? "mp4" : "gif";
  const canExportOther =
    params != null && info != null && (otherFormat === "gif" || mp4Support === "yes") && checkLimits({ ...params, format: otherFormat }).length === 0;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Logo size={18} />
          {t("appName")}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {source && (
            <Button size="sm" onClick={requestReplace} disabled={exporter.job.status === "running"}>
              {t("replaceFile")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setLang(lang === "zh" ? "en" : "zh")} aria-label={t("langSwitchLabel")}>
            {t("langSwitch")}
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,.mp4,.m4v,.mov,.webm,.mkv"
          className="hidden"
          data-testid="replace-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void openFile(f);
          }}
        />
      </header>

      {!source || !params || !info ? (
        <HomeScreen state={loader.state} support={support} onFile={(f) => void openFile(f)} />
      ) : view === "result" && result ? (
        <ResultScreen
          result={result}
          other={results[otherFormat]}
          sourceName={info.fileName}
          job={exporter.job}
          canExportOther={canExportOther}
          onBack={() => setView("editor")}
          onShow={setShown}
          onExportOther={() => {
            const p = { ...params, format: otherFormat };
            setParams(p);
            void exportWith(p);
          }}
          onCancel={exporter.cancel}
          onDismiss={exporter.dismissError}
        />
      ) : (
        <EditorScreen
          source={source}
          params={params}
          job={exporter.job}
          mp4Support={mp4Support}
          onChange={update}
          onPreset={(id) => update((p) => applyPreset(p, id))}
          onAspect={(a) => update((p) => setAspect(p, a, info))}
          onCrop={(r) => update((p) => withCrop(p, r))}
          onCropField={(field, value) =>
            update((p) => withCrop(p, setRectField(p.crop, field, value, aspectRatio(p.aspect, info.width, info.height), info.width, info.height)))
          }
          onResetCrop={() => update((p) => withCrop({ ...p, aspect: "free" }, fullRect(info.width, info.height)))}
          onExport={() => void exportWith(params)}
          onCancel={exporter.cancel}
          onDismiss={exporter.dismissError}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t("confirmReplaceTitle")}
        body={t("confirmReplaceBody")}
        confirmLabel={t("confirmReplaceOk")}
        cancelLabel={t("cancel")}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          fileInput.current?.click();
        }}
      />
    </div>
  );
}
