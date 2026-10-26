import { useEffect } from "react";
import { lockPageScroll, pushBackHandler } from "../utils/native.js";

export default function Popup({ open, title, onClose, children, maxWidth = "max-w-md", hideClose = false }) {
  useEffect(() => {
    if (!open) return undefined;
    return lockPageScroll();
  }, [open]);

  // Android Back closes this popup while it is open, before app navigation.
  useEffect(() => {
    if (!open) return undefined;
    if (hideClose) return undefined;
    return pushBackHandler(onClose);
  }, [open, onClose, hideClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(4, 12, 9, 0.62)" }}
      onClick={hideClose ? undefined : onClose}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto overscroll-contain custom-scrollbar`}
        style={{
          background: "var(--ah-surface)",
          border: "1px solid var(--ah-border)",
          borderRadius: "22px",
          boxShadow: "var(--ah-shadow-lg)",
          animation: "sheetIn .2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{
            background: "var(--ah-surface)",
            borderBottom: "1px solid var(--ah-border)",
          }}
        >
          <h3 className="font-bold text-[15px]" style={{ color: "var(--ah-text)" }}>
            {title}
          </h3>
          {!hideClose && (
            <button
              onClick={onClose}
              className="icon-btn"
              style={{ width: 30, height: 30, border: "none", background: "transparent" }}
              title="বন্ধ করুন"
            >
              <i className="fa-solid fa-xmark text-base" />
            </button>
          )}
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}
