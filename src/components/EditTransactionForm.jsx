import { useState } from "react";
import Select from "./Select.jsx";
import AccountSelect from "./AccountSelect.jsx";
import Popup from "./Popup.jsx";
import { useToast } from "./Toast.jsx";

export default function EditTransactionForm({ transaction, onSave, onCancel }) {
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const [form, setForm] = useState(transaction ? {
    date: transaction.Date, type: transaction.Type, currency: transaction.Currency, account: transaction.Account,
    sourceCategory: transaction.SourceCategory || 'Other', whereVendor: transaction.WhereVendor || '',
    description: transaction.Description || '', amount: transaction.Amount, note: transaction.Note || '',
  } : {});

  if (!transaction) return (
    <Popup open title="Edit Transaction" onClose={onCancel}>
      <div className="text-center text-ink-3 text-sm py-4">লেনদেন পাওয়া যায়নি।</div>
    </Popup>
  );

  const change = (key, value) => setForm({ ...form, [key]: value });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.account) return toast.error('একটি Account নির্বাচন করুন!');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('সঠিক পরিমাণ লিখুন!');
    setSubmitting(true);
    onSave({ id: transaction.ID, walletId: transaction.WalletID, ...form })
      .catch(() => {})
      .finally(() => setSubmitting(false));
  };

  return (
    <Popup open title="Edit Transaction" onClose={submitting ? undefined : onCancel}>
      <div className="card-inset px-3 py-2 text-xs text-ink-2 flex items-center gap-2">
        <i className="fa-solid fa-vault"></i> Wallet: <span className="font-semibold text-ink">{transaction.WalletName || transaction.WalletID}</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="date" value={form.date || ''} onChange={(e) => change('date', e.target.value)} className="input" required />
        <div className="grid grid-cols-2 gap-2"><Select value={form.type || 'Expense'} onChange={change.bind(null, 'type')}><option>Income</option><option>Expense</option></Select><input value={form.currency || ''} readOnly className="border border-[var(--ah-border)] bg-[var(--ah-surface-2)] rounded-xl px-3 py-2 text-sm text-ink-3" /></div>
        <AccountSelect walletId={transaction.WalletID} value={form.account || ''} onChange={change.bind(null, 'account')} />
        <input value={form.sourceCategory || ''} onChange={(e) => change('sourceCategory', e.target.value)} placeholder="Category / Source" className="input" required />
        <input value={form.whereVendor || ''} onChange={(e) => change('whereVendor', e.target.value)} placeholder="Where / Vendor" className="input" />
        <input value={form.description || ''} onChange={(e) => change('description', e.target.value)} placeholder="Description" className="input" />
        <input type="number" step="any" value={form.amount || ''} onChange={(e) => change('amount', e.target.value)} placeholder="Amount" className="input" required />
        <textarea value={form.note || ''} onChange={(e) => change('note', e.target.value)} placeholder="Note" rows="2" className="textarea"></textarea>
        <button disabled={submitting} className="btn btn-primary btn-block">{submitting ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-floppy-disk"></i>} {submitting ? 'Updating...' : 'Update Transaction'}</button>
      </form>
    </Popup>
  );
}