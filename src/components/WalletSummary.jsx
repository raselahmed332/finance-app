export default function WalletSummary({ title, currency, summary }) {
  return <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-3.5 shadow-sm">
    <div className="flex items-center gap-2 mb-2 text-indigo-900 font-bold text-sm"><span className="text-lg">🇧🇩</span><span>{title}</span></div>
    <div className="bg-indigo-900 text-white rounded-xl p-3.5 flex justify-between items-center shadow-md mb-3">
      <div><div className="text-xs text-indigo-200 font-medium">মোট ব্যালেন্স</div><div className="text-2xl font-bold">{currency} {summary.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
      <div className="bg-indigo-800 p-2.5 rounded-lg text-xl"><i className="fa-solid fa-wallet"></i></div>
    </div>
    <div className="grid grid-cols-2 gap-2 mb-3">
      <div className="bg-white border border-indigo-100 rounded-xl p-2 text-center"><div className="text-[10px] text-gray-500 font-semibold">Cash</div><div className="text-xs font-bold mt-1">{currency} {summary.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
      <div className="bg-white border border-indigo-100 rounded-xl p-2 text-center"><div className="text-[10px] text-gray-500 font-semibold">Bank</div><div className="text-xs font-bold mt-1">{currency} {summary.bank.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>
    </div>
    <div className="grid grid-cols-2 gap-2"><div className="bg-white border border-emerald-100 rounded-xl p-2 px-3"><div className="text-[11px] text-gray-500">মোট আয়</div><div className="text-sm font-bold text-emerald-600">{currency} {summary.income.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div><div className="bg-white border border-red-100 rounded-xl p-2 px-3"><div className="text-[11px] text-gray-500">মোট খরচ</div><div className="text-sm font-bold text-rose-600">{currency} {summary.expense.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div></div>
  </div>;
}
