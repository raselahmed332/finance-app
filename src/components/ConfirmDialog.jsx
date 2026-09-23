import { createContext, useCallback, useContext, useRef, useState } from "react";

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
        title: options.title || "নিশ্চিত করুন",
        confirmLabel: options.confirmLabel || "হ্যাঁ, মুছুন",
        cancelLabel: options.cancelLabel || "বাতিল",
        danger: options.danger !== false,
      });
    });
  }, []);

  const close = (result) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setState(null);
    if (resolve) resolve(result);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => close(false)}>
          <div className="w-full max-w-xs bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">{state.title}</h3>
              <button onClick={() => close(false)} className="text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200" title="Close">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${state.danger ? "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"}`}>
                  <i className={`fa-solid ${state.danger ? "fa-triangle-exclamation" : "fa-circle-question"} text-lg`}></i>
                </div>
                <div className="text-[13px] font-medium text-slate-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">{state.message}</div>
              </div>
              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => close(false)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-gray-200 text-xs font-bold py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {state.cancelLabel}
                </button>
                <button
                  onClick={() => close(true)}
                  className={`flex-1 text-white font-bold py-2.5 rounded-xl transition-colors ${state.danger ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
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