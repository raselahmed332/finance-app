import { useState } from "react";
import { api } from "../api.js";

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [pin, setPin] = useState('1234');
  const [error, setError] = useState('');

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setError('');
    api.login(username, pin).then((res) => {
      if (res.status === 'SUCCESS') {
        onLogin(res.user);
      } else {
        setError(res.message);
      }
    }).catch((err) => setError(String(err)));
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

        {error && <div className="mb-4 text-xs bg-red-100 text-red-600 p-2.5 rounded-lg text-center font-medium">{error}</div>}

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ইউজারনেম (Username)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">পিন (PIN)</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="****"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl shadow-md text-sm transition-all"
          >
            লগইন করুন (Login)
          </button>
        </form>
        <div className="mt-4 text-center text-xs text-gray-400">
          ডিফল্ট লগইন: admin / 1234
        </div>
      </div>
    </div>
  );
}
