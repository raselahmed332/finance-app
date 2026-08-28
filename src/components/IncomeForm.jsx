import { useState } from "react";

export default function IncomeForm({ onSave, onCancel }) {
  const [currency, setCurrency] = useState('SAR');
  const [account, setAccount] = useState('Bank');
  const [sourceCategory, setSourceCategory] = useState('Salary');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) return alert('সঠিক পরিমাণ লিখুন!');
    onSave({ type: 'Income', currency, account, sourceCategory, description, amount, date, note });
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <button onClick={onCancel} className="text-gray-500 hover:text-slate-800">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 text-base text-center flex-1 text-emerald-600">
          Income (আয় যোগ করুন)
        </h3>
        <div className="w-5"></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Currency (হিসাব নির্ধারণ করুন)</label>
          <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
            <button type="button" onClick={() => setCurrency('SAR')} className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${currency === 'SAR' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600'}`}>
              <span>🇸🇦</span> SAR
            </button>
            <button type="button" onClick={() => setCurrency('BDT')} className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${currency === 'BDT' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600'}`}>
              <span>🇧🇩</span> BDT
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Account (অ্যাকাউন্ট)</label>
          <select value={account} onChange={(e) => setAccount(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white">
            <option value="Cash">Cash</option>
            <option value="Bank">Bank</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Income Source (কোথা থেকে এসেছে)</label>
          <select value={sourceCategory} onChange={(e) => setSourceCategory(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white">
            <option value="Salary">Salary</option>
            <option value="Business">Business</option>
            <option value="Remittance">Remittance</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Description (বিবরণ)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="যেমন: May Salary" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Amount</label>
          <div className="relative flex items-center">
            <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 rounded-xl pl-3 pr-14 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500" required />
            <span className="absolute right-3 text-xs font-bold text-gray-400">{currency}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white" required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 resize-none"></textarea>
        </div>

        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2 mt-2">
          <i className="fa-solid fa-floppy-disk"></i> Save Income
        </button>
      </form>
    </div>
  );
}
