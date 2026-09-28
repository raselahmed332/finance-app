export function ErrorText({ msg }) {
  return msg ? <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1"><i className="fa-solid fa-circle-exclamation"></i>{msg}</div> : null;
}

export function Field({ label, children, error }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {children}
      <ErrorText msg={error} />
    </div>
  );
}

export function DetailCell({ label, value, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</div>
      <div className="text-[11px] font-semibold text-slate-700 dark:text-gray-200 mt-0.5 break-words">{value}</div>
    </div>
  );
}
