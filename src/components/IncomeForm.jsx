import { useState } from "react";
import Select from "./Select.jsx";
import { todayStr } from "../utils/loan.js";

export default function IncomeForm({ wallets, categories, onSave, onCancel }) {
  const incomeCategories = (categories || []).filter(c => c.Type === 'Income');
  const fallbackCategories = ['Salary', 'Business', 'Remittance', 'Other'];
  const [walletId, setWalletId] = useState(wallets[0]?.WalletID || '');
  const [account, setAccount] = useState('Bank');
  const [sourceCategory, setSourceCategory] = useState(incomeCategories[0]?.Name || 'Salary');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Stable per-form-instance ID: if the same click is retried (double-click,
  // flaky network), the backend recognizes it and won't create a duplicate.
  const [clientId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(36).slice(2)));

  const selectedWallet = wallets.find(w => w.WalletID === walletId);

  const changeWallet = (id) => {
    setWalletId(id);
    setAmount('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!walletId) return alert('একটি Wallet নির্বাচন করুন!');
    if (!amount || amount <= 0) return alert('সঠিক পরিমাণ লিখুন!');
    setSubmitting(true);
    // Disabled for exactly as long as the real request takes — no artificial wait.
    // The error itself is already shown via showAlert inside onSave; here we
    // only need to know when to re-enable the button.
    onSave({ type: 'Income', walletId, currency: selectedWallet?.Currency, account, sourceCategory, description, amount, date, note, clientId }).catch(() => {}).finally(() => setSubmitting(false));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <button onClick={onCancel} className="text-gray-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base text-center flex-1 text-emerald-600">
          Income (আয় যোগ করুন)
        </h3>
        <div className="w-5"></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Wallet (কোন হিসাবে)</label>
          <Select value={walletId} onChange={changeWallet} required>
            {wallets.length === 0 && <option value="">কোনো Wallet এক্সেস নেই</option>}
            {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
          </Select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Account (অ্যাকাউন্ট)</label>
          <Select value={account} onChange={setAccount}>
            <option value="Cash">Cash</option>
            <option value="Bank">Bank</option>
          </Select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Income Source (কোথা থেকে এসেছে)</label>
          <Select value={sourceCategory} onChange={setSourceCategory}>
            {incomeCategories.length > 0
              ? incomeCategories.map(c => <option key={c.CategoryID} value={c.Name}>{c.Name}</option>)
              : fallbackCategories.map(name => <option key={name} value={name}>{name}</option>)}
          </Select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Description (বিবরণ)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="যেমন: May Salary" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Amount</label>
          <div className="relative flex items-center">
            <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl pl-3 pr-14 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" required />
            <span className="absolute right-3 text-xs font-bold text-gray-400 dark:text-gray-500">{selectedWallet?.Currency}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 resize-none bg-white dark:bg-gray-900 dark:text-gray-100"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2 mt-2">
          <i className="fa-solid fa-floppy-disk"></i> {submitting ? 'Saving...' : 'Save Income'}
        </button>
      </form>
    </div>
  );
}
