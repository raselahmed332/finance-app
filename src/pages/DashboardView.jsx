import WalletSummary from "../components/WalletSummary.jsx";

export default function DashboardView({ sar, personalBdt, bdt, setActiveTab, isAdmin }) {
  const todayDateStr = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div className="space-y-4">
      <div className="text-center text-xs text-slate-500 font-medium my-1">
        {todayDateStr}
      </div>

      {/* SAR Card */}
      {isAdmin && <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3.5 shadow-sm">
        <div className="flex items-center gap-2 mb-2 text-emerald-800 font-bold text-sm">
          <span className="text-lg">🇸🇦</span>
          <span>Saudi / SAR (আমার পার্সোনাল)</span>
        </div>

        <div className="bg-emerald-700 text-white rounded-xl p-3.5 flex justify-between items-center shadow-md mb-3">
          <div>
            <div className="text-xs text-emerald-200 font-medium">মোট ব্যালেন্স</div>
            <div className="text-2xl font-bold tracking-wide">SAR {sar.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-emerald-600/80 p-2.5 rounded-lg text-white text-xl">
            <i className="fa-solid fa-wallet"></i>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-white border border-emerald-100 rounded-xl p-2 text-center shadow-2xs">
            <div className="text-[10px] text-gray-500 flex items-center justify-center gap-1 font-semibold">
              <i className="fa-solid fa-money-bill-wave text-emerald-600"></i> Cash
            </div>
            <div className="text-xs font-bold text-slate-800 mt-1">SAR {sar.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-white border border-emerald-100 rounded-xl p-2 text-center shadow-2xs">
            <div className="text-[10px] text-gray-500 flex items-center justify-center gap-1 font-semibold">
              <i className="fa-solid fa-building-columns text-teal-600"></i> Bank
            </div>
            <div className="text-xs font-bold text-slate-800 mt-1">SAR {sar.bank.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-emerald-100 rounded-xl p-2 px-3">
            <div className="text-[11px] text-gray-500 font-medium">মোট আয়</div>
            <div className="text-sm font-bold text-emerald-600 mt-0.5">
              <i className="fa-solid fa-arrow-up text-xs me-1"></i>SAR {sar.income.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white border border-red-100 rounded-xl p-2 px-3">
            <div className="text-[11px] text-gray-500 font-medium">মোট খরচ</div>
            <div className="text-sm font-bold text-rose-600 mt-0.5">
              <i className="fa-solid fa-arrow-down text-xs me-1"></i>SAR {sar.expense.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>}

      {isAdmin && <WalletSummary title="Bangladesh / BDT (আমার পার্সোনাল)" currency="BDT" summary={personalBdt} color="indigo" />}

      {/* BDT Family Card */}
      <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-3.5 shadow-sm">
        <div className="flex items-center gap-2 mb-2 text-blue-900 font-bold text-sm">
          <span className="text-lg">🇧🇩</span>
          <span>Bangladesh / BDT (ফ্যামিলি হিসাব)</span>
        </div>

        <div className="bg-blue-900 text-white rounded-xl p-3.5 flex justify-between items-center shadow-md mb-3">
          <div>
            <div className="text-xs text-blue-200 font-medium">মোট ব্যালেন্স</div>
            <div className="text-2xl font-bold tracking-wide">BDT {bdt.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-blue-800/80 p-2.5 rounded-lg text-white text-xl">
            <i className="fa-solid fa-wallet"></i>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-white border border-blue-100 rounded-xl p-2 text-center shadow-2xs">
            <div className="text-[10px] text-gray-500 flex items-center justify-center gap-1 font-semibold">
              <i className="fa-solid fa-money-bill-wave text-blue-600"></i> Cash
            </div>
            <div className="text-xs font-bold text-slate-800 mt-1">BDT {bdt.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-white border border-blue-100 rounded-xl p-2 text-center shadow-2xs">
            <div className="text-[10px] text-gray-500 flex items-center justify-center gap-1 font-semibold">
              <i className="fa-solid fa-building-columns text-indigo-600"></i> Bank
            </div>
            <div className="text-xs font-bold text-slate-800 mt-1">BDT {bdt.bank.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-emerald-100 rounded-xl p-2 px-3">
            <div className="text-[11px] text-gray-500 font-medium">মোট আয়</div>
            <div className="text-sm font-bold text-emerald-600 mt-0.5">
              <i className="fa-solid fa-arrow-up text-xs me-1"></i>BDT {bdt.income.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-white border border-red-100 rounded-xl p-2 px-3">
            <div className="text-[11px] text-gray-500 font-medium">মোট খরচ</div>
            <div className="text-sm font-bold text-rose-600 mt-0.5">
              <i className="fa-solid fa-arrow-down text-xs me-1"></i>BDT {bdt.expense.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Buttons */}
      <div className="pt-2">
        <div className="text-xs font-bold text-gray-700 mb-2">দ্রুত অ্যাকশন</div>
        <div className={isAdmin ? 'grid grid-cols-5 gap-1.5' : 'grid grid-cols-2 gap-2'}>
          {isAdmin && <button onClick={() => setActiveTab('income')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-plus"></i></div>
            <span className="text-[11px] font-semibold leading-tight text-center">Income<br /><span className="text-[9px] opacity-80">(আয়)</span></span>
          </button>}
          <button onClick={() => setActiveTab('expense')} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-minus"></i></div>
            <span className="text-[11px] font-semibold leading-tight text-center">Expense<br /><span className="text-[9px] opacity-80">(খরচ)</span></span>
          </button>
          {isAdmin && <button onClick={() => setActiveTab('transfer')} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-arrow-right-arrow-left"></i></div>
            <span className="text-[11px] font-semibold leading-tight text-center">Transfer<br /><span className="text-[9px] opacity-80">(ট্রান্সফার)</span></span>
          </button>}
          <button onClick={() => setActiveTab('transactions')} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-list-check"></i></div>
            <span className="text-[11px] font-semibold leading-tight text-center">Transactions<br /><span className="text-[9px] opacity-80">(হিসাব)</span></span>
          </button>
          {isAdmin && <button onClick={() => setActiveTab('reports')} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-2 flex flex-col items-center justify-center gap-1 shadow-sm transition-transform active:scale-95">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs"><i className="fa-solid fa-chart-column"></i></div>
            <span className="text-[11px] font-semibold leading-tight text-center">Reports<br /><span className="text-[9px] opacity-80">(রিপোর্ট)</span></span>
          </button>}
        </div>
      </div>

      {isAdmin && <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={() => setActiveTab('users')} className="bg-white border border-gray-200 rounded-xl p-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 shadow-2xs hover:bg-gray-50">
          <span><i className="fa-solid fa-users text-purple-600 me-2"></i>ইউজার ম্যানেজমেন্ট</span>
          <i className="fa-solid fa-chevron-right text-gray-400 text-xs"></i>
        </button>
        <button onClick={() => setActiveTab('settings')} className="bg-white border border-gray-200 rounded-xl p-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 shadow-2xs hover:bg-gray-50">
          <span><i className="fa-solid fa-gear text-slate-600 me-2"></i>সেটিংস ও ব্যাকআপ</span>
          <i className="fa-solid fa-chevron-right text-gray-400 text-xs"></i>
        </button>
      </div>}

    </div>
  );
}
