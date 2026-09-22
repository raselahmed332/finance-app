import { useState } from "react";
import Select from "./Select.jsx";
import { todayStr, pickDefaultWalletId } from "../utils/loan.js";

export default function BankOperationForm({ wallets, currentUser, onSave, onCancel }) {
  const [type, setType] = useState('Bank Withdraw');
  const [walletId, setWalletId] = useState(pickDefaultWalletId(currentUser?.username, wallets));
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clientId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(36).slice(2)));
  const selectedWallet = wallets.find(w => w.WalletID === walletId);

  const changeWallet = (id) => {
    setWalletId(id);
    setAmount('');
  };

  const submit = (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!walletId) return alert('একটি Wallet নির্বাচন করুন!');
    if (!amount || Number(amount) <= 0) return alert('সঠিক পরিমাণ লিখুন!');
    setSubmitting(true);
    onSave({ type, walletId, currency: selectedWallet?.Currency, amount, date, description, note, clientId }).catch(() => {}).finally(() => setSubmitting(false));
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <button onClick={onCancel} className="text-gray-500 dark:text-gray-400"><i className="fa-solid fa-arrow-left text-lg"></i></button>
        <h3 className="font-bold text-blue-600 dark:text-blue-400">Bank Operation</h3>
        <div className="w-5"></div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Select value={type} onChange={setType}>
          <option value="Bank Withdraw">Withdraw from Bank to Cash</option>
          <option value="Bank Deposit">Deposit Cash to Bank</option>
        </Select>
        <Select value={walletId} onChange={changeWallet}>
          {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
        </Select>
        <div className="relative flex items-center">
          <input type="number" step="any" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl pl-3 pr-14 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
          <span className="absolute right-3 text-xs font-bold text-gray-400 dark:text-gray-500">{selectedWallet?.Currency}</span>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" required />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" rows="2" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-sm resize-none bg-white dark:bg-gray-900 dark:text-gray-100"></textarea>
        <button disabled={submitting} className="w-full bg-blue-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl"><i className="fa-solid fa-building-columns"></i> {submitting ? 'Saving...' : 'Save Operation'}</button>
      </form>
    </div>
  );
}
