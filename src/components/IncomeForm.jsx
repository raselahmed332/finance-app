import { useState } from "react";
import Select from "./Select.jsx";
import AccountSelect from "./AccountSelect.jsx";
import { useToast } from "./Toast.jsx";
import { FormHeader, AmountField } from "../ui/index.jsx";
import { todayStr } from "../utils/loan.js";

export default function IncomeForm({ wallets, categories, currentUser, onSave, onCancel, embedded }) {
  const incomeCategories = (categories || []).filter(c => c.Type === 'Income');
  const fallbackCategories = ['Salary', 'Business', 'Remittance', 'Other'];
  const [walletId, setWalletId] = useState("");
  const [account, setAccount] = useState("");
  const [sourceCategory, setSourceCategory] = useState(incomeCategories[0]?.Name || 'Salary');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  // Stable per-form-instance ID: if the same click is retried (double-click,
  // flaky network), the backend recognizes it and won't create a duplicate.
  const [clientId] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(36).slice(2)));

  const selectedWallet = wallets.find(w => w.WalletID === walletId);

  const changeWallet = (id) => {
    setWalletId(id);
    setAccount("");
    setAmount('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!walletId) return toast.error('একটি Wallet নির্বাচন করুন!');
    if (!account) return toast.error('একটি Account নির্বাচন করুন!');
    if (!amount || amount <= 0) return toast.error('সঠিক পরিমাণ লিখুন!');
    setSubmitting(true);
    // Disabled for exactly as long as the real request takes — no artificial wait.
    // The error itself is already shown via showAlert inside onSave; here we
    // only need to know when to re-enable the button.
    onSave({ type: 'Income', walletId, currency: selectedWallet?.Currency, account, sourceCategory, description, amount, date, note, clientId }).catch(() => {}).finally(() => setSubmitting(false));
  };

  return (
    <div className={embedded ? "space-y-4" : "card p-4 space-y-4"}>
      {!embedded && (
        <FormHeader
          title="Income (আয় যোগ করুন)"
          icon="fa-arrow-down"
          tone="success"
          onCancel={onCancel}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Wallet (কোন হিসাবে)</label>
            <Select value={walletId} onChange={changeWallet} required>
              <option value="">Select wallet</option>
              {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
            </Select>
          </div>

          <div>
            <label className="label">Account (অ্যাকাউন্ট)</label>
            <AccountSelect walletId={walletId} value={account} onChange={setAccount} />
          </div>
        </div>

        <div>
          <label className="label">Income Source (কোথা থেকে এসেছে)</label>
          <Select value={sourceCategory} onChange={setSourceCategory}>
            {incomeCategories.length > 0
              ? incomeCategories.map(c => <option key={c.CategoryID} value={c.Name}>{c.Name}</option>)
              : fallbackCategories.map(name => <option key={name} value={name}>{name}</option>)}
          </Select>
        </div>

        <div>
          <label className="label">Amount</label>
          <AmountField
            value={amount}
            onChange={setAmount}
            currency={selectedWallet?.Currency}
            tone="success"
          />
        </div>

        <div>
          <label className="label">Description (বিবরণ)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="যেমন: May Salary" className="input" />
        </div>

        <div>
          <label className="label">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
        </div>

        <div>
          <label className="label">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="textarea"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="btn btn-primary btn-block mt-2">
          <i className={`${submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}`}></i> {submitting ? 'Saving...' : 'Save Income'}
        </button>
      </form>
    </div>
  );
}
