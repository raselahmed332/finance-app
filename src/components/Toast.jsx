import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

const DURATION = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (msg, type = "error") => {
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, msg, type }]);
      setTimeout(() => dismiss(id), DURATION);
    },
    [dismiss],
  );

  show.success = (msg) => show(msg, "success");
  show.error = (msg) => show(msg, "error");

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed top-20 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => {
          const isError = t.type === "error";
          return (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-lg max-w-sm w-full sm:w-auto animate-[toastIn_.25s_ease-out] ${
                isError
                  ? "bg-rose-600 dark:bg-rose-700"
                  : "bg-emerald-600 dark:bg-emerald-700"
              }`}
            >
              <i className={`fa-solid ${isError ? "fa-circle-exclamation" : "fa-circle-check"} text-sm`}></i>
              <span className="text-left leading-snug">{t.msg}</span>
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}