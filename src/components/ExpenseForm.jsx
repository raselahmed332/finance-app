import { useState } from "react";
import Select from "./Select.jsx";
import { useToast } from "./Toast.jsx";
import { todayStr, pickDefaultWalletId } from "../utils/loan.js";

export default function ExpenseForm({ wallets, categories, currentUser, onSave, onCancel }) {
  const expenseCategories = (categories || []).filter(c => c.Type === 'Expense');
  const fallbackCategories = ['Food', 'Transport', 'Shopping', 'Mobile/Internet', 'Bills & Utility', 'Rent', 'Other'];
  const [walletId, setWalletId] = useState(pickDefaultWalletId(currentUser?.username, wallets));
  const [account, setAccount] = useState('Cash');
  const [category, setCategory] = useState(expenseCategories[0]?.Name || 'Food');
  const [whereVendor, setWhereVendor] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const [clientId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(36).slice(2)));

  const selectedWallet = wallets.find(w => w.WalletID === walletId);

  const changeWallet = (id) => {
    setWalletId(id);
    setAmount('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!walletId) return toast.error('একটি Wallet নির্বাচন করুন!');
    if (!amount || amount <= 0) return toast.error('সঠিক পরিমাণ লিখুন!');
    setSubmitting(true);
    onSave({ type: 'Expense', walletId, currency: selectedWallet?.Currency, account, sourceCategory: category, whereVendor, description, amount, date, note, clientId }).catch(() => {}).finally(() => setSubmitting(false));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <button onClick={onCancel} className="text-gray-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base text-center flex-1 text-rose-600">
          Expense (খরচ যোগ করুন)
        </h3>
        <div className="w-5"></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
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
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Category (খরচের ধরন)</label>
          <Select value={category} onChange={setCategory}>
            {expenseCategories.length > 0
              ? expenseCategories.map(c => <option key={c.CategoryID} value={c.Name}>{c.Name}</option>)
              : fallbackCategories.map(name => <option key={name} value={name}>{name}</option>)}
          </Select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Where (কোথায় খরচ হয়েছে)</label>
          <input type="text" value={whereVendor} onChange={(e) => setWhereVendor(e.target.value)} placeholder="যেমন: Restaurant, Supermarket" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Description (বিবরণ)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="যেমন: Lunch" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Amount</label>
          <div className="relative flex items-center">
            <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl pl-3 pr-14 py-2 text-sm font-semibold focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-900 dark:text-gray-100" required />
            <span className="absolute right-3 text-xs font-bold text-gray-400 dark:text-gray-500">{selectedWallet?.Currency}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-900 dark:text-gray-100" required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-rose-500 resize-none bg-white dark:bg-gray-900 dark:text-gray-100"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2 mt-2">
          <i className={`${submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}`}></i> {submitting ? 'Saving...' : 'Save Expense'}
        </button>
      </form>
    </div>
  );
}
