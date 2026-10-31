import { Icon } from "../ui/Icon.jsx";
import { useState } from "react";
import Select from "./Select.jsx";
import AccountSelect from "./AccountSelect.jsx";
import { useToast } from "./Toast.jsx";
import { todayStr } from "../utils/loan.js";

// One screen for every money move. When From and To are the SAME wallet it is an
// account-to-account move and is sent through the existing Bank Operation path
// (addBankOp_ / BANK_OPERATIONS); when they differ it is a wallet-to-wallet
// transfer and is sent through the existing Transfer path (addTransfer_ /
// TRANSFER_MONEY). This is a UI-level merge only: both backend writers, both
// permissions, both row formats (Bank Operation `_1/_2` and Transfer `_OUT/_IN`)
// and all validation/rollback/duplicate detection stay exactly as they were.
export default function MoveMoneyForm({ wallets, currentUser, onSave, onCancel, can, embedded }) {
  const toast = useToast();
  const canTransfer = can ? can("TRANSFER_MONEY") : true;
  const canBankOp = can ? can("BANK_OPERATIONS") : true;

  const [fromWalletId, setFromWalletId] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [fromAmount, setFromAmount] = useState('');

  const [toWalletId, setToWalletId] = useState("");
  const [toAccount, setToAccount] = useState("");
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
    setFromAccount("");
    setToAccount("");
    setFromAmount('');
    setToAmount('');
    // Without TRANSFER_MONEY the money can only move inside one wallet, so the
    // destination wallet tracks the source.
    if (!canTransfer) setToWalletId(id);
  };
  const changeToWallet = (id) => {
    setToWalletId(id);
    setToAccount("");
    setToAmount('');
  };

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
    <div className={embedded ? "space-y-4" : "card p-4 space-y-4"}>
      {!embedded && (
        <div className="flex items-center justify-between pb-3">
          <button onClick={onCancel} className="text-ink-3 hover:text-ink dark:text-ink-3 dark:hover:text-gray-200">
            <Icon name="arrow-left" className="text-lg" />
          </button>
          <h3 className="font-bold text-ink text-base text-center flex-1 text-[var(--ah-info)]">
            Transfer (ট্রান্সফার)
          </h3>
          <div className="w-5"></div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card-inset p-3 space-y-2">
          <div className="text-xs font-bold text-ink uppercase tracking-wider">From (কোথা থেকে)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Wallet</label>
              <Select value={fromWalletId} onChange={changeFromWallet}>
                <option value="">Select wallet</option>
                {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
              </Select>
            </div>
            <div>
              <label className="label">Account</label>
              <AccountSelect walletId={fromWalletId} value={fromAccount} onChange={setFromAccount} />
            </div>
          </div>

          <div>
            <label className="label">Amount</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={fromAmount} onChange={(e) => { setFromAmount(e.target.value); if (sameCurrency) setToAmount(e.target.value); }} placeholder="0.00" className="input pr-12 py-1.5 text-xs font-semibold" required />
              <span className="absolute right-2 text-[10px] font-bold text-ink-3">{fromWallet?.Currency}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center relative z-10">
          <div className="w-9 h-9 rounded-full bg-[var(--ah-info)] text-white flex items-center justify-center text-sm shadow-md border-2 border-white dark:border-gray-900">
            <Icon name="arrow-left-right" className="rotate-90" />
          </div>
        </div>

        <div className="card-inset p-3 space-y-2">
          <div className="text-xs font-bold text-ink uppercase tracking-wider">To (কোথায়)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Wallet</label>
              {canTransfer ? (
                <Select value={toWalletId} onChange={changeToWallet}>
                  <option value="">Select wallet</option>
                  {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
                </Select>
              ) : (
                <div className="flex items-center gap-1.5 border border-[var(--ah-border)] rounded-lg px-2 py-1.5 text-xs bg-[var(--ah-surface-3)] text-ink-3">
                  <Icon name="lock" className="text-[10px]" />
                  <span className="truncate">{fromWallet ? `${fromWallet.WalletName} (${fromWallet.Currency})` : "Select source wallet first"}</span>
                </div>
              )}
            </div>
            <div>
              <label className="label">Account</label>
              <AccountSelect walletId={sameWallet ? fromWalletId : toWalletId} value={toAccount} onChange={setToAccount} />
            </div>
          </div>

          {!sameWallet && (
            <div>
              <label className="label">Amount Received</label>
              <div className="relative flex items-center">
                <input type="number" step="any" value={toAmount} onChange={(e) => setToAmount(e.target.value)} placeholder="0.00" className="input pr-12 py-1.5 text-xs font-semibold" required />
                <span className="absolute right-2 text-[10px] font-bold text-ink-3">{toWallet?.Currency}</span>
              </div>
            </div>
          )}
        </div>

        {!sameWallet && fromWallet && toWallet && !sameCurrency && (
          <div className="card-warning p-2.5 text-[11px] text-[var(--ah-warning)]">
            <Icon name="triangle-alert" className="me-1" />
            ভিন্ন কারেন্সি — কোনো স্বয়ংক্রিয় কনভার্সন হবে না, "Amount Received" নিজে দিন।
          </div>
        )}

        <div>
          <label className="label">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
        </div>
        <div>
          <label className="label">Description (বিবরণ)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="যেমন: ATM Withdraw" className="input" />
        </div>
        <div>
          <label className="label">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="input"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="btn btn-primary btn-block">
          <Icon name={submitting ? "loader-circle" : "save"} /> {submitting ? 'Saving...' : 'Save'}
        </button>
      </form>
    </div>
  );
}
