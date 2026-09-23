import { useState, useRef, useEffect } from "react";
import { todayStr } from "../utils/loan.js";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import { useToast } from "../components/Toast.jsx";
import TransactionSwipeCard from "../components/TransactionSwipeCard.jsx";

const DEFAULT_WALLET_KEY = "hisab_default_wallet";

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

function MenuButton({ icon, label, sub, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${danger ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" : "text-slate-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
    >
      <i className={`fa-solid ${icon} w-4 text-center ${danger ? "" : "text-slate-400 dark:text-gray-500"}`}></i>
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-semibold">{label}</span>
        {sub && <span className="block text-[10px] text-gray-400 dark:text-gray-500">{sub}</span>}
      </span>
    </button>
  );
}

export default function UserProfileView({ currentUser, transactions, wallets, darkMode, onSetDark, can, onSave, onCancel, onEditTxn, onDeleteTxn, onLogout, setActiveTab }) {
  const [activeCard, setActiveCard] = useState(null);
  const toast = useToast();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [editName, setEditName] = useState(currentUser.fullName || currentUser.username || '');
  const [defaultWallet, setDefaultWallet] = useState(() => {
    const saved = localStorage.getItem(`${DEFAULT_WALLET_KEY}_${currentUser.username}`);
    if (saved) return saved;
    return wallets.length === 1 ? String(wallets[0].WalletID) : "";
  });
  const [page, setPage] = useState(1);
  const [profilePic, setProfilePic] = useState(currentUser.profilePic || null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);
  const menuRef = useRef(null);
  const PER_PAGE = 10;

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ownTransactions = transactions.filter(t => t.User === currentUser.username).sort((a, b) => new Date(b.Date) - new Date(a.Date));
  const thisMonth = todayStr().slice(0, 7);
  const lastMonthDate = new Date(); lastMonthDate.setDate(1); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthCount = ownTransactions.filter(t => (t.Date || '').startsWith(thisMonth)).length;

  const sumFor = (monthStr, type) => ownTransactions.filter(t => (t.Date || '').startsWith(monthStr) && t.Type === type).reduce((s, t) => s + parseFloat(t.Amount || 0), 0);
  const incThis = sumFor(thisMonth, 'Income'), incLast = sumFor(lastMonth, 'Income');
  const expThis = sumFor(thisMonth, 'Expense'), expLast = sumFor(lastMonth, 'Expense');
  const incChange = incLast ? Math.round(((incThis - incLast) / incLast) * 100) : (incThis > 0 ? 100 : 0);
  const expChange = expLast ? Math.round(((expThis - expLast) / expLast) * 100) : (expThis > 0 ? 100 : 0);

  const fullName = currentUser.fullName || currentUser.username;
  const canEdit = currentUser?.role === 'Admin' || can?.('MANAGE_TRANSACTIONS');
  const canDelete = currentUser?.role === 'Admin' || can?.('MANAGE_TRANSACTIONS');

  const totalPages = Math.max(1, Math.ceil(ownTransactions.length / PER_PAGE));
  const pageItems = ownTransactions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Keep the page inside the valid range after a transaction is deleted.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handlePicChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Stored as base64 in a single Google Sheets cell (~50,000 character limit),
    // and base64 inflates raw bytes by ~1.37x — 30KB is the safe ceiling that
    // actually fits, not the old 1MB figure which would have silently failed.
    if (file.size > 30 * 1024) { toast.error('ছবির সাইজ ৩০ KB এর কম হতে হবে!'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProfilePic(ev.target.result);
      onSave({ username: currentUser.username, profilePic: ev.target.result });
    };
    reader.readAsDataURL(file);
  };

  const handlePwSave = () => {
    if (!currentPin || !newPin || !confirmPin) { toast.error('সবগুলো PIN ক্ষেত্র পূরণ করুন!'); return; }
    if (newPin !== confirmPin) { toast.error('নতুন PIN ও Confirm PIN মিলছে না!'); return; }
    if (newPin.length < 4) { toast.error('PIN কমপক্ষে 4 অক্ষরের হতে হবে!'); return; }
    onSave({ username: currentUser.username, currentPin, pin: newPin });
    setActiveCard(null);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
  };

  const handleEditSave = () => {
    const name = editName.trim();
    if (!name) { toast.error('Full Name খালি রাখা যাবে না!'); return; }
    localStorage.setItem(`${DEFAULT_WALLET_KEY}_${currentUser.username}`, defaultWallet);
    onSave({ username: currentUser.username, fullName: name });
    setActiveCard(null);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    onLogout();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">প্রোফাইল</h3>
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenuOpen(o => !o)} className={`text-lg ${menuOpen ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200"}`} title="Profile Settings">
            <i className="fa-solid fa-gear"></i>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-60 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase border-b border-gray-100 dark:border-gray-800">Profile Settings</div>
              <div className="py-1.5">
                <div className="px-3 pb-1">
                  <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1">Theme Mode</div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onSetDark(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${darkMode ? "bg-slate-800 dark:bg-gray-700 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}
                    >
                      <i className="fa-solid fa-moon"></i> Dark
                    </button>
                    <button
                      onClick={() => onSetDark(false)}
                      className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${!darkMode ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700"}`}
                    >
                      <i className="fa-solid fa-sun"></i> Day
                    </button>
                  </div>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
                <MenuButton icon="fa-user-pen" label="Edit Profile" sub="নাম, ছবি, ডিফল্ট Wallet" onClick={() => { setEditName(currentUser.fullName || currentUser.username || ''); setActiveCard('edit'); setMenuOpen(false); }} />
                <MenuButton icon="fa-key" label="Change Password" sub="PIN পরিবর্তন করুন" onClick={() => { setCurrentPin(''); setNewPin(''); setConfirmPin(''); setActiveCard('password'); setMenuOpen(false); }} />
                {can?.('BACKUP_RESTORE') && <MenuButton icon="fa-download" label="Backup & Restore" sub="ব্যাকআপ ডাউনলোড/রিস্টোর" onClick={() => { setMenuOpen(false); setActiveTab('backup'); }} />}
                <div className="border-t border-gray-100 dark:border-gray-800 my-1"></div>
                <MenuButton danger icon="fa-right-from-bracket" label="Log Out" sub="সেশন শেষ করুন" onClick={handleLogout} />
              </div>
            </div>
          )}
        </div>
      </div>

      <Popup open={activeCard === 'edit' || activeCard === 'password'} title={activeCard === 'edit' ? 'Edit Profile' : 'Change Password'} onClose={() => setActiveCard(null)}>
        {activeCard === 'edit' ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0">
                {profilePic ? <img src={profilePic} alt="Profile" className="w-full h-full object-cover" /> : <DefaultAvatarIcon className="w-full h-full" />}
              </div>
              <div className="flex-1">
                <button onClick={() => editFileInputRef.current.click()} className="bg-slate-800 dark:bg-gray-800 text-white text-xs font-bold px-3 py-2 rounded-xl">
                  <i className="fa-solid fa-camera me-1"></i> Change Profile Pic
                </button>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">ছবির সাইজ ৩০ KB এর কম হতে হবে</div>
                <input ref={editFileInputRef} type="file" accept="image/*" onChange={handlePicChange} className="hidden" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 dark:text-gray-300 mb-1 block">Full Name</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 dark:text-gray-300 mb-1 block">Username</label>
              <div className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">@{currentUser.username} — পরিবর্তন করা যাবে না</div>
            </div>

            {wallets.length > 1 ? (
              <div>
                <label className="text-[10px] font-bold text-slate-600 dark:text-gray-300 mb-1 block">Default Wallet</label>
                <Select value={defaultWallet} onChange={setDefaultWallet}>
                  {wallets.map(w => <option key={w.WalletID} value={String(w.WalletID)}>{w.WalletName} ({w.Currency})</option>)}
                </Select>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">এই Wallet টি নতুন লেনদেনে ডিফল্ট হিসেবে ব্যবহার হবে।</div>
              </div>
            ) : wallets.length === 1 ? (
              <div>
                <label className="text-[10px] font-bold text-slate-600 dark:text-gray-300 mb-1 block">Default Wallet</label>
                <div className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800 text-slate-700 dark:text-gray-200">{wallets[0].WalletName} ({wallets[0].Currency})</div>
              </div>
            ) : (
              <div className="text-[10px] text-gray-400 dark:text-gray-500">কোনো Wallet এক্সেস নেই, তাই Default Wallet নির্বাচন করা যাবে না।</div>
            )}

            <button onClick={handleEditSave} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md">Save Profile</button>
          </>
        ) : (
          <>
            <input type="password" value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} placeholder="Current PIN / Password" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="New PIN / Password (min 4 characters)" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            <input type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder="Confirm New PIN / Password" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            <button onClick={handlePwSave} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md">Change Password</button>
          </>
        )}
      </Popup>

      {/* Avatar Card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-emerald-700 h-14"></div>
        <div className="text-center pb-5 -mt-10">
          <div className="relative w-20 h-20 mx-auto mb-3">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 ring-4 ring-white dark:ring-gray-900 shadow-md">
              {profilePic ? (
                <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <DefaultAvatarIcon className="w-full h-full" />
              )}
            </div>
            <button onClick={() => fileInputRef.current.click()} className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px] border-2 border-white dark:border-gray-900 shadow-sm">
              <i className="fa-solid fa-camera"></i>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePicChange} className="hidden" />
          </div>
          <div className="text-slate-800 dark:text-gray-100 font-bold text-base">{fullName}</div>
          <div className="inline-flex items-center gap-1.5 mt-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${currentUser.role === 'Admin' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'}`}>
              {currentUser.role}
            </span>
            <span className="text-gray-400 dark:text-gray-500 text-xs">@{currentUser.username}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-sm flex-shrink-0">
            <i className="fa-solid fa-receipt"></i>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-gray-100 leading-tight">{ownTransactions.length}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">মোট লেনদেন</div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex items-center gap-2.5 shadow-2xs">
          <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm flex-shrink-0">
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
          <div className={`rounded-lg p-2.5 text-center ${incChange >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
            <div className={`text-sm font-bold ${incChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{incChange >= 0 ? '+' : ''}{incChange}%</div>
            <div className={`text-[10px] mt-0.5 ${incChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}><i className={`fa-solid fa-arrow-${incChange >= 0 ? 'up' : 'down'}`}></i> আয় {incChange >= 0 ? 'বেড়েছে' : 'কমেছে'}</div>
          </div>
          <div className={`rounded-lg p-2.5 text-center ${expChange <= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
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
            <span key={w.WalletID} className={`text-[10px] font-semibold px-2 py-1 rounded-full ${String(w.WalletID) === defaultWallet ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300'}`}>
              {w.WalletName} ({w.Currency}){String(w.WalletID) === defaultWallet ? ' • Default' : ''}
            </span>
          ))}
        </div>
      </div>

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
              <TransactionSwipeCard key={t.ID} t={t} canEdit={canSwipeEdit} canDelete={canSwipeDel} onEdit={onEditTxn} onDelete={onDeleteTxn} />
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-1.5 mt-3">
            <button disabled={page === 1} onClick={() => setPage(page - 1)} className="w-7 h-7 rounded-lg text-xs font-semibold text-gray-500 dark:text-gray-400 disabled:opacity-30"><i className="fa-solid fa-chevron-left"></i></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} className={`w-7 h-7 rounded-lg text-xs font-semibold ${page === n ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{n}</button>
            ))}
            <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="w-7 h-7 rounded-lg text-xs font-semibold text-gray-500 dark:text-gray-400 disabled:opacity-30"><i className="fa-solid fa-chevron-right"></i></button>
          </div>
        )}
      </div>
    </div>
  );
}