import WalletCard from "../components/WalletCard.jsx";

export default function DashboardView({ wallets, walletSummaries, setActiveTab, setFilterWallet, can }) {
  const openWallet = (wallet) => {
    if (!can('VIEW_TRANSACTIONS')) return;
    setFilterWallet(String(wallet.WalletID));
    setActiveTab('transactions');
  };

  return (
    <div className="space-y-4">
      {wallets.length === 0 && (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-xs">
          আপনার কোনো Wallet এ এক্সেস নেই। Admin এর সাথে যোগাযোগ করুন।
        </div>
      )}

      {wallets.map((wallet, i) => (
        <WalletCard key={wallet.WalletID} wallet={wallet} summary={walletSummaries[wallet.WalletID]} index={i} onOpen={can('VIEW_TRANSACTIONS') ? () => openWallet(wallet) : undefined} />
      ))}

      {/* Quick Buttons */}
      {(can('ADD_USER') || can('EDIT_USER') || can('DELETE_USER') || can('MANAGE_USER_PERMISSIONS')
        || can('ADD_WALLET') || can('EDIT_WALLET') || can('MANAGE_WALLET_STATUS')
        || can('BACKUP_RESTORE') || can('MANAGE_CATEGORIES') || can('VIEW_AUDIT_LOG')) && (
        <div className="pt-2">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">দ্রুত অ্যাকশন</div>
          <div className="flex gap-1.5">
            {(can('ADD_USER') || can('EDIT_USER') || can('DELETE_USER') || can('MANAGE_USER_PERMISSIONS')) && <button onClick={() => setActiveTab('users')} className="flex-1 min-w-0 bg-purple-600 hover:bg-purple-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-users"></i></div>
              <span className="text-[10px] font-semibold leading-tight text-center break-words">ইউজার ম্যানেজমেন্ট</span>
            </button>}
            {(can('ADD_WALLET') || can('EDIT_WALLET') || can('MANAGE_WALLET_STATUS')) && <button onClick={() => setActiveTab('wallets')} className="flex-1 min-w-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-vault"></i></div>
              <span className="text-[10px] font-semibold leading-tight text-center break-words">Wallet ম্যানেজমেন্ট</span>
            </button>}
            {(can('BACKUP_RESTORE') || can('MANAGE_CATEGORIES')) && <button onClick={() => setActiveTab('settings')} className="flex-1 min-w-0 bg-slate-600 hover:bg-slate-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-gear"></i></div>
              <span className="text-[10px] font-semibold leading-tight text-center break-words">সেটিংস</span>
            </button>}
            {can('VIEW_AUDIT_LOG') && <button onClick={() => setActiveTab('auditlog')} className="flex-1 min-w-0 bg-amber-600 hover:bg-amber-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-clock-rotate-left"></i></div>
              <span className="text-[10px] font-semibold leading-tight text-center break-words">Audit Log</span>
            </button>}
          </div>
        </div>
      )}
    </div>
  );
}
