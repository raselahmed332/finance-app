import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";

const REMEMBER_KEY = "hisab_remember_login";

// "Remember me" stores the USERNAME only. The PIN is never written to
// localStorage/sessionStorage: anything persisted there is readable by any
// script on the page and survives on a shared machine.
function loadRemembered() {
  const fallback = { username: "", remember: true };
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) || {};
    // Drop any PIN written by an older build of the app. Deleting the key from
    // the parsed object is not enough - that object is a throwaway copy, so the
    // PIN would stay on disk until the next successful login. Write the
    // sanitised record back out, and remove the key outright if it held a PIN,
    // since a remembered PIN alone has no use.
    if (parsed.pin !== undefined) {
      if (parsed.username) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: parsed.username, remember: parsed.remember !== false }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    }
    return {
      username: typeof parsed.username === "string" ? parsed.username : "",
      remember: parsed.remember !== false,
    };
  } catch {
    return fallback;
  }
}

export default function LoginScreen({ onLogin, onReady }) {
  const remembered = loadRemembered();
  const [username, setUsername] = useState(remembered.username);
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(remembered.remember);
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    api.login(username, pin).then((res) => {
      if (res.status === 'SUCCESS') {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, remember: true }));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
        onLogin(res.user, res.token);
      } else {
        toast.error(res.message);
      }
    }).catch((err) => toast.error(String(err))).finally(() => setSubmitting(false));
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          "linear-gradient(150deg, var(--ah-header) 0%, var(--ah-header-2) 60%, #04120d 100%)",
      }}
    >
      <div className="w-full max-w-sm">
        <div
          className="rounded-3xl p-6"
          style={{
            background: "var(--ah-surface)",
            border: "1px solid var(--ah-border)",
            boxShadow: "var(--ah-shadow-lg)",
          }}
        >
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3"
              style={{
                background: "linear-gradient(140deg, var(--ah-brand), var(--ah-header))",
                color: "#fff",
                boxShadow: "var(--ah-shadow-brand)",
              }}
            >
              <i className="fa-solid fa-wallet" />
            </div>
            <h2 className="text-xl font-bold text-ink">মাই পার্সোনাল হিসাব</h2>
            <p className="text-xs text-ink-3 mt-1">
              আপনার ব্যক্তিগত ও ফ্যামিলি আয়-ব্যয় ম্যানেজার
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="label">ইউজারনেম (Username)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="input"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="label">পিন / পাসওয়ার্ড (PIN / Password)</label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="input pr-11"
                  placeholder="••••"
                  inputMode="text"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  tabIndex={-1}
                  title={showPin ? "পিন লুকান" : "পিন দেখান"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-1 text-ink-3 hover:text-brand"
                >
                  <i className={`fa-solid ${showPin ? "fa-eye-slash" : "fa-eye"} text-sm`} />
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4"
                style={{ accentColor: "var(--ah-brand)" }}
              />
              <span>
                <i className="fa-solid fa-bookmark me-1 text-brand text-[10px]" />
                মনে রাখুন (Remember Username)
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-block"
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" /> লগইন হচ্ছে...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-right-to-bracket" /> লগইন করুন (Login)
                </>
              )}
            </button>
          </form>
        </div>

        <p
          className="text-center text-[11px] mt-4"
          style={{ color: "var(--ah-header-text-2)" }}
        >
          আপনার তথ্য সুরক্ষিত ও সম্পূর্ণ আপনার নিয়ন্ত্রণে
        </p>
      </div>
    </div>
  );
}
