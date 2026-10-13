export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 100 * 1024 ** 2 ? 2 : 1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** 83.25 → "1:23.3"; 4.5 → "0:04.5" (tenths are enough for UI trimming). */
export function formatTime(sec: number, decimals = 1): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const factor = 10 ** decimals;
  const total = Math.round(sec * factor) / factor;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const sStr = s.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, "0");
  return `${m}:${sStr}`;
}

/** Short duration for summaries: "4.2 s" / "1:05.0". */
export function formatDuration(sec: number): string {
  return sec < 60 ? `${(Math.round(sec * 100) / 100).toFixed(sec < 10 ? 2 : 1)} s` : formatTime(sec);
}

/** Accepts "12.5", "1:02.5", "0:03" or "1:02:03.5". Returns NaN when invalid. */
export function parseTime(input: string): number {
  const s = input.trim().replace(/[，,]/g, ".").replace(/：/g, ":");
  if (!/^\d+(?::\d{1,2}(?:\.\d*)?|\.\d*)?(?::\d{1,2}(?:\.\d*)?)?$/.test(s) && !/^\.\d+$/.test(s)) return NaN;
  const parts = s.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function downloadName(sourceName: string, ext: string, width: number, height: number): string {
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "clip";
  return `${base}-${width}x${height}.${ext}`;
}
