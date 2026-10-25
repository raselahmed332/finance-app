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
        aria-expanded={open ? "true" : "false"}
        className="select-trigger"
      >
        <span className="truncate">{label || "Select..."}</span>
        <i
          className={`fa-solid fa-chevron-down text-[10px] text-ink-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div role="listbox" className="select-menu">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={opt.value === value ? "true" : "false"}
              onClick={() => selectOption(opt)}
              className={`select-option ${i === highlight || opt.value === value ? "select-option-active" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
