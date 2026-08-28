import { useState } from "react";

export default function TransferForm({ onSave, onCancel }) {
  const [fromCurrency, setFromCurrency] = useState('SAR');
  const [fromAccount, setFromAccount] = useState('Bank');
  const [fromAmount, setFromAmount] = useState('');

  const [toCurrency, setToCurrency] = useState('SAR');
  const [toAccount, setToAccount] = useState('Cash');
  const [toAmount, setToAmount] = useState('');

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fromAmount || fromAmount <= 0) return alert('সঠিক পরিমাণ লিখুন!');
    onSave({ type: 'Transfer', fromCurrency, fromAccount, fromAmount, toCurrency, toAccount, toAmount, date, note });
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <button onClick={onCancel} className="text-gray-500 hover:text-slate-800">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 text-base text-center flex-1 text-blue-600">
          Transfer (ট্রান্সফার)
        </h3>
        <div className="w-5"></div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">From (কোথা থেকে)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 font-medium mb-1">Currency</label>
              <select value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white font-semibold">
                <option value="SAR">🇸🇦 SAR</option>
                <option value="BDT">🇧🇩 BDT</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 font-medium mb-1">Account</label>
              <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                <option value="Bank">Bank</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 font-medium mb-1">Amount</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={fromAmount} onChange={(e) => { setFromAmount(e.target.value); if (fromCurrency === toCurrency) setToAmount(e.target.value); }} placeholder="0.00" className="w-full border border-gray-300 rounded-lg pl-2 pr-12 py-1.5 text-xs font-semibold" required />
              <span className="absolute right-2 text-[10px] font-bold text-gray-400">{fromCurrency}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-2 relative z-10">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow-md border-2 border-white">
            <i className="fa-solid fa-arrow-down-up"></i>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">To (কোথায়)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 font-medium mb-1">Currency</label>
              <select value={toCurrency} onChange={(e) => setToCurrency(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white font-semibold">
                <option value="SAR">🇸🇦 SAR</option>
                <option value="BDT">🇧🇩 BDT</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 font-medium mb-1">Account</label>
              <select value={toAccount} onChange={(e) => setToAccount(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 font-medium mb-1">Amount Received</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={toAmount} onChange={(e) => setToAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 rounded-lg pl-2 pr-12 py-1.5 text-xs font-semibold" required />
              <span className="absolute right-2 text-[10px] font-bold text-gray-400">{toCurrency}</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white" required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none"></textarea>
        </div>

        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2">
          <i className="fa-solid fa-floppy-disk"></i> Save Transfer
        </button>
      </form>
    </div>
  );
}
