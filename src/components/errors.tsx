"use client";

import { LIMITS } from "@/lib/config";
import { formatBytes } from "@/lib/format";
import type { TFn } from "@/lib/i18n/I18nProvider";
import type { ErrorCode } from "@/lib/jobs/protocol";

export function errorText(t: TFn, code: ErrorCode, detail?: string): string {
  return t(`err_${code}`, {
    detail: code === "unsupported_codec" ? (detail ?? "?") : "",
    size: formatBytes(LIMITS.maxFileBytes),
    px: LIMITS.maxSourceLongSide,
  });
}

/** Technical detail stays out of the main message and is only shown on request. */
export function ErrorDetails({ t, detail }: { t: TFn; detail?: string }) {
  if (!detail) return null;
  return (
    <details className="mt-1 text-[11px] text-ink-3">
      <summary className="cursor-pointer select-none">{t("errDetails")}</summary>
      <code className="mt-1 block break-all">{detail}</code>
    </details>
  );
}
