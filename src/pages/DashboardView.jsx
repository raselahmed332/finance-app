import WalletCard from "../components/WalletCard.jsx";

export default function DashboardView({ wallets, walletSummaries, setActiveTab, can }) {
  return (
    <div className="space-y-4">
      {wallets.length === 0 && (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-xs">
          আপনার কোনো Wallet এ এক্সেস নেই। Admin এর সাথে যোগাযোগ করুন।
        </div>
      )}

      {wallets.map((wallet, i) => (
        <WalletCard key={wallet.WalletID} wallet={wallet} summary={walletSummaries[wallet.WalletID]} index={i} />
      ))}

      {/* Quick Buttons */}
      {wallets.length > 0 && (
        <div className="pt-2">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">দ্রুত অ্যাকশন</div>
          <div className="grid grid-cols-5 gap-1.5">
            {can('add_income') && <button onClick={() => setActiveTab('income')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-plus"></i></div>
              <span className="text-[11px] font-semibold leading-tight text-center">Income<br /><span className="text-[9px] opacity-80">(আয়)</span></span>
            </button>}
            {can('add_expense') && <button onClick={() => setActiveTab('expense')} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-minus"></i></div>
              <span className="text-[11px] font-semibold leading-tight text-center">Expense<br /><span className="text-[9px] opacity-80">(খরচ)</span></span>
            </button>}
            {can('add_transfer') && <button onClick={() => setActiveTab('transfer')} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-arrow-right-arrow-left"></i></div>
              <span className="text-[11px] font-semibold leading-tight text-center">Transfer<br /><span className="text-[9px] opacity-80">(ট্রান্সফার)</span></span>
            </button>}
            {can('view_transactions') && <button onClick={() => setActiveTab('transactions')} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-list-check"></i></div>
              <span className="text-[11px] font-semibold leading-tight text-center">Transactions<br /><span className="text-[9px] opacity-80">(হিসাব)</span></span>
            </button>}
            {can('view_reports') && <button onClick={() => setActiveTab('reports')} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-chart-column"></i></div>
              <span className="text-[11px] font-semibold leading-tight text-center">Reports<br /><span className="text-[9px] opacity-80">(রিপোর্ট)</span></span>
            </button>}
          </div>
        </div>
      )}

      {(can('view_users') || can('view_wallets') || can('manage_settings') || can('view_audit_log')) && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {can('view_users') && <button onClick={() => setActiveTab('users')} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-gray-200 shadow-2xs hover:bg-gray-50 dark:hover:bg-gray-800">
            <span><i className="fa-solid fa-users text-purple-600 me-2"></i>ইউজার ম্যানেজমেন্ট</span>
            <i className="fa-solid fa-chevron-right text-gray-400 dark:text-gray-500 text-xs"></i>
          </button>}
          {can('view_wallets') && <button onClick={() => setActiveTab('wallets')} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-gray-200 shadow-2xs hover:bg-gray-50 dark:hover:bg-gray-800">
            <span><i className="fa-solid fa-vault text-emerald-600 me-2"></i>Wallet ম্যানেজমেন্ট</span>
            <i className="fa-solid fa-chevron-right text-gray-400 dark:text-gray-500 text-xs"></i>
          </button>}
          {can('manage_settings') && <button onClick={() => setActiveTab('settings')} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-gray-200 shadow-2xs hover:bg-gray-50 dark:hover:bg-gray-800">
            <span><i className="fa-solid fa-gear text-slate-600 dark:text-gray-300 me-2"></i>সেটিংস ও ব্যাকআপ</span>
            <i className="fa-solid fa-chevron-right text-gray-400 dark:text-gray-500 text-xs"></i>
          </button>}
          {can('view_audit_log') && <button onClick={() => setActiveTab('auditlog')} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-gray-200 shadow-2xs hover:bg-gray-50 dark:hover:bg-gray-800">
            <span><i className="fa-solid fa-clock-rotate-left text-amber-600 me-2"></i>Audit Log</span>
            <i className="fa-solid fa-chevron-right text-gray-400 dark:text-gray-500 text-xs"></i>
          </button>}
        </div>
      )}
    </div>
  );
}
