export function ErrorText({ msg }) {
  return msg ? (
    <div className="err">
      <i className="fa-solid fa-circle-exclamation" />
      {msg}
    </div>
  ) : null;
}

export function Field({ label, children, error }) {
  return (
    <div>
      {label ? <label className="label">{label}</label> : null}
      {children}
      <ErrorText msg={error} />
    </div>
  );
}

export function DetailCell({ label, value, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="section-sub uppercase tracking-wide">{label}</div>
      <div className="text-[11px] font-semibold text-ink mt-0.5 break-words">{value}</div>
    </div>
  );
}
