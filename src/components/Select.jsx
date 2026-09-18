import { useState, useRef, useEffect } from "react";

export default function Select({ value, onChange, children, className = "", ...props }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const options = [];
  let label = "";
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node?.type === "option") {
      const val = node.props.value ?? node.props.children;
      options.push({ value: val, label: node.props.children });
      if (val === value) label = node.props.children;
    }
    if (node?.props?.children) walk(node.props.children);
  };
  walk(children);

  const selectOption = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setHighlight(-1);
  };

  const openAtCurrent = () => {
    const idx = options.findIndex((o) => o.value === value);
    setOpen(true);
    setHighlight(idx >= 0 ? idx : 0);
  };

  const handleKeyDown = (e) => {
    if (options.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openAtCurrent();
        return;
      }
      setHighlight((h) => (e.key === "ArrowDown"
        ? (h + 1) % options.length
        : (h - 1 + options.length) % options.length));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && highlight >= 0 && options[highlight]) {
        selectOption(options[highlight]);
      } else if (!open) {
        openAtCurrent();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`} {...props} onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            setHighlight(-1);
          } else {
            openAtCurrent();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100 text-left"
      >
        <span className="truncate">{label || "Select..."}</span>
        <svg className={`w-3 h-3 ml-2 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div role="listbox" className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-60 overflow-auto">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => selectOption(opt)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                i === highlight || opt.value === value
                  ? "bg-slate-100 dark:bg-gray-800 font-semibold text-slate-800 dark:text-gray-100"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}