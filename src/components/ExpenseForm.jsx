import { useState } from "react";
import Select from "./Select.jsx";
import AccountSelect from "./AccountSelect.jsx";
import { useToast } from "./Toast.jsx";
import { FormHeader, AmountField } from "../ui/index.jsx";
import { todayStr } from "../utils/loan.js";

export default function ExpenseForm({ wallets, categories, currentUser, onSave, onCancel, embedded }) {
  const expenseCategories = (categories || []).filter(c => c.Type === 'Expense');
  const fallbackCategories = ['Food', 'Transport', 'Shopping', 'Mobile/Internet', 'Bills & Utility', 'Rent', 'Other'];
  const [walletId, setWalletId] = useState("");
  const [account, setAccount] = useState("");
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
    onSave({ type: 'Expense', walletId, currency: selectedWallet?.Currency, account, sourceCategory: category, whereVendor, description, amount, date, note, clientId }).catch(() => {}).finally(() => setSubmitting(false));
  };

  return (
    <div className={embedded ? "space-y-3" : "card p-4 space-y-4"}>
      {!embedded && (
        <FormHeader
          title="Expense (খরচ যোগ করুন)"
          icon="fa-arrow-up"
          tone="danger"
          onCancel={onCancel}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
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
          <label className="label">Category (খরচের ধরন)</label>
          <Select value={category} onChange={setCategory}>
            {expenseCategories.length > 0
              ? expenseCategories.map(c => <option key={c.CategoryID} value={c.Name}>{c.Name}</option>)
              : fallbackCategories.map(name => <option key={name} value={name}>{name}</option>)}
          </Select>
        </div>

        <div>
          <label className="label">Amount</label>
          <AmountField
            value={amount}
            onChange={setAmount}
            currency={selectedWallet?.Currency}
            tone="danger"
          />
        </div>

        <div>
          <label className="label">Where (কোথায় খরচ হয়েছে)</label>
          <input type="text" value={whereVendor} onChange={(e) => setWhereVendor(e.target.value)} placeholder="যেমন: Restaurant, Supermarket" className="input" />
        </div>

        <div>
          <label className="label">Description (বিবরণ)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="যেমন: Lunch" className="input" />
        </div>

        <div>
          <label className="label">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
        </div>

        <div>
          <label className="label">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="textarea"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="btn btn-danger btn-block mt-2">
          <i className={`${submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}`}></i> {submitting ? 'Saving...' : 'Save Expense'}
        </button>
      </form>
    </div>
  );
}
