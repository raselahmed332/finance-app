import { useState, useRef } from "react";

function DefaultAvatarIcon({ className }) {
  return (
    <svg viewBox="0 0 512 512" className={className}>
      <circle cx="256" cy="256" r="246" fill="none" stroke="#9ca3af" strokeWidth="20" />
      <path
        fill="#9ca3af"
        d="M256 96c-52 0-94 42-94 94 0 30 14 57 36 74-56 20-96 60-108 110-3 12 6 24 19 24h294c13 0 22-12 19-24-12-50-52-90-108-110 22-17 36-44 36-74 0-52-42-94-94-94z"
      />
      <path fill="#fff" d="M196 356c14 26 36 42 60 42s46-16 60-42c-18-8-38-12-60-12s-42 4-60 12z" />
    </svg>
  );
}

const TYPE_BADGES = {
  Income: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Income" },
  Expense: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Expense" },
  "Transfer In": { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400", icon: "fa-arrow-down", label: "Transfer In" },
  "Transfer Out": { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", icon: "fa-arrow-up", label: "Transfer Out" },
  Transfer: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-400", icon: "fa-right-left", label: "Transfer" },
  Deposit: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Deposit" },
  Withdraw: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Withdraw" },
};

function getBadge(t) {
  var v = (t.WhereVendor || "").toLowerCase();
  if (v.includes("deposit")) return TYPE_BADGES.Deposit;
  if (v.includes("withdraw")) return TYPE_BADGES.Withdraw;
  return TYPE_BADGES[t.Type] || TYPE_BADGES.Transfer;
}

function SwipeCard({ t, canEdit, canDelete, onEdit, onDelete }) {
  const badge = getBadge(t);
  const isIncome = t.Type === "Income" || t.Type === "Transfer In";
  const isExpense = t.Type === "Expense" || t.Type === "Transfer Out";
  const ref = useRef(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    setSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!swiping) return;
    const diff = e.touches[0].clientX - startX.current;
    currentX.current = diff;
    setOffset(diff);
  };

  const handleTouchEnd = () => {
    setSwiping(false);
    if (currentX.current < -80 && canDelete) {
      onDelete(t.ID, t.WalletID);
    } else if (currentX.current > 80 && canEdit && (t.Type === "Income" || t.Type === "Expense" || t.Type === "Transfer Out" || t.Type === "Transfer In")) {
      onEdit(t);
    }
    setOffset(0);
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex">
        <div className="w-1/2 bg-blue-500 flex items-center justify-end pr-4 text-white text-xs font-semibold">
          <i className="fa-solid fa-pen me-1"></i> Edit
        </div>
        <div className="w-1/2 bg-red-500 flex items-center justify-start pl-4 text-white text-xs font-semibold">
          Delete <i className="fa-solid fa-trash-can ms-1"></i>
        </div>
      </div>

      <div
        ref={ref}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${offset}px)`, transition: swiping ? "none" : "transform 0.2s ease" }}
        className="relative bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 flex items-center justify-between shadow-2xs"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm ${badge.bg} ${badge.text}`}>
            <i className={`fa-solid ${badge.icon}`}></i>
          </div>
          <div>
            <div className="font-bold text-xs text-slate-800 dark:text-gray-100 flex items-center gap-1.5">
              {t.SourceCategory || t.Description || "Transaction"}
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                {badge.label}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {t.Type === "Transfer In" || t.Type === "Transfer Out"
                ? (t.Type === "Transfer Out"
                    ? `${t.WalletName} → ${t.WhereVendor}`
                    : `${t.WhereVendor} → ${t.WalletName}`)
                : (t.WalletName ? t.WalletName + " • " : "") + (t.Account || "")}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5">
              {t.Date}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className={`font-bold text-xs ${isIncome ? "text-emerald-600 dark:text-emerald-400" : isExpense ? "text-rose-600 dark:text-rose-400" : "text-purple-600 dark:text-purple-400"}`}>
            {isIncome ? "+" : "-"}
            {parseFloat(t.Amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{t.Currency}</div>
        </div>
      </div>
    </div>
  );
}

export default function UserProfileView({ currentUser, transactions, wallets, onSave, onCancel, onEditTxn, onDeleteTxn }) {
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [page, setPage] = useState(1);
  const [profilePic, setProfilePic] = useState(currentUser.profilePic || null);
  const fileInputRef = useRef(null);
  const PER_PAGE = 10;

  const ownTransactions = transactions.filter(t => t.User === currentUser.username).sort((a, b) => new Date(b.Date) - new Date(a.Date));
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  const thisMonthCount = ownTransactions.filter(t => (t.Date || '').startsWith(thisMonth)).length;

  const sumFor = (monthStr, type) => ownTransactions.filter(t => (t.Date || '').startsWith(monthStr) && t.Type === type).reduce((s, t) => s + parseFloat(t.Amount || 0), 0);
  const incThis = sumFor(thisMonth, 'Income'), incLast = sumFor(lastMonth, 'Income');
  const expThis = sumFor(thisMonth, 'Expense'), expLast = sumFor(lastMonth, 'Expense');
  const incChange = incLast ? Math.round(((incThis - incLast) / incLast) * 100) : (incThis > 0 ? 100 : 0);
  const expChange = expLast ? Math.round(((expThis - expLast) / expLast) * 100) : (expThis > 0 ? 100 : 0);

  const fullName = currentUser.fullName || currentUser.username;
  const canEdit = currentUser?.role === 'Admin' || currentUser?.permissions?.includes('edit_transaction');
  const canDelete = currentUser?.role === 'Admin' || currentUser?.permissions?.includes('delete_transaction');

  const totalPages = Math.max(1, Math.ceil(ownTransactions.length / PER_PAGE));
  const pageItems = ownTransactions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handlePicChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Stored as base64 in a single Google Sheets cell (~50,000 character limit),
    // and base64 inflates raw bytes by ~1.37x — 30KB is the safe ceiling that
    // actually fits, not the old 1MB figure which would have silently failed.
    if (file.size > 30 * 1024) { alert('ছবির সাইজ ৩০ KB এর কম হতে হবে!'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProfilePic(ev.target.result);
      onSave({ username: currentUser.username, profilePic: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  const handlePwSave = () => {
    if (!currentPin || !newPin) { alert('Current PIN এবং New PIN দুটোই দিন!'); return; }
    onSave({ username: currentUser.username, currentPin, pin: newPin });
    setShowPwForm(false);
    setCurrentPin('');
    setNewPin('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">প্রোফাইল</h3>
        <div className="w-5"></div>
      </div>

      {/* Avatar Card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-emerald-700 h-14"></div>
        <div className="text-center pb-5 -mt-10">
          <div className="relative w-20 h-20 mx-auto mb-3">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 ring-4 ring-white shadow-md">
              {profilePic ? (
                <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <DefaultAvatarIcon className="w-full h-full" />
              )}
            </div>
            <button onClick={() => fileInputRef.current.click()} className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px] border-2 border-white shadow-sm">
              <i className="fa-solid fa-camera"></i>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePicChange} className="hidden" />
          </div>
          <div className="text-slate-800 dark:text-gray-100 font-bold text-base">{fullName}</div>
          <div className="inline-flex items-center gap-1.5 mt-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${currentUser.role === 'Admin' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {currentUser.role}
            </span>
            <span className="text-gray-400 dark:text-gray-500 text-xs">@{currentUser.username}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center text-sm flex-shrink-0">
            <i className="fa-solid fa-receipt"></i>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-gray-100 leading-tight">{ownTransactions.length}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">মোট লেনদেন</div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center text-sm flex-shrink-0">
            <i className="fa-solid fa-calendar-check"></i>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-gray-100 leading-tight">{thisMonthCount}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">এই মাসে এন্ট্রি</div>
          </div>
        </div>
      </div>

      {/* Month vs last month */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3.5 shadow-2xs">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">এই মাস বনাম গত মাস</div>
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-lg p-2.5 text-center ${incChange >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <div className={`text-sm font-bold ${incChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{incChange >= 0 ? '+' : ''}{incChange}%</div>
            <div className={`text-[10px] mt-0.5 ${incChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}><i className={`fa-solid fa-arrow-${incChange >= 0 ? 'up' : 'down'}`}></i> আয় {incChange >= 0 ? 'বেড়েছে' : 'কমেছে'}</div>
          </div>
          <div className={`rounded-lg p-2.5 text-center ${expChange <= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <div className={`text-sm font-bold ${expChange <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{expChange >= 0 ? '+' : ''}{expChange}%</div>
            <div className={`text-[10px] mt-0.5 ${expChange <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}><i className={`fa-solid fa-arrow-${expChange >= 0 ? 'up' : 'down'}`}></i> খরচ {expChange <= 0 ? 'কমেছে' : 'বেড়েছে'}</div>
          </div>
        </div>
      </div>

      {/* Access Summary */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3.5 shadow-2xs">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">আমার Access</div>
        <div className="flex flex-wrap gap-1.5">
          {(wallets || []).length === 0 && <span className="text-[11px] text-gray-400 dark:text-gray-500">কোনো Wallet এক্সেস নেই</span>}
          {(wallets || []).map(w => (
            <span key={w.WalletID} className="text-[10px] font-semibold bg-slate-100 text-slate-600 dark:text-gray-300 px-2 py-1 rounded-full">
              {w.WalletName} ({w.Currency})
            </span>
          ))}
        </div>
      </div>

      {/* Change Password */}
      {!showPwForm ? (
        <button onClick={() => setShowPwForm(true)} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex items-center justify-between text-xs font-semibold text-slate-700 shadow-2xs hover:bg-gray-50">
          <span className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><i className="fa-solid fa-lock text-xs"></i></span>
            পাসওয়ার্ড পরিবর্তন করুন
          </span>
          <i className="fa-solid fa-chevron-right text-gray-400 dark:text-gray-500 text-xs"></i>
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-700 dark:text-gray-200">পাসওয়ার্ড পরিবর্তন করুন</div>
            <button onClick={() => setShowPwForm(false)} className="text-gray-400 dark:text-gray-500"><i className="fa-solid fa-xmark"></i></button>
          </div>
          <input type="password" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} placeholder="Current PIN" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
          <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="New PIN" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
          <button onClick={handlePwSave} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-sm shadow-md">Update Password</button>
        </div>
      )}

      {/* Transaction History */}
      <div>
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-2">লেনদেন ইতিহাস</div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3.5 shadow-2xs">
          {pageItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-xs">কোনো লেনদেন নেই।</div>
          ) : pageItems.map((t, i) => {
            const canSwipeEdit = canEdit && (t.Type === 'Income' || t.Type === 'Expense' || t.Type === 'Transfer Out' || t.Type === 'Transfer In');
            const canSwipeDel = canDelete;
            return (
              <SwipeCard key={t.ID} t={t} canEdit={canSwipeEdit} canDelete={canSwipeDel} onEdit={onEditTxn} onDelete={onDeleteTxn} />
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-1.5 mt-3">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="w-7 h-7 rounded-lg text-xs font-semibold text-gray-500 dark:text-gray-400 disabled:opacity-30"><i className="fa-solid fa-chevron-left"></i></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className={`w-7 h-7 rounded-lg text-xs font-semibold ${page === n ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 dark:text-gray-400'}`}>{n}</button>
            ))}
            <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="w-7 h-7 rounded-lg text-xs font-semibold text-gray-500 dark:text-gray-400 disabled:opacity-30"><i className="fa-solid fa-chevron-right"></i></button>
          </div>
        )}
      </div>
    </div>
  );
}
