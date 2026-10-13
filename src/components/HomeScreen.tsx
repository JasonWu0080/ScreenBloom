"use client";

import { useRef, useState } from "react";
import { ErrorDetails, errorText } from "@/components/errors";
import { Button } from "@/components/ui";
import type { LocalSupport } from "@/hooks/useCapabilities";
import type { SourceState } from "@/hooks/useSourceLoader";
import { LIMITS } from "@/lib/config";
import { formatBytes } from "@/lib/format";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function HomeScreen({ state, support, onFile }: { state: SourceState; support: LocalSupport; onFile: (f: File) => void }) {
  const { t } = useI18n();
  const supported = support === "ok";
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const loading = state.status === "loading";

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{t("homeTitle")}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">{t("homeSubtitle")}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (supported && !loading) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (supported && !loading) pick(e.dataTransfer.files);
        }}
        className={`mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors sm:py-16 ${
          over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface"
        }`}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3" aria-live="polite">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
            <p className="text-sm text-ink-2">{t("readingFile")}</p>
            <p className="max-w-full truncate text-xs text-ink-3">{state.fileName}</p>
          </div>
        ) : (
          <>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden className="text-ink-3">
              <rect x="5" y="9" width="30" height="22" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M17 16.5v7l6-3.5-6-3.5Z" fill="currentColor" />
            </svg>
            <p className="mt-3 text-base font-medium text-ink">{over ? t("dropActive") : t("dropTitle")}</p>
            <p className="mt-1 text-sm text-ink-3">{t("dropOr")}</p>
            <Button variant="primary" size="lg" className="mt-3" disabled={!supported} onClick={() => inputRef.current?.click()}>
              {t("chooseFile")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*,.mp4,.m4v,.mov,.webm,.mkv"
              className="hidden"
              data-testid="file-input"
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {!supported && (
        <p className="mt-4 rounded-md border border-[#f3cdc6] bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {support === "insecure" ? t("insecureContext") : t("browserUnsupported")}
        </p>
      )}
      {state.status === "error" && (
        <div className="mt-4 rounded-md border border-[#f3cdc6] bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {errorText(t, state.code, state.detail)}
          <ErrorDetails t={t} detail={state.code === "unsupported_codec" ? undefined : state.detail} />
        </div>
      )}

      <p className="mt-4 flex items-center gap-2 text-sm text-ink-2">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0 text-accent">
          <path d="M7 1 2 3v3.5C2 9.6 4.2 12.3 7 13c2.8-.7 5-3.4 5-6.5V3L7 1Z" fill="currentColor" opacity=".18" />
          <path d="M7 1 2 3v3.5C2 9.6 4.2 12.3 7 13c2.8-.7 5-3.4 5-6.5V3L7 1Z" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
        {t("localNote")}
      </p>

      <dl className="mt-10 grid gap-6 border-t border-line pt-6 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-medium text-ink">{t("formatsTitle")}</dt>
          <dd className="mt-1 leading-relaxed text-ink-2">{t("formatsBody")}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">{t("limitsTitle")}</dt>
          <dd className="mt-1 leading-relaxed text-ink-2">
            {t("limitsBody", {
              size: formatBytes(LIMITS.maxFileBytes),
              px: LIMITS.maxSourceLongSide,
              gifSec: LIMITS.maxOutputSeconds.gif,
              mp4Sec: LIMITS.maxOutputSeconds.mp4,
            })}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">{t("browserTitle")}</dt>
          <dd className="mt-1 leading-relaxed text-ink-2">{t("browserBody")}</dd>
        </div>
      </dl>
    </main>
  );
}
