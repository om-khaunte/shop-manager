"use client";

import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "default" | "primary" | "ghost" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; active?: boolean }
>(function Button({ variant = "default", size = "md", active, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 border font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-6 px-2 text-2xs" : "h-7 px-2.5 text-xs",
        active
          ? "border-ink bg-ink text-white"
          : {
              default: "border-line bg-panel text-ink hover:border-ink-3 hover:bg-white",
              primary: "border-accent bg-accent text-white hover:bg-accent-ink",
              ghost: "border-transparent text-ink-2 hover:bg-line-2 hover:text-ink",
              danger: "border-line bg-panel text-danger hover:border-danger hover:bg-danger-soft",
            }[variant],
        className,
      )}
    />
  );
});

export function IconButton({
  label,
  children,
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...props}
      className={cx(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-35",
        active ? "bg-ink text-white" : "text-ink-2 hover:bg-line-2 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between">
      <h3 className="text-2xs font-semibold tracking-[0.08em] text-ink-3 uppercase">{children}</h3>
      {aside}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[11px] tracking-tight", className)}>{children}</span>;
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "accent" | "ink" }) {
  return (
    <span
      className={cx(
        "inline-flex h-[18px] items-center border px-1.5 text-[10px] font-semibold tracking-[0.06em] uppercase",
        tone === "neutral" && "border-line text-ink-2",
        tone === "warn" && "border-warn/40 bg-warn-soft text-warn",
        tone === "accent" && "border-accent/40 bg-accent-soft text-accent-ink",
        tone === "ink" && "border-ink bg-ink text-white",
      )}
    >
      {children}
    </span>
  );
}

const inputClass =
  "h-7 w-full min-w-0 border border-line bg-white px-2 text-xs text-ink outline-none placeholder:text-ink-3 focus:border-ink disabled:bg-panel disabled:text-ink-3";

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-2xs font-medium text-ink-2">
      {children}
    </label>
  );
}

/**
 * Text input that commits on blur or Enter, so one edit is one undo step.
 * Escape restores the committed value.
 */
export function CommitInput({
  value,
  onCommit,
  multiline,
  mono,
  placeholder,
  id,
  ariaLabel,
  maxLength = 120,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  mono?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value);
  // Enter commits and then blur fires; remember what was just sent so it counts once.
  const sent = useRef<string | null>(null);
  useEffect(() => {
    setDraft(value);
    sent.current = null;
  }, [value]);
  const commit = () => {
    if (draft === value || sent.current === draft) return;
    sent.current = draft;
    onCommit(draft);
  };
  const common = {
    id,
    value: draft,
    placeholder,
    maxLength,
    "aria-label": ariaLabel,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter" && !multiline) {
        commit();
        (e.target as HTMLElement).blur();
      }
      if (e.key === "Escape") {
        setDraft(value);
        (e.target as HTMLElement).blur();
      }
    },
  };
  return multiline ? (
    <textarea {...common} rows={3} className={cx(inputClass, "h-auto resize-none py-1.5 leading-snug")} />
  ) : (
    <input {...common} className={cx(inputClass, mono && "font-mono text-[11px]")} />
  );
}

export function NumberInput({
  value,
  onCommit,
  label,
  min,
  max,
  step = 1,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const shown = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || draft.trim() === "") return setDraft(shown);
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (clamped !== value) onCommit(clamped);
    else setDraft(shown);
  };
  return (
    <label className={cx("field-wrap flex h-7 items-center border border-line focus-within:border-ink", disabled ? "bg-panel" : "bg-white")}>
      <span className="w-6 shrink-0 text-center font-mono text-[10px] text-ink-3">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={draft}
        step={step}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(shown);
            (e.target as HTMLElement).blur();
          }
        }}
        className="h-full w-full min-w-0 bg-transparent pr-1.5 font-mono text-[11px] text-ink outline-none disabled:text-ink-3"
      />
    </label>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        onKeyDown={(e) => e.stopPropagation()}
        className={cx(inputClass, "appearance-none pr-6")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-3" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="m3 6 5 5 5-5" />
      </svg>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex h-7 border border-line bg-white">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex flex-1 items-center justify-center px-1.5 text-2xs font-medium transition-colors",
            i > 0 && "border-l border-line",
            value === o.value ? "bg-ink text-white" : "text-ink-2 hover:bg-line-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Banner({
  tone,
  children,
  actions,
  onClose,
}: {
  tone: "error" | "warn" | "info";
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "pointer-events-auto flex min-h-9 items-center gap-3 border px-3 py-1.5 text-xs shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        tone === "error" && "border-accent/50 bg-accent-soft text-accent-ink",
        tone === "warn" && "border-warn/40 bg-warn-soft text-warn",
        tone === "info" && "border-line bg-panel text-ink",
      )}
    >
      <div className="min-w-0 flex-1 leading-snug">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      {onClose && (
        <button type="button" aria-label="Dismiss" onClick={onClose} className="-mr-1 p-1 opacity-60 hover:opacity-100">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Gear-and-eagle mark. Colored by the theme via CSS (dark grey in light mode, white in dark). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Team 114 Eagle Robotics"
      className={cx("brand-mark block h-[26px] w-[32px] bg-ink", className)}
      style={{ maskImage: "url(/eagle-mask.png)", WebkitMaskImage: "url(/eagle-mask.png)", maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
    />
  );
}
