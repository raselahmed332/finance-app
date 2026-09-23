import { useState } from "react";
import Select from "./Select.jsx";
import Popup from "./Popup.jsx";

export default function EditTransactionForm({ transaction, onSave, onCancel }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(transaction ? {
    date: transaction.Date, type: transaction.Type, currency: transaction.Currency, account: transaction.Account,
    sourceCategory: transaction.SourceCategory || 'Other', whereVendor: transaction.WhereVendor || '',
    description: transaction.Description || '', amount: transaction.Amount, note: transaction.Note || '',
  } : {});

  if (!transaction) return (
    <Popup open title="Edit Transaction" onClose={onCancel}>
      <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">লেনদেন পাওয়া যায়নি।</div>
    </Popup>
  );

  const change = (key, value) => setForm({ ...form, [key]: value });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.amount || Number(form.amount) <= 0) return alert('সঠিক পরিমাণ লিখুন!');
    setSubmitting(true);
    onSave({ id: transaction.ID, walletId: transaction.WalletID, ...form })
      .catch(() => {})
      .finally(() => setSubmitting(false));
  };

  return (
    <Popup open title="Edit Transaction" onClose={submitting ? undefined : onCancel}>
      <div className="bg-slate-50 dark:bg-gray-950 rounded-xl px-3 py-2 text-xs text-slate-500 dark:text-gray-400 flex items-center gap-2">
        <i className="fa-solid fa-vault"></i> Wallet: <span className="font-semibold text-slate-700 dark:text-gray-200">{transaction.WalletName || transaction.WalletID}</span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="date" value={form.date || ''} onChange={(e) => change('date', e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" required />
        <div className="grid grid-cols-2 gap-2"><Select value={form.type || 'Expense'} onChange={change.bind(null, 'type')}><option>Income</option><option>Expense</option></Select><input value={form.currency || ''} readOnly className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-2 text-sm text-gray-500 dark:text-gray-400" /></div>
        <Select value={form.account || 'Cash'} onChange={change.bind(null, 'account')}><option>Cash</option><option>Bank</option></Select>
        <input value={form.sourceCategory || ''} onChange={(e) => change('sourceCategory', e.target.value)} placeholder="Category / Source" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" required />
        <input value={form.whereVendor || ''} onChange={(e) => change('whereVendor', e.target.value)} placeholder="Where / Vendor" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
        <input value={form.description || ''} onChange={(e) => change('description', e.target.value)} placeholder="Description" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
        <input type="number" step="any" value={form.amount || ''} onChange={(e) => change('amount', e.target.value)} placeholder="Amount" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" required />
        <textarea value={form.note || ''} onChange={(e) => change('note', e.target.value)} placeholder="Note" rows="2" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-sm resize-none bg-white dark:bg-gray-900 dark:text-gray-100"></textarea>
        <button disabled={submitting} className="w-full bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl"><i className="fa-solid fa-floppy-disk"></i> {submitting ? 'Updating...' : 'Update Transaction'}</button>
      </form>
    </Popup>
  );
}