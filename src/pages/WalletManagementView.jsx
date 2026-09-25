import { useState, useRef, useEffect } from "react";
import { api } from "../api.js";
import Select from "../components/Select.jsx";
import SwipeCard from "../components/SwipeCard.jsx";
import Popup from "../components/Popup.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

const CURRENCIES = ["SAR", "BDT", "USD", "EUR", "KWD", "GBP", "AED"];

// Server timestamps are stored as "dd-MMM-yyyy HH:mm" (e.g. "24-Sep-2026 14:30").
function fmtTimestamp(ts) {
  if (!ts) return "—";
  const s = String(ts);
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s);
  if (m) return `${m[1]} ${m[2]} ${m[3]}`;
  return s || "—";
}

function fmtMoney(v, cur) {
  const n = Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DetailCell({ label, value, full }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</div>
      <div className="text-[11px] font-semibold text-slate-700 dark:text-gray-200 mt-0.5 break-words">{value}</div>
    </div>
  );
}

function EditWalletRow({ wallet, walletSummaries, currentUser, can, onRefresh, showAlert }) {
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(wallet.WalletName);
  const [status, setStatus] = useState(wallet.Status);

  // Swipe detection — a swipe ends with a click we must not treat as "open details".
  const startX = useRef(0);
  const swiped = useRef(false);
  const handleTouchStart = (e) => {
    if (!e.touches || !e.touches[0]) return;
    startX.current = e.touches[0].clientX;
    swiped.current = false;
  };
  const handleTouchMove = (e) => {
    if (!e.touches || !e.touches[0]) return;
    if (Math.abs(e.touches[0].clientX - startX.current) > 10) swiped.current = true;
  };
  const handleTouchEnd = () => {
    // keep swiped.current true until the click arrives
  };
  const handleRowClick = () => {
    if (swiped.current) { swiped.current = false; return; }
    setDetailsOpen(true);
  };

  const handleSave = () => {
    // Send only the fields that actually changed. The backend treats a
    // non-empty status as a status change requiring MANAGE_WALLET_STATUS, so
    // always sending the current status would block EDIT_WALLET-only renames.
    if (saving) return;
    const nameChanged = name.trim() !== wallet.WalletName;
    const statusChanged = status !== wallet.Status;
    if (!nameChanged && !statusChanged) { showAlert('কোনো পরিবর্তন হয়নি।', 'error'); return; }
    setSaving(true);
    api.updateWallet(
      wallet.WalletID,
      nameChanged ? name.trim() : '',
      statusChanged ? status : '',
      currentUser.username
    ).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { onRefresh(); setEditing(false); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setSaving(false));
  };

  const handleDelete = () => {
    api.checkWalletHasTransactions(wallet.WalletID, currentUser.username).then(async (res) => {
      const msg = res.hasTransactions
        ? 'এই Wallet এ লেনদেন আছে।\n\nমুছে ফেললে Wallet নিষ্ক্রিয় (deactivate) হবে — পুরনো লেনদেন সংরক্ষিত থাকবে, শুধু নতুন লেনদেন যোগ করা যাবে না।\n\nআপনি কি নিশ্চিত?'
        : 'এই Wallet মুছে ফেলবেন?';
      const ok = await confirm({ message: msg, confirmLabel: 'হ্যাঁ, মুছুন' });
      if (!ok) return;
      api.deleteWallet(wallet.WalletID, currentUser.username).then((r) => {
        showAlert(r.message, r.status === 'ERROR' ? 'error' : 'success');
        if (r.status === 'SUCCESS') onRefresh();
      }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  // The backend scopes the wallet list to the caller's access range, so each row
  // can only ever be managed if the caller can actually reach that wallet.
  const canAccess = String(currentUser?.role) === 'Admin' || (currentUser?.walletAccess || []).includes(String(wallet.WalletID));
  const canEdit = canAccess && can('EDIT_WALLET');
  const canDel = canAccess && can('MANAGE_WALLET_STATUS') && wallet.Status === 'Active';

  const summary = (walletSummaries || {})[wallet.WalletID];
  const active = wallet.Status === 'Active';

  const row = (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleRowClick}
      className="border-b border-gray-100 dark:border-gray-800 last:border-0 py-2.5 bg-white dark:bg-gray-900"
    >
      <div className="flex justify-between items-center text-xs px-1 cursor-pointer" role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(); } }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-vault text-xs"></i>
          </div>
          <div className="min-w-0">
            <div className="font-bold text-slate-800 dark:text-gray-100 truncate">{wallet.WalletName} <span className="text-[10px] text-gray-400 font-normal">({wallet.WalletID})</span></div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">{wallet.Currency}{wallet.SheetName ? ` • ${wallet.SheetName}` : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{wallet.Status}</span>
          <i className="fa-solid fa-chevron-right text-gray-300 dark:text-gray-600 text-[10px]"></i>
        </div>
      </div>
    </div>
  );

  const effectiveRow = (canEdit || canDel) ? (
    <SwipeCard onSwipeRight={canEdit ? () => { setEditing(true); setName(wallet.WalletName); setStatus(wallet.Status); } : undefined} onSwipeLeft={canDel ? handleDelete : undefined}>
      {row}
    </SwipeCard>
  ) : row;

  return (
    <div>
      {effectiveRow}

      <Popup open={detailsOpen} title="Wallet Details" onClose={() => setDetailsOpen(false)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-vault"></i>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-slate-800 dark:text-gray-100 truncate">{wallet.WalletName}</div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500">{wallet.WalletID}</div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${active ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{wallet.Status}</span>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailCell label="Currency" value={wallet.Currency} />
          <DetailCell label="Sheet" value={wallet.SheetName || "—"} />
          <DetailCell label="Created" value={fmtTimestamp(wallet.CreatedAt)} />
          <DetailCell label="Last Updated" value={fmtTimestamp(wallet.UpdatedAt)} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2.5">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1">
              <i className="fa-solid fa-money-bill-wave text-emerald-600"></i> Current Cash
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-gray-100 mt-1">
              {summary ? fmtMoney(summary.cash, wallet.Currency) : "—"}
            </div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2.5">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1">
              <i className="fa-solid fa-building-columns text-emerald-600"></i> Current Bank
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-gray-100 mt-1">
              {summary ? fmtMoney(summary.bank, wallet.Currency) : "—"}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 grid grid-cols-2 gap-x-4 gap-y-2.5">
          <DetailCell label="Total Balance" value={summary ? fmtMoney(summary.totalBalance, wallet.Currency) : "—"} />
          <DetailCell label="Opening Cash" value={fmtMoney(wallet.OpeningCash, wallet.Currency)} />
          <DetailCell label="Opening Bank" value={fmtMoney(wallet.OpeningBank, wallet.Currency)} />
          <DetailCell label="Wallet ID" value={String(wallet.WalletID)} />
        </div>

        {(canEdit || canDel) && (
          <div className="grid grid-cols-2 gap-2">
            {canEdit && (
              <button onClick={() => { setDetailsOpen(false); setEditing(true); setName(wallet.WalletName); setStatus(wallet.Status); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5">
                <i className="fa-solid fa-pen"></i> Edit Wallet
              </button>
            )}
            {canDel && (
              <button onClick={() => { setDetailsOpen(false); handleDelete(); }} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5">
                <i className="fa-solid fa-trash-can"></i> Delete
              </button>
            )}
          </div>
        )}
      </Popup>

      <Popup open={editing} title="Edit Wallet" onClose={saving ? undefined : () => setEditing(false)}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wallet Name" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
        <Select value={status} onChange={setStatus}>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </Select>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 px-1">Currency: {wallet.Currency} (তৈরির সময় নির্ধারিত, পরিবর্তনযোগ্য নয়)</div>
        <button onClick={handleSave} disabled={saving} className="w-full bg-emerald-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs">{saving ? <><i className="fa-solid fa-spinner fa-spin me-1"></i>Saving...</> : 'Save'}</button>
      </Popup>
    </div>
  );
}

function AddWalletForm({ currentUser, showAlert, onRefresh, onClose }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('BDT');
  const [openingCash, setOpeningCash] = useState('');
  const [openingBank, setOpeningBank] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (adding) return;
    if (!name.trim()) { showAlert("Wallet এর নাম দিন!", "error"); return; }
    const oc = parseFloat(openingCash) || 0;
    const ob = parseFloat(openingBank) || 0;
    if (oc < 0 || ob < 0) { showAlert('Opening balance ঋণাত্মক হতে পারবে না।', 'error'); return; }
    setAdding(true);
    api.addWallet(name.trim(), currency, oc, ob).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setName(''); setOpeningCash(''); setOpeningBank(''); onRefresh(); onClose(); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setAdding(false));
  };

  return (
    <form onSubmit={handleAdd} className="space-y-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: Bangladesh Bank" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" required />
      <Select value={currency} onChange={setCurrency}>
        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
      </Select>
      <div className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
        <i className="fa-solid fa-triangle-exclamation me-1"></i>
        কারেন্সি একবার নির্ধারণ করলে পরে পরিবর্তন করা যাবে না।
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">Opening Cash ({currency})</label>
          <input type="number" step="0.01" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">Opening Bank ({currency})</label>
          <input type="number" step="0.01" min="0" value={openingBank} onChange={(e) => setOpeningBank(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>
      </div>
      <div className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1.5">
        <i className="fa-solid fa-circle-info me-1"></i>
        শুরুর ব্যালেন্স — পরে "Edit Wallet" থেকে পরিবর্তন করা যাবে না।
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2 rounded-xl text-xs">Cancel</button>
        <button type="submit" disabled={adding} className="bg-emerald-600 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1">
          {adding ? <><i className="fa-solid fa-spinner fa-spin me-1"></i>Creating...</> : <><i className="fa-solid fa-plus me-1"></i> Create Wallet</>}
        </button>
      </div>
    </form>
  );
}

export default function WalletManagementView({ currentUser, can, showAlert, walletSummaries }) {
  const [allWallets, setAllWallets] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = () => {
    api.getAllWallets(currentUser.username).then((res) => {
      if (res.status === 'SUCCESS') setAllWallets(res.wallets);
      else showAlert(res.message, 'error');
    }).catch(() => showAlert('ডেটা লোড করতে ব্যর্থ হয়েছে।', 'error'));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Wallet ম্যানেজমেন্ট</h3>
        {can('ADD_WALLET') && (
          <button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm shrink-0">
            <i className="fa-solid fa-plus"></i> Add Wallet
          </button>
        )}
      </div>

      <Popup open={addOpen} title="নতুন Wallet তৈরি করুন" onClose={() => setAddOpen(false)}>
        <AddWalletForm currentUser={currentUser} showAlert={showAlert} onRefresh={load} onClose={() => setAddOpen(false)} />
      </Popup>

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-1">সব Wallet</div>
        {(can('EDIT_WALLET') || can('MANAGE_WALLET_STATUS')) && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1">
            <i className="fa-solid fa-hand-pointer"></i> Swipe right to edit, left to delete
          </div>
        )}
        {allWallets === null && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">লোড হচ্ছে...</div>}
        {allWallets && allWallets.map(w => (
          <EditWalletRow key={w.WalletID} wallet={w} walletSummaries={walletSummaries} currentUser={currentUser} can={can} onRefresh={load} showAlert={showAlert} />
        ))}
      </div>
    </div>
  );
}