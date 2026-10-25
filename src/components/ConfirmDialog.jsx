import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { pushBackHandler } from "../utils/native.js";

const ConfirmContext = createContext(null);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, title, confirmLabel, cancelLabel, danger }
  const resolveRef = useRef(null);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        message: options.message != null ? options.message : "আপনি কি নিশ্চিত?",
        detail: options.detail || "",
        title: options.title || "নিশ্চিত করুন",
        confirmLabel: options.confirmLabel || "হ্যাঁ, মুছুন",
        cancelLabel: options.cancelLabel || "বাতিল",
        danger: options.danger !== false,
      });
    });
  }, []);

  const close = useCallback((result) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setState(null);
    if (resolve) resolve(result);
  }, []);

  // While the dialog is open, the Android Back button dismisses it (same as a
  // cancel / tap-outside) instead of navigating the app behind it.
  useEffect(() => {
    if (!state) return undefined;
    return pushBackHandler(() => close(false));
  }, [state, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(4, 12, 9, 0.62)" }}
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-xs overflow-hidden"
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
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--ah-border)" }}
            >
              <h3 className="font-bold text-[15px]" style={{ color: "var(--ah-text)" }}>
                {state.title}
              </h3>
              <button
                onClick={() => close(false)}
                className="icon-btn"
                style={{ width: 30, height: 30, border: "none", background: "transparent" }}
                title="বন্ধ করুন"
              >
                <i className="fa-solid fa-xmark text-base" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: state.danger
                      ? "var(--ah-danger-soft)"
                      : "var(--ah-warning-soft)",
                    color: state.danger ? "var(--ah-danger)" : "var(--ah-warning)",
                  }}
                >
                  <i
                    className={`fa-solid ${state.danger ? "fa-triangle-exclamation" : "fa-circle-question"} text-lg`}
                  />
                </div>
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-medium leading-relaxed whitespace-pre-line"
                    style={{ color: "var(--ah-text-2)" }}
                  >
                    {state.message}
                  </div>
                  {state.detail && (
                    <div
                      className="mt-1.5 text-[11px] font-semibold"
                      style={{ color: "var(--ah-text-3)" }}
                    >
                      {state.detail}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button onClick={() => close(false)} className="btn btn-secondary flex-1">
                  {state.cancelLabel}
                </button>
                <button
                  onClick={() => close(true)}
                  className={`btn flex-1 ${state.danger ? "btn-danger" : "btn-primary"}`}
                >
                  {state.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
