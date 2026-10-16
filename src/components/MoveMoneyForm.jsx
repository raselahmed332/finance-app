import { useState } from "react";
import Select from "./Select.jsx";
import AccountSelect from "./AccountSelect.jsx";
import { useToast } from "./Toast.jsx";
import { todayStr, pickDefaultWalletId } from "../utils/loan.js";

// One screen for every money move. When From and To are the SAME wallet it is an
// account-to-account move and is sent through the existing Bank Operation path
// (addBankOp_ / BANK_OPERATIONS); when they differ it is a wallet-to-wallet
// transfer and is sent through the existing Transfer path (addTransfer_ /
// TRANSFER_MONEY). This is a UI-level merge only: both backend writers, both
// permissions, both row formats (Bank Operation `_1/_2` and Transfer `_OUT/_IN`)
// and all validation/rollback/duplicate detection stay exactly as they were.
export default function MoveMoneyForm({ wallets, currentUser, onSave, onCancel, can }) {
  const toast = useToast();
  const canTransfer = can ? can("TRANSFER_MONEY") : true;
  const canBankOp = can ? can("BANK_OPERATIONS") : true;

  const defaultFrom = pickDefaultWalletId(currentUser?.username, wallets);
  const [fromWalletId, setFromWalletId] = useState(defaultFrom);
  const [fromAccount, setFromAccount] = useState('Bank');
  const [fromAmount, setFromAmount] = useState('');

  const [toWalletId, setToWalletId] = useState(
    canTransfer
      ? ((wallets || []).find((w) => String(w.WalletID) !== String(defaultFrom))?.WalletID || defaultFrom || '')
      : defaultFrom
  );
  const [toAccount, setToAccount] = useState('Cash');
  const [toAmount, setToAmount] = useState('');

  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(36).slice(2)));

  const fromWallet = wallets.find((w) => w.WalletID === fromWalletId);
  const toWallet = wallets.find((w) => w.WalletID === toWalletId);
  const sameWallet = String(fromWalletId) === String(toWalletId);
  const sameCurrency = fromWallet?.Currency === toWallet?.Currency;
  // Same wallet + BANK_OPERATIONS -> the dedicated bank-operation writer.
  // Same wallet without it still works through the transfer writer (the backend
  // only rejects a transfer when wallet AND account are identical).
  const bankOpMode = sameWallet && canBankOp;

  const changeFromWallet = (id) => {
    setFromWalletId(id);
    setFromAmount('');
    setToAmount('');
    // Without TRANSFER_MONEY the money can only move inside one wallet, so the
    // destination wallet tracks the source.
    if (!canTransfer) setToWalletId(id);
  };
  const changeToWallet = (id) => { setToWalletId(id); setToAmount(''); };

  const finish = (promise) => promise.catch(() => {}).finally(() => setSubmitting(false));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!fromWalletId) return toast.error('From Wallet নির্বাচন করুন!');
    if (!fromAccount) return toast.error('From অ্যাকাউন্ট নির্বাচন করুন!');

    if (sameWallet) {
      if (!toAccount) return toast.error('To অ্যাকাউন্ট নির্বাচন করুন!');
      if (fromAccount === toAccount) return toast.error('একই Wallet ও Account-এ স্থানান্তর করা যাবে না — আলাদা দুইটি অ্যাকাউন্ট নির্বাচন করুন!');
      if (!fromAmount || Number(fromAmount) <= 0) return toast.error('সঠিক পরিমাণ লিখুন!');
      setSubmitting(true);
      if (bankOpMode) {
        return finish(onSave({
          type: 'Bank Operation', walletId: fromWalletId, currency: fromWallet?.Currency,
          fromAccount, toAccount, amount: fromAmount, date, description, note, clientId,
        }));
      }
      return finish(onSave({
        type: 'Transfer', fromWalletId, fromAccount, fromAmount, fromCurrency: fromWallet?.Currency,
        toWalletId: fromWalletId, toAccount, toAmount: toAmount || fromAmount, toCurrency: toWallet?.Currency,
        clientId, date, description, note,
      }));
    }

    if (!canTransfer) return toast.error('ভিন্ন Wallet-এ ট্রান্সফার করার অনুমতি নেই।');
    if (!toWalletId || !toAccount) return toast.error('To Wallet ও Account নির্বাচন করুন!');
    if (!fromAmount || Number(fromAmount) <= 0) return toast.error('সঠিক পরিমাণ লিখুন!');
    const received = toAmount || fromAmount;
    if (!received || Number(received) <= 0) return toast.error('Amount Received সঠিকভাবে লিখুন!');
    setSubmitting(true);
    return finish(onSave({
      type: 'Transfer', fromWalletId, fromAccount, fromAmount, fromCurrency: fromWallet?.Currency,
      toWalletId, toAccount, toAmount: received, toCurrency: toWallet?.Currency,
      clientId, date, description, note,
    }));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 space-y-4">
      <div className="flex items-center justify-between pb-3">
        <button onClick={onCancel} className="text-gray-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base text-center flex-1 text-blue-600 dark:text-blue-400">
          Transfer (ট্রান্সফার)
        </h3>
        <div className="w-5"></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">From (কোথা থেকে)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Wallet</label>
              <Select value={fromWalletId} onChange={changeFromWallet}>
                {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Account</label>
              <AccountSelect walletId={fromWalletId} value={fromAccount} onChange={setFromAccount} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Amount</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={fromAmount} onChange={(e) => { setFromAmount(e.target.value); if (sameCurrency) setToAmount(e.target.value); }} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg pl-2 pr-12 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" required />
              <span className="absolute right-2 text-[10px] font-bold text-gray-400 dark:text-gray-500">{fromWallet?.Currency}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center relative z-10">
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm shadow-md border-2 border-white dark:border-gray-900">
            <i className="fa-solid fa-right-left rotate-90"></i>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">To (কোথায়)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Wallet</label>
              {canTransfer ? (
                <Select value={toWalletId} onChange={changeToWallet}>
                  {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
                </Select>
              ) : (
                <div className="flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  <i className="fa-solid fa-lock text-[10px]"></i>
                  <span className="truncate">{fromWallet?.WalletName} ({fromWallet?.Currency})</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Account</label>
              <AccountSelect walletId={sameWallet ? fromWalletId : toWalletId} value={toAccount} onChange={setToAccount} />
            </div>
          </div>

          {!sameWallet && (
            <div>
              <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Amount Received</label>
              <div className="relative flex items-center">
                <input type="number" step="any" value={toAmount} onChange={(e) => setToAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg pl-2 pr-12 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" required />
                <span className="absolute right-2 text-[10px] font-bold text-gray-400 dark:text-gray-500">{toWallet?.Currency}</span>
              </div>
            </div>
          )}
        </div>

        {!sameWallet && fromWallet && toWallet && !sameCurrency && (
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
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Description (বিবরণ)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="যেমন: ATM Withdraw" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2">
          <i className={`${submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}`}></i> {submitting ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
