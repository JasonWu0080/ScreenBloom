/** ScreenBloom mark; same artwork as src/app/icon.svg (favicon) and the Open Graph image. */
export function Logo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M12.5 9.9v12.2c0 .8.9 1.3 1.6.9l9.4-6.1c.6-.4.6-1.4 0-1.8l-9.4-6.1c-.7-.4-1.6.1-1.6.9Z" fill="#fff" />
    </svg>
  );
}
