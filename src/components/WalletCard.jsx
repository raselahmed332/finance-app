import { memo, useState } from "react";

const CURRENCY_FLAGS = {
  SAR: "🇸🇦", BDT: "🇧🇩", USD: "🇺🇸", EUR: "🇪🇺",
  KWD: "🇰🇼", GBP: "🇬🇧", AED: "🇦🇪",
};

const PALETTES = [
  { head: "bg-emerald-700", headBadge: "bg-emerald-600/80", tint: "bg-emerald-50/60 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-800 dark:text-emerald-300", pillText: "text-emerald-200", cashIcon: "text-emerald-600", bankIcon: "text-teal-600" },
  { head: "bg-indigo-900", headBadge: "bg-indigo-800", tint: "bg-indigo-50/60 dark:bg-indigo-900/20", border: "border-indigo-200 dark:border-indigo-800", text: "text-indigo-900 dark:text-indigo-300", pillText: "text-indigo-200", cashIcon: "text-indigo-600", bankIcon: "text-indigo-600" },
  { head: "bg-blue-900", headBadge: "bg-blue-800/80", tint: "bg-blue-50/60 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", text: "text-blue-900 dark:text-blue-300", pillText: "text-blue-200", cashIcon: "text-blue-600", bankIcon: "text-indigo-600" },
  { head: "bg-purple-800", headBadge: "bg-purple-700/80", tint: "bg-purple-50/60 dark:bg-purple-900/20", border: "border-purple-200 dark:border-purple-800", text: "text-purple-900 dark:text-purple-300", pillText: "text-purple-200", cashIcon: "text-purple-600", bankIcon: "text-purple-600" },
  { head: "bg-amber-700", headBadge: "bg-amber-600/80", tint: "bg-amber-50/60 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", text: "text-amber-900 dark:text-amber-300", pillText: "text-amber-200", cashIcon: "text-amber-600", bankIcon: "text-amber-600" },
  { head: "bg-rose-800", headBadge: "bg-rose-700/80", tint: "bg-rose-50/60 dark:bg-rose-900/20", border: "border-rose-200 dark:border-rose-800", text: "text-rose-900 dark:text-rose-300", pillText: "text-rose-200", cashIcon: "text-rose-600", bankIcon: "text-rose-600" },
];

export default memo(function WalletCard({ wallet, summary, index, onOpen }) {
  const p = PALETTES[index % PALETTES.length];
  const flag = CURRENCY_FLAGS[wallet.Currency] || "💰";
  const oc = parseFloat(wallet.OpeningCash) || 0;
  const ob = parseFloat(wallet.OpeningBank) || 0;
  const hasOpening = oc > 0 || ob > 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      className={`${p.tint} border ${p.border} rounded-2xl p-3.5 shadow-sm transition-colors ${onOpen ? "cursor-pointer active:scale-[0.99]" : ""}`}
    >
      <div className={`flex items-center gap-2 mb-2 ${p.text} font-bold text-sm`}>
        <span className="text-lg">{flag}</span>
        <span>{wallet.WalletName} ({wallet.Currency})</span>
      </div>

      <div className={`${p.head} text-white rounded-xl p-3.5 flex justify-between items-center shadow-md mb-3`}>
        <div>
          <div className={`text-xs ${p.pillText} font-medium`}>মোট ব্যালেন্স</div>
          <div className="text-2xl font-bold tracking-wide">{wallet.Currency} {summary.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className={`${p.headBadge} p-2.5 rounded-lg text-white text-xl`}>
          <i className="fa-solid fa-wallet"></i>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-2 text-center shadow-2xs">
          <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 font-semibold">
            <i className={`fa-solid fa-money-bill-wave ${p.cashIcon}`}></i> Cash
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-gray-100 mt-1">{wallet.Currency} {summary.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-2 text-center shadow-2xs">
          <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 font-semibold">
            <i className={`fa-solid fa-building-columns ${p.bankIcon}`}></i> Bank
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-gray-100 mt-1">{wallet.Currency} {summary.bank.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {hasOpening && (
        <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="w-full text-[10px] text-gray-400 dark:text-gray-500 text-center mb-3 flex items-center justify-center gap-1 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'}`}></i>
          শুরুর ব্যালেন্স
        </button>
      )}

      {hasOpening && expanded && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-2.5 mb-3 text-center text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
          <div>Cash: {wallet.Currency} {oc.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div>Bank: {wallet.Currency} {ob.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-800 rounded-xl p-2 px-3">
          <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">মোট আয়</div>
          <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            <i className="fa-solid fa-arrow-up text-xs me-1"></i>{wallet.Currency} {summary.income.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-red-100 dark:border-red-800 rounded-xl p-2 px-3">
          <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">মোট খরচ</div>
          <div className="text-sm font-bold text-rose-600 dark:text-rose-400 mt-0.5">
            <i className="fa-solid fa-arrow-down text-xs me-1"></i>{wallet.Currency} {summary.expense.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
})
