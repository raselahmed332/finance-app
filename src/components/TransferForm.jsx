import { useState } from "react";
import Select from "./Select.jsx";
import { useToast } from "./Toast.jsx";
import { todayStr, pickDefaultWalletId } from "../utils/loan.js";

export default function TransferForm({ wallets, currentUser, onSave, onCancel }) {
  const toast = useToast();
  const defaultFrom = pickDefaultWalletId(currentUser?.username, wallets);
  const [fromWalletId, setFromWalletId] = useState(defaultFrom);
  const [fromAccount, setFromAccount] = useState('Bank');
  const [fromAmount, setFromAmount] = useState('');

  const [toWalletId, setToWalletId] = useState((wallets || []).find((w) => String(w.WalletID) !== String(defaultFrom))?.WalletID || defaultFrom || '');
  const [toAccount, setToAccount] = useState('Cash');
  const [toAmount, setToAmount] = useState('');

  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(36).slice(2)));

  const fromWallet = wallets.find(w => w.WalletID === fromWalletId);
  const toWallet = wallets.find(w => w.WalletID === toWalletId);

  // Clearing amounts on wallet switch prevents a value typed under one wallet's
  // currency from being silently re-tagged with another wallet's currency.
  const changeFromWallet = (id) => { setFromWalletId(id); setFromAmount(''); setToAmount(''); };
  const changeToWallet = (id) => { setToWalletId(id); setToAmount(''); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!fromWalletId || !toWalletId) return toast.error('From এবং To Wallet নির্বাচন করুন!');
    if (fromWalletId === toWalletId && fromAccount === toAccount) return toast.error('একই Wallet ও Account এ ট্রান্সফার করা যাবে না!');
    if (!fromAmount || Number(fromAmount) <= 0) return toast.error('সঠিক পরিমাণ লিখুন!');
    const received = toAmount || fromAmount;
    if (!received || Number(received) <= 0) return toast.error('Amount Received (To) সঠিকভাবে লিখুন!');
    setSubmitting(true);
    onSave({
      type: 'Transfer', fromWalletId, fromAccount, fromAmount, fromCurrency: fromWallet?.Currency,
      toWalletId, toAccount, toAmount: received, toCurrency: toWallet?.Currency,
      clientId,
      date, note,
    }).catch(() => {}).finally(() => setSubmitting(false));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <button onClick={onCancel} className="text-gray-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base text-center flex-1 text-blue-600 dark:text-blue-400">
          Transfer (ট্রান্সফার)
        </h3>
        <div className="w-5"></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 dark:bg-gray-950 border border-slate-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">From (কোথা থেকে)</div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Wallet</label>
            <Select value={fromWalletId} onChange={changeFromWallet}>
              {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Account</label>
            <Select value={fromAccount} onChange={setFromAccount}>
              <option value="Bank">Bank</option>
              <option value="Cash">Cash</option>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Amount</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={fromAmount} onChange={(e) => { setFromAmount(e.target.value); if (fromWallet?.Currency === toWallet?.Currency) setToAmount(e.target.value); }} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg pl-2 pr-12 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" required />
              <span className="absolute right-2 text-[10px] font-bold text-gray-400 dark:text-gray-500">{fromWallet?.Currency}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-2 relative z-10">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow-md border-2 border-white dark:border-gray-900">
            <i className="fa-solid fa-arrows-up-down"></i>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 border border-slate-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">To (কোথায়)</div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Wallet</label>
            <Select value={toWalletId} onChange={changeToWallet}>
              {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Account</label>
            <Select value={toAccount} onChange={setToAccount}>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Amount Received</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={toAmount} onChange={(e) => setToAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg pl-2 pr-12 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" required />
              <span className="absolute right-2 text-[10px] font-bold text-gray-400 dark:text-gray-500">{toWallet?.Currency}</span>
            </div>
          </div>
        </div>

        {fromWallet && toWallet && fromWallet.Currency !== toWallet.Currency && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
            <i className="fa-solid fa-triangle-exclamation me-1"></i>
            ভিন্ন কারেন্সি — কোনো স্বয়ংক্রিয় কনভার্সন হবে না, "Amount Received" নিজে দিন।
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-sm resize-none bg-white dark:bg-gray-900 dark:text-gray-100"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2">
          <i className={`${submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}`}></i> {submitting ? 'Saving...' : 'Save Transfer'}
        </button>
      </form>
    </div>
  );
}
