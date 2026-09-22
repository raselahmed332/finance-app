import { useState, useEffect } from "react";
import { api } from "../api.js";
import Select from "../components/Select.jsx";
import SwipeCard from "../components/SwipeCard.jsx";

const CURRENCIES = ["SAR", "BDT", "USD", "EUR", "KWD", "GBP", "AED"];

function EditWalletRow({ wallet, currentUser, can, onRefresh, showAlert }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(wallet.WalletName);
  const [status, setStatus] = useState(wallet.Status);

  const handleSave = () => {
    // Send only the fields that actually changed. The backend treats a
    // non-empty status as a status change requiring MANAGE_WALLET_STATUS, so
    // always sending the current status would block EDIT_WALLET-only renames.
    const nameChanged = name.trim() !== wallet.WalletName;
    const statusChanged = status !== wallet.Status;
    if (!nameChanged && !statusChanged) { showAlert('কোনো পরিবর্তন হয়নি।', 'error'); return; }
    api.updateWallet(
      wallet.WalletID,
      nameChanged ? name.trim() : '',
      statusChanged ? status : '',
      currentUser.username
    ).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { onRefresh(); setEditing(false); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  const handleDelete = () => {
    api.checkWalletHasTransactions(wallet.WalletID, currentUser.username).then((res) => {
      const msg = res.hasTransactions
        ? 'এই Wallet এ লেনদেন আছে।\n\nমুছে ফেললে Wallet নিষ্ক্রিয় (deactivate) হবে — পুরনো লেনদেন সংরক্ষিত থাকবে, শুধু নতুন লেনদেন যোগ করা যাবে না।\n\nআপনি কি নিশ্চিত?'
        : 'এই Wallet মুছে ফেলবেন?';
      if (!confirm(msg)) return;
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

  const row = (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0 py-2.5 bg-white dark:bg-gray-900">
      <div className="flex justify-between items-center text-xs px-1">
        <div>
          <div className="font-bold text-slate-800 dark:text-gray-100">{wallet.WalletName} <span className="text-[10px] text-gray-400 font-normal">({wallet.WalletID})</span></div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500">{wallet.Currency}{wallet.SheetName ? ` • ${wallet.SheetName}` : ''}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${wallet.Status === 'Active' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{wallet.Status}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {(canEdit || canDel) ? (
        <SwipeCard onSwipeRight={canEdit ? () => { setEditing(true); setName(wallet.WalletName); setStatus(wallet.Status); } : undefined} onSwipeLeft={canDel ? handleDelete : undefined}>
          {row}
        </SwipeCard>
      ) : row}

      {editing && (
        <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 mt-2 space-y-2 border border-gray-200 dark:border-gray-800">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Wallet Name" className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
          <Select value={status} onChange={setStatus}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </Select>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 px-1">Currency: {wallet.Currency} (তৈরির সময় নির্ধারিত, পরিবর্তনযোগ্য নয়)</div>
          <button onClick={handleSave} className="w-full bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs">Save</button>
        </div>
      )}
    </div>
  );
}

export default function WalletManagementView({ currentUser, can, showAlert }) {
  const [allWallets, setAllWallets] = useState(null);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('BDT');
  const [openingCash, setOpeningCash] = useState('');
  const [openingBank, setOpeningBank] = useState('');

  const load = () => {
    api.getAllWallets(currentUser.username).then((res) => {
      if (res.status === 'SUCCESS') setAllWallets(res.wallets);
      else showAlert(res.message, 'error');
    }).catch(() => showAlert('ডেটা লোড করতে ব্যর্থ হয়েছে।', 'error'));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) return alert('Wallet এর নাম দিন!');
    const oc = parseFloat(openingCash) || 0;
    const ob = parseFloat(openingBank) || 0;
    if (oc < 0 || ob < 0) return alert('Opening balance ঋণাত্মক হতে পারবে না।');
    api.addWallet(name.trim(), currency, oc, ob).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setName(''); setOpeningCash(''); setOpeningBank(''); load(); }
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Wallet ম্যানেজমেন্ট</h3>

      {can('ADD_WALLET') && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs space-y-3">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200">নতুন Wallet তৈরি করুন</div>
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
            <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-2 rounded-xl text-xs">
              <i className="fa-solid fa-plus me-1"></i> Create Wallet
            </button>
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-1">সব Wallet</div>
        {(can('EDIT_WALLET') || can('MANAGE_WALLET_STATUS')) && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1">
            <i className="fa-solid fa-hand-pointer"></i> Swipe right to edit, left to delete
          </div>
        )}
        {allWallets === null && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">লোড হচ্ছে...</div>}
        {allWallets && allWallets.map(w => (
          <EditWalletRow key={w.WalletID} wallet={w} currentUser={currentUser} can={can} onRefresh={load} showAlert={showAlert} />
        ))}
      </div>
    </div>
  );
}
