export default function Popup({ open, title, onClose, children, maxWidth = "max-w-md" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={`w-full ${maxWidth} bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto custom-scrollbar`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200" title="Close">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}