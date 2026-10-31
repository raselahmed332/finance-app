import { Icon } from "../ui/Icon.jsx";
import Popup from "./Popup.jsx";
import { formatBytes } from "../utils/updater.js";

// Shared application-styled dialog for the manual and automatic self-updaters.
// Replaces browser popups and transient toasts as the only download feedback.
//
// Props:
//   open         - controlled visibility
//   state        - "update-available" | "downloading" | "download-complete"
//                  | "permission-required" | "error"
//   release      - { versionName, versionCode, body } | null
//   installed    - { versionName } | null
//   progress     - { bytes, contentLength, percent } | null
//   message      - error/info text for the "error" and "permission-required" states
//   onUpdate     - start the download (update-available)
//   onLater      - dismiss without updating
//   onCancel     - cancel the download (downloading), if supported
//   onOpenInstaller - (re)launch the installer (download-complete / permission-required)
//   onOpenSettings  - open Android's unknown-apps settings (permission-required)
//   onClose      - dismiss the dialog (error)
const TITLES = {
  "update-available": "নতুন আপডেট পাওয়া গেছে",
  downloading: "আপডেট ডাউনলোড হচ্ছে",
  "download-complete": "ডাউনলোড সম্পন্ন",
  "permission-required": "ইনস্টল অনুমতি প্রয়োজন",
  error: "আপডেট করা সম্ভব হয়নি",
};

function shortBody(body) {
  const text = String(body || "").trim();
  if (!text) return "";
  const firstLines = text.split("\n").filter((l) => l.trim()).slice(0, 6).join("\n");
  return firstLines.length > 400 ? firstLines.slice(0, 400) + "…" : firstLines;
}

export default function UpdateDialog({
  open,
  state = "idle",
  release = null,
  installed = null,
  progress = null,
  message = "",
  onUpdate,
  onLater,
  onCancel,
  onOpenInstaller,
  onOpenSettings,
  onClose,
}) {
  if (!open || state === "idle") return null;

  const title = TITLES[state] || "আপডেট";
  const bytes = Number(progress?.bytes) || 0;
  const total = Number(progress?.contentLength) || 0;
  const hasTotal = total > 0;
  const percent =
    progress?.percent != null
      ? progress.percent
      : hasTotal
        ? Math.min(100, Math.round((bytes / total) * 100))
        : null;

  const body = shortBody(release?.body);

  return (
    <Popup
      open
      title={title}
      onClose={onClose || onLater}
      hideClose={state === "downloading"}
    >
      {state === "update-available" && (
        <>
          <div className="card-inset p-3 space-y-1.5">
            <Row label="বর্তমান ভার্সন" value={installed?.versionName || "—"} />
            <Row label="নতুন ভার্সন" value={release?.versionName || "—"} highlight />
            {release?.size ? <Row label="আকার" value={formatBytes(release.size)} /> : null}
          </div>
          {body && (
            <div className="text-[11px] text-ink-2 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">
              {body}
            </div>
          )}
          <div className="text-[11px] text-ink-3">
            আপডেট করলে আপনার ডেটা অপরিবর্তিত থাকবে।
          </div>
          <div className="flex gap-2.5 pt-1">
            <button onClick={onLater} className="btn btn-secondary flex-1">
              পরে
            </button>
            <button onClick={onUpdate} className="btn btn-primary flex-1">
              <Icon name="download" /> এখনই আপডেট
            </button>
          </div>
        </>
      )}

      {state === "downloading" && (
        <>
          <div className="text-[12px] font-semibold text-ink">
            {percent != null ? (
              <>
                {percent}% — {formatBytes(bytes)} / {formatBytes(total)}
              </>
            ) : hasTotal ? (
              <>
                {formatBytes(bytes)} / {formatBytes(total)}
              </>
            ) : (
              <>আপডেট ডাউনলোড হচ্ছে...</>
            )}
          </div>
          <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: "var(--ah-surface-3)" }}>
            {percent != null ? (
              <div
                className="h-full transition-[width] duration-200"
                style={{ width: `${percent}%`, background: "var(--ah-brand)" }}
              />
            ) : (
              <div
                className="h-full w-1/3 indeterminate-bar"
                style={{ background: "var(--ah-brand)" }}
              />
            )}
          </div>
          <div className="text-[10px] text-ink-3">
            {hasTotal
              ? "ডাউনলোড শেষ হলে Android ইনস্টলার স্বয়ংক্রিয়ভাবে খুলবে।"
              : "ফাইল সাইজ জানা যাচ্ছে না, তবে ডাউনলোড চলছে।"}
          </div>
          {onCancel ? (
            <button onClick={onCancel} className="btn btn-secondary">
              বাতিল করুন
            </button>
          ) : null}
        </>
      )}

      {state === "download-complete" && (
        <>
          <div className="flex items-center gap-2 text-[12px] text-ink">
            <Icon name="circle-check" style={{ color: "var(--ah-success)" }} />
            ডাউনলোড সম্পন্ন। Android ইনস্টলার খোলা হচ্ছে...
          </div>
          <button onClick={onOpenInstaller} className="btn btn-primary btn-block">
            <Icon name="smartphone" /> ইনস্টলার আবার খুলুন
          </button>
        </>
      )}

      {state === "permission-required" && (
        <>
          <div className="text-[12px] text-ink leading-relaxed">
            {message ||
              "Android-এ অ্যাপ ইনস্টলের অনুমতি চালু করা প্রয়োজন। সেটিংসে গিয়ে \"এই সোর্স থেকে অ্যাপ ইনস্টল\" চালু করুন, তারপর আবার চেষ্টা করুন।"}
          </div>
          <div className="flex gap-2.5 pt-1">
            <button onClick={onOpenSettings} className="btn btn-secondary flex-1">
              সেটিংস খুলুন
            </button>
            <button onClick={onOpenInstaller} className="btn btn-primary flex-1">
              আবার চেষ্টা করুন
            </button>
          </div>
        </>
      )}

      {state === "error" && (
        <>
          <div className="flex items-start gap-2.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--ah-danger-soft)", color: "var(--ah-danger)" }}
            >
              <Icon name="triangle-alert" />
            </div>
            <div className="text-[12px] text-ink leading-relaxed">
              {message || "আপডেট করা সম্ভব হয়নি। আবার চেষ্টা করুন।"}
            </div>
          </div>
          <div className="flex gap-2.5 pt-1">
            <button onClick={onClose} className="btn btn-primary flex-1">
              ঠিক আছে
            </button>
          </div>
        </>
      )}
    </Popup>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-ink-3">{label}</span>
      <span
        className="font-semibold"
        style={{
          color: highlight ? "var(--ah-brand)" : "var(--ah-text)",
          fontWeight: highlight ? 700 : 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}
