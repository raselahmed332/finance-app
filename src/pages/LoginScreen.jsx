import { useState } from "react";
import { api } from "../api.js";
import { useToast } from "../components/Toast.jsx";

const REMEMBER_KEY = "hisab_remember_login";

function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return { username: "", pin: "", remember: true };
    const parsed = JSON.parse(raw);
    return {
      username: parsed.username || "",
      pin: parsed.pin || "",
      remember: parsed.remember !== false,
    };
  } catch {
    return { username: "", pin: "", remember: true };
  }
}

export default function LoginScreen({ onLogin }) {
  const remembered = loadRemembered();
  const [username, setUsername] = useState(remembered.username);
  const [pin, setPin] = useState(remembered.pin);
  const [remember, setRemember] = useState(remembered.remember);
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    api.login(username, pin).then((res) => {
      if (res.status === 'SUCCESS') {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username, pin, remember: true }));
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-2">
            <i className="fa-solid fa-wallet"></i>
          </div>
          <h2 className="text-xl font-bold text-slate-800">মাই পার্সোনাল হিসাব</h2>
          <p className="text-xs text-gray-500">আপনার ব্যক্তিগত ও ফ্যামিলি আয়-ব্যয় ম্যানেজার</p>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ইউজারনেম (Username)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ইউজারনেম লিখুন"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">পিন (PIN)</label>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="****"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                tabIndex={-1}
                title={showPin ? "পিন লুকান" : "পিন দেখান"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 px-1.5 py-1"
              >
                <i className={`fa-solid ${showPin ? "fa-eye-slash" : "fa-eye"} text-sm`}></i>
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-emerald-600 w-4 h-4"
            />
            <span>
              <i className="fa-solid fa-bookmark me-1 text-emerald-600 text-[10px]"></i>
              মনে রাখুন (Remember Username &amp; Password)
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl shadow-md text-sm transition-all flex items-center justify-center gap-2"
          >
            {submitting ? <><i className="fa-solid fa-spinner fa-spin"></i> লগইন হচ্ছে...</> : 'লগইন করুন (Login)'}
          </button>
        </form>
      </div>
    </div>
  );
}