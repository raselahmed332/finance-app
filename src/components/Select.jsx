import { useState, useRef, useEffect } from "react";

export default function Select({ value, onChange, children, className = "", ...props }) {
  const [open, setOpen] = useState(false);
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
  let idx = 0;
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
      idx++;
    }
    if (node?.props?.children) walk(node.props.children);
  };
  walk(children);

  return (
    <div ref={ref} className={`relative ${className}`} {...props}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100 text-left"
      >
        <span className="truncate">{label || "Select..."}</span>
        <svg className={`w-3 h-3 ml-2 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-60 overflow-auto">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                opt.value === value
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
