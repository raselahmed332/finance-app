import { useState } from "react";

export default function EditTransactionForm({ transaction, onSave, onCancel }) {
  const [form, setForm] = useState(transaction ? { date: transaction.Date, type: transaction.Type, currency: transaction.Currency, account: transaction.Account, sourceCategory: transaction.SourceCategory || 'Other', whereVendor: transaction.WhereVendor || '', description: transaction.Description || '', amount: transaction.Amount, note: transaction.Note || '' } : {});
  if (!transaction) return <div className="text-center text-gray-500 text-sm">লেনদেন পাওয়া যায়নি।</div>;
  const change = (key, value) => setForm({ ...form, [key]: value });
  return <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-4">
    <div className="flex items-center justify-between border-b border-gray-100 pb-3"><button onClick={onCancel} className="text-gray-500"><i className="fa-solid fa-arrow-left text-lg"></i></button><h3 className="font-bold text-slate-800 text-base">Edit Transaction</h3><div className="w-5"></div></div>
    <form onSubmit={(e) => { e.preventDefault(); if (!form.amount || Number(form.amount) <= 0) return alert('সঠিক পরিমাণ লিখুন!'); onSave({ id: transaction.ID, ...form }); }} className="space-y-3">
      <input type="date" value={form.date || ''} onChange={(e) => change('date', e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" required />
      <div className="grid grid-cols-2 gap-2"><select value={form.type || 'Expense'} onChange={(e) => change('type', e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm"><option>Income</option><option>Expense</option></select><select value={form.currency || 'SAR'} onChange={(e) => change('currency', e.target.value)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm"><option>SAR</option><option>BDT</option></select></div>
      <select value={form.account || 'Cash'} onChange={(e) => change('account', e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"><option>Cash</option><option>Bank</option></select>
      <input value={form.sourceCategory || ''} onChange={(e) => change('sourceCategory', e.target.value)} placeholder="Category / Source" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" required />
      <input value={form.whereVendor || ''} onChange={(e) => change('whereVendor', e.target.value)} placeholder="Where / Vendor" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
      <input value={form.description || ''} onChange={(e) => change('description', e.target.value)} placeholder="Description" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
      <input type="number" step="any" value={form.amount || ''} onChange={(e) => change('amount', e.target.value)} placeholder="Amount" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" required />
      <textarea value={form.note || ''} onChange={(e) => change('note', e.target.value)} placeholder="Note" rows="2" className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none"></textarea>
      <button className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl"><i className="fa-solid fa-floppy-disk"></i> Update Transaction</button>
    </form>
  </div>;
}
