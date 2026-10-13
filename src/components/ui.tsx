"use client";

import { useEffect, useId, useState } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg" }) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
  const sizes = { sm: "h-7 px-2.5 text-xs", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-[15px]" };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2",
    ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
    danger: "bg-surface text-danger border border-line hover:bg-danger-soft",
  };
  return <button type="button" className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
  size = "md",
}: {
  value: T | null;
  options: { value: T; label: string; title?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-md border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={`min-w-0 flex-1 truncate rounded-[5px] px-2 ${size === "sm" ? "h-7 text-xs" : "h-8 text-sm"} transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              active ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <div className="text-xs leading-relaxed text-ink-3">{hint}</div>}
    </div>
  );
}

/**
 * Text field that edits a number but only commits on blur / Enter, so partially typed values
 * ("1.", "") don't fight with validation. The displayed value resyncs when the source changes.
 */
export function CommitInput({
  value,
  format,
  parse,
  onCommit,
  id,
  ariaLabel,
  suffix,
  inputMode = "decimal",
  disabled,
  className = "",
}: {
  value: number;
  format: (v: number) => string;
  parse: (s: string) => number;
  onCommit: (v: number) => void;
  id?: string;
  ariaLabel?: string;
  suffix?: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
  className?: string;
}) {
  const shown = format(value);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  const autoId = useId();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync with external value when not editing
    if (!editing) setText(shown);
  }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    const v = parse(text);
    if (Number.isFinite(v)) onCommit(v);
    setText(format(Number.isFinite(v) ? v : value));
  };
  return (
    <div className={`flex h-8 items-center rounded-md border border-line bg-surface focus-within:border-accent ${disabled ? "opacity-50" : ""} ${className}`}>
      <input
        id={id ?? autoId}
        aria-label={ariaLabel}
        className="tnum h-full w-full min-w-0 bg-transparent px-2 text-sm outline-none"
        inputMode={inputMode}
        value={editing ? text : shown}
        disabled={disabled}
        onFocus={() => {
          setText(shown);
          setEditing(true);
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(shown);
            setEditing(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {suffix && <span className="pr-2 text-xs text-ink-3">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  id,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      disabled={disabled}
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange(o.value);
      }}
      className="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm outline-none focus:border-accent disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: React.ReactNode }) {
  const tones = {
    info: "bg-surface-2 text-ink-2 border-line",
    warn: "bg-warn-soft text-warn border-[#f1dfb5]",
    danger: "bg-danger-soft text-danger border-[#f3cdc6]",
  };
  return <div className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${tones[tone]}`}>{children}</div>;
}
