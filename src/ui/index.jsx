// ---------------- SHARED UI PRIMITIVES ----------------
//
// One implementation of every recurring visual element. Every screen is built
// from these so the app cannot drift into two different card styles, two
// different buttons or two different empty states.
//
// All of them are presentational: they never talk to the API, never own
// business state and never change the meaning of a value. Data always comes in
// as props from the page that owns it.

import { useEffect, useRef, useState } from "react";

export function Spinner({ className = "" }) {
  return <div className={`spinner ${className}`} />;
}

export function LoadingState({ label = "লোড হচ্ছে..." }) {
  return (
    <div className="empty">
      <Spinner className="mx-auto mb-3" />
      <div className="empty-title">{label}</div>
    </div>
  );
}

export function EmptyState({ icon = "fa-inbox", title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <i className={`fa-solid ${icon}`} />
      </div>
      <div className="empty-title">{title}</div>
      {text ? <div className="empty-text">{text}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "কিছু একটা সমস্যা হয়েছে", text, onRetry }) {
  return (
    <div className="empty">
      <div className="empty-icon" style={{ color: "var(--ah-danger)" }}>
        <i className="fa-solid fa-triangle-exclamation" />
      </div>
      <div className="empty-title">{title}</div>
      {text ? <div className="empty-text">{text}</div> : null}
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={onRetry}>
          <i className="fa-solid fa-rotate-right" /> আবার চেষ্টা করুন
        </button>
      ) : null}
    </div>
  );
}

// --- Surfaces ---------------------------------------------------------------

export function Card({
  as: Tag = "div",
  variant = "card",
  className = "",
  children,
  ...rest
}) {
  return (
    <Tag className={`${variant} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

// A card with a title row. `action` is rendered on the right of the header.
export function SectionCard({
  title,
  subtitle,
  icon,
  action,
  className = "",
  bodyClassName = "p-4",
  children,
  ...rest
}) {
  return (
    <section className={`card ${className}`} {...rest}>
      {title || action ? (
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="section-title flex items-center gap-2">
              {icon ? <i className={`fa-solid ${icon} text-brand`} /> : null}
              {title}
            </h2>
            {subtitle ? <p className="section-sub mt-0.5">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// --- Buttons ----------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  success: "btn-success",
};

export function Button({
  variant = "primary",
  size,
  icon,
  iconRight,
  block,
  className = "",
  children,
  type = "button",
  ...rest
}) {
  const cls = [
    "btn",
    BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary,
    size === "sm" ? "btn-sm" : "",
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {icon ? <i className={`fa-solid ${icon}`} /> : null}
      {children}
      {iconRight ? <i className={`fa-solid ${iconRight}`} /> : null}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  variant = "default",
  className = "",
  ...rest
}) {
  const cls = [
    "icon-btn",
    variant === "danger" ? "icon-btn-danger" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} aria-label={label} title={label} {...rest}>
      <i className={`fa-solid ${icon}`} />
    </button>
  );
}

// --- Form fields ------------------------------------------------------------

export function Field({ label, error, hint, children, className = "" }) {
  return (
    <div className={className}>
      {label ? <label className="label">{label}</label> : null}
      {children}
      {error ? (
        <p className="err">
          <i className="fa-solid fa-circle-exclamation" />
          {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className = "", invalid, ...rest }) {
  return (
    <input
      className={`input ${invalid ? "input-invalid" : ""} ${className}`}
      {...rest}
    />
  );
}

export function Textarea({ className = "", invalid, ...rest }) {
  return (
    <textarea
      className={`textarea ${invalid ? "input-invalid" : ""} ${className}`}
      {...rest}
    />
  );
}

// --- Badges / chips ---------------------------------------------------------

const BADGE_TONES = {
  brand: "badge-brand",
  success: "badge-success",
  danger: "badge-danger",
  warning: "badge-warning",
  info: "badge-info",
  neutral: "badge-neutral",
};

// Inline colours for a tone, so an icon tile can be tinted the same way as a
// badge without needing a hard-coded Tailwind colour for every combination.
export function toneStyle(tone) {
  switch (tone) {
    case "brand":
      return { background: "var(--ah-brand-soft)", color: "var(--ah-brand)" };
    case "success":
      return { background: "var(--ah-success-soft)", color: "var(--ah-success)" };
    case "danger":
      return { background: "var(--ah-danger-soft)", color: "var(--ah-danger)" };
    case "warning":
      return { background: "var(--ah-warning-soft)", color: "var(--ah-warning)" };
    case "info":
      return { background: "var(--ah-info-soft)", color: "var(--ah-info)" };
    default:
      return { background: "var(--ah-neutral-soft)", color: "var(--ah-text-2)" };
  }
}

export function Badge({ tone = "neutral", icon, className = "", children }) {
  return (
    <span className={`badge ${BADGE_TONES[tone] || BADGE_TONES.neutral} ${className}`}>
      {icon ? <i className={`fa-solid ${icon}`} /> : null}
      {children}
    </span>
  );
}

export function Chip({ active, icon, className = "", children, ...rest }) {
  return (
    <button
      type="button"
      className={`chip ${active ? "chip-active" : ""} ${className}`}
      aria-pressed={active ? "true" : "false"}
      {...rest}
    >
      {icon ? <i className={`fa-solid ${icon}`} /> : null}
      {children}
    </button>
  );
}

// A horizontal group of mutually exclusive options.
export function Segmented({ options, value, onChange, className = "" }) {
  return (
    <div className={`segment ${className}`} role="tablist">
      {options.map((opt) => {
        const val = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const icon = typeof opt === "string" ? null : opt.icon;
        return (
          <button
            key={val}
            type="button"
            role="tab"
            aria-selected={value === val ? "true" : "false"}
            className={`segment-item ${value === val ? "segment-item-active" : ""}`}
            onClick={() => onChange(val)}
          >
            {icon ? <i className={`fa-solid ${icon} me-1`} /> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// --- Data display ------------------------------------------------------------

export function Stat({ label, icon, value, tone, className = "", children }) {
  const color =
    tone === "success"
      ? "var(--ah-success)"
      : tone === "danger"
        ? "var(--ah-danger)"
        : tone === "warning"
          ? "var(--ah-warning)"
          : tone === "info"
            ? "var(--ah-info)"
            : tone === "brand"
              ? "var(--ah-brand)"
              : null;
  return (
    <div className={`stat ${className}`}>
      <div className="stat-label">
        {icon ? <i className={`fa-solid ${icon}`} /> : null}
        <span>{label}</span>
      </div>
      <div
        className="stat-value tnum mt-1"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {children}
    </div>
  );
}

export function KV({ label, value, className = "" }) {
  return (
    <div className={`kv-row ${className}`}>
      <span className="kv-label">{label}</span>
      <span className="kv-value">{value}</span>
    </div>
  );
}

// Page heading used by every sub-screen (transactions, reports, settings...).
export function PageHeader({ title, subtitle, icon, onBack, right, className = "" }) {
  return (
    <div className={`flex items-center gap-3 mb-4 ${className}`}>
      {onBack ? (
        <button
          type="button"
          className="icon-btn shrink-0"
          onClick={onBack}
          aria-label="ফিরে যান"
          title="ফিরে যান"
        >
          <i className="fa-solid fa-arrow-left" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="page-title flex items-center gap-2">
          {icon ? <i className={`fa-solid ${icon} text-brand`} /> : null}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle ? <p className="section-sub mt-0.5">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

// A money amount. `tone` colours the number; the sign is always explicit so
// income and expense are distinguishable without relying on colour alone.
export function Amount({
  value,
  currency,
  sign,
  tone,
  size = "md",
  className = "",
}) {
  const num = Number(value) || 0;
  const text = num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const color =
    tone === "success"
      ? "var(--ah-success)"
      : tone === "danger"
        ? "var(--ah-danger)"
        : tone === "brand"
          ? "var(--ah-brand)"
          : "var(--ah-text)";
  const sizeClass =
    size === "lg" ? "text-xl" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <span
      className={`tnum font-bold ${sizeClass} ${className}`}
      style={{ color }}
    >
      {sign}
      {currency ? `${currency} ` : ""}
      {text}
    </span>
  );
}

// A horizontal money bar used in the report category breakdown.
export function BarRow({ label, value, max, tone = "brand", right }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color =
    tone === "danger"
      ? "var(--ah-danger)"
      : tone === "success"
        ? "var(--ah-success)"
        : tone === "info"
          ? "var(--ah-info)"
          : "var(--ah-brand)";
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-xs font-semibold text-ink truncate">{label}</span>
        <span className="text-xs font-bold tnum text-ink-2 shrink-0">{right}</span>
      </div>
      <div className="h-2 w-full rounded-full" style={{ background: "var(--ah-surface-3)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// A title row for a standalone form (income, expense, loan, ...).
export function FormHeader({ title, subtitle, icon, tone = "brand", onCancel }) {
  const color =
    tone === "danger"
      ? "var(--ah-danger)"
      : tone === "warning"
        ? "var(--ah-warning)"
        : tone === "info"
          ? "var(--ah-info)"
          : "var(--ah-brand)";
  return (
    <div className="flex items-center gap-3 pb-1">
      {onCancel ? (
        <button type="button" onClick={onCancel} className="icon-btn" aria-label="ফিরে যান">
          <i className="fa-solid fa-arrow-left" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-[15px] flex items-center gap-2 text-ink">
          {icon ? (
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] shrink-0"
              style={{ background: "var(--ah-surface-3)", color }}
            >
              <i className={`fa-solid ${icon}`} />
            </span>
          ) : null}
          <span className="truncate" style={{ color }}>{title}</span>
        </h3>
        {subtitle ? <p className="section-sub mt-1">{subtitle}</p> : null}
      </div>
    </div>
  );
}

// The amount row. Money is the most important field on every form, so it gets
// the biggest type and its own emphasis.
export function AmountField({ value, onChange, currency, tone = "brand", placeholder = "0.00", id }) {
  const color =
    tone === "danger"
      ? "var(--ah-danger)"
      : tone === "success"
        ? "var(--ah-success)"
        : "var(--ah-brand)";
  return (
    <div className="relative flex items-center">
      <input
        id={id}
        type="number"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="input pr-16 text-lg font-bold"
        style={{ color, fontVariantNumeric: "tabular-nums" }}
      />
      <span className="absolute right-3 text-xs font-bold text-ink-3 pointer-events-none">
        {currency}
      </span>
    </div>
  );
}

// A dropdown that behaves like a native select on mobile: tap to open, tap a
// row to choose, tap outside to dismiss. Used wherever a long list (wallets,
// accounts, currencies, categories) has to be picked.
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "নির্বাচন করুন",
  disabled,
  className = "",
  id,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const current = options.find((o) => String(o.value) === String(value));

  return (
    <div className={`relative ${className}`} ref={ref} id={id}>
      <button
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open ? "true" : "false"}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`truncate ${current ? "" : "text-ink-3"}`}>
          {current ? current.label : placeholder}
        </span>
        <i
          className={`fa-solid fa-chevron-down text-[10px] text-ink-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="select-menu" role="listbox">
          {options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-ink-3 text-center">কোনো অপশন নেই</div>
          ) : (
            options.map((o) => (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={String(o.value) === String(value) ? "true" : "false"}
                className={`select-option ${String(o.value) === String(value) ? "select-option-active" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
