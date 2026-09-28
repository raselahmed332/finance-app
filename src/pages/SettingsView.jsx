import { useState, useEffect } from "react";
import { api } from "../api.js";
import Select from "../components/Select.jsx";
import SwipeCard from "../components/SwipeCard.jsx";
import { useToast } from "../components/Toast.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { getAllCurrencies, refreshCurrencies, onCurrenciesChange } from "../utils/currency.js";

function CategoriesManager({ currentUser, can, showAlert }) {
  const [categories, setCategories] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('Expense');
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = () => {
    api.getCategories(currentUser.username).then((res) => {
      if (res.status === 'ERROR') { showAlert(res.message || 'ক্যাটাগরি লোড করা যায়নি।', 'error'); return; }
      if (res.status === 'SUCCESS') setCategories(res.categories);
    }).catch(() => showAlert('ক্যাটাগরি লোড করা যায়নি।', 'error'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = (e) => {
    e.preventDefault();
    if (adding) return;
    if (!name.trim()) return toast.error('ক্যাটাগরির নাম দিন!');
    setAdding(true);
    api.addCategory(name.trim(), type, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setName(''); load(); }
    }).finally(() => setAdding(false));
  };

  const handleDelete = async (categoryId) => {
    const ok = await confirm({ message: 'এই ক্যাটাগরি মুছে ফেলবেন? পুরনো লেনদেনে কোনো প্রভাব পড়বে না।' });
    if (!ok) return;
    api.deleteCategory(categoryId, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') load();
    });
  };

  if (!can('MANAGE_CATEGORIES')) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs space-y-3">
      <div className="text-xs font-bold text-slate-700 dark:text-gray-200">Income/Expense ক্যাটাগরি</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
        <i className="fa-solid fa-hand-pointer"></i> Swipe left to delete
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="নতুন ক্যাটাগরি" className="flex-1 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
        <Select value={type} onChange={setType}>
          <option value="Expense">Expense</option>
          <option value="Income">Income</option>
        </Select>
        <button type="submit" disabled={adding} className="bg-slate-800 disabled:opacity-50 text-white rounded-xl px-3 text-xs font-bold">
          {adding ? <i className="fa-solid fa-spinner fa-spin"></i> : '+'}
        </button>
      </form>

      {categories === null && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">লোড হচ্ছে...</div>}
      {categories && (
        <div className="space-y-1">
          {['Expense', 'Income'].map(t => (
            <div key={t}>
              <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mt-2 mb-1">{t}</div>
              {categories.filter(c => c.Type === t).map(c => (
                <SwipeCard key={c.CategoryID} singleAction onSwipeLeft={() => handleDelete(c.CategoryID)} swipeLeftLabel="Delete">
                  <div className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 text-xs bg-white dark:bg-gray-900">
                    <span className="text-slate-700 dark:text-gray-200">{c.Name}</span>
                  </div>
                </SwipeCard>
              ))}
              {categories.filter(c => c.Type === t).length === 0 && <div className="text-[11px] text-gray-400 dark:text-gray-500 py-1">কোনো ক্যাটাগরি নেই।</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Admin-only currency registry. The backend Currencies sheet is the source of
// truth (backend/Currencies.gs); this screen just edits rows. MANAGE_CURRENCIES
// is in ADMIN_ONLY_ACTIONS, so `can` is only true for an Admin - the server
// re-checks it on every mutation regardless of what this UI allows.
//
// Gated by can() like the categories manager below, and additive: it adds a new
// card without changing any existing screen or permission.
function CurrenciesManager({ currentUser, can, showAlert }) {
  const [currencies, setCurrencies] = useState(null);
  const [code, setCode] = useState('');
  const [symbol, setSymbol] = useState('');
  // The money layer is integer cents, so the decimal count is fixed at 2 and is
  // not user-editable. Kept as a constant so the value sent to the server is
  // stated in one place.
  const CURRENCY_DECIMALS = 2;
  const [loanEnabled, setLoanEnabled] = useState(false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = () => {
    api.getCurrencies(currentUser.username).then((res) => {
      if (res.status === 'ERROR') { showAlert(res.message || 'কারেন্সি লোড করা যায়নি।', 'error'); return; }
      if (res.status === 'SUCCESS') setCurrencies(res.currencies || []);
    }).catch(() => showAlert('কারেন্সি লোড করা যায়নি।', 'error'));
  };

  useEffect(() => {
    if (can('MANAGE_CURRENCIES')) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up an edit made elsewhere in the app without a full reload.
  useEffect(() => onCurrenciesChange(() => setCurrencies(getAllCurrencies())), []);

  const handleAdd = (e) => {
    e.preventDefault();
    if (adding) return;
    if (!/^[A-Za-z]{3}$/.test(code.trim())) return toast.error('কারেন্সি কোড ৩টি অক্ষরের হতে হবে (যেমন BDT)।');
    if (!symbol.trim()) return toast.error('কারেন্সির চিহ্ন দিন।');
    setAdding(true);
    api.addCurrency(
      { code: code.trim().toUpperCase(), symbol: symbol.trim(), decimals: CURRENCY_DECIMALS, loanEnabled },
      currentUser.username
    ).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') {
        setCode(''); setSymbol(''); setLoanEnabled(false);
        load();
        refreshCurrencies(currentUser.username);
      }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setAdding(false));
  };

  const handleToggle = (row, patch) => {
    api.updateCurrency(row.code, patch, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { load(); refreshCurrencies(currentUser.username); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  const handleDelete = async (row) => {
    const ok = await confirm({
      message: `"${row.code}" কারেন্সি মুছে ফেলবেন? কোনো Wallet বা হাওলাত এই কারেন্সি ব্যবহার করলে সেটি মুছে ফেলা যাবে না।`,
    });
    if (!ok) return;
    api.deleteCurrency(row.code, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { load(); refreshCurrencies(currentUser.username); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  if (!can('MANAGE_CURRENCIES')) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs space-y-3">
      <div className="text-xs font-bold text-slate-700 dark:text-gray-200">কারেন্সি (Currencies)</div>
      <div className="text-[10px] text-amber-700 dark:text-amber-400">
        <i className="fa-solid fa-circle-info me-1"></i>
        Wallet তৈরির পর কারেন্সি পরিবর্তন করা যায় না। হাওলাত শুধু Loan চিহ্নিত কারেন্সিতে চলে।
      </div>
      <form onSubmit={handleAdd} className="space-y-2">
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 3))} placeholder="Code (BDT)" className="w-20 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100 uppercase" />
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.slice(0, 6))} placeholder="চিহ্ন (৳)" className="w-24 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
          <span
            title="পুরো হিসাবটি পূর্ণসংখ্য সেন্টে (integer cents) হিসাব হয়, তাই দশমিক ঘর নির্দিষ্ট।"
            className="w-16 flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950"
          >
            2dp
          </span>
          <button type="submit" disabled={adding} className="bg-emerald-600 disabled:opacity-50 text-white rounded-xl px-3 text-xs font-bold">
            {adding ? <i className="fa-solid fa-spinner fa-spin"></i> : '+'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-gray-300">
          <input type="checkbox" checked={loanEnabled} onChange={(e) => setLoanEnabled(e.target.checked)} className="w-3.5 h-3.5" />
          হাওলাতের জন্য সমর্থিত
        </label>
      </form>

      {currencies === null && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-2">লোড হচ্ছে...</div>}
      {currencies && (
        <div className="space-y-1">
          {currencies.map(c => (
            <SwipeCard key={c.code} singleAction onSwipeLeft={() => handleDelete(c)} swipeLeftLabel="Delete">
              <div className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 text-xs bg-white dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 dark:text-gray-100">{c.code}</span>
                  <span className="text-gray-400 dark:text-gray-500">{c.symbol}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{c.decimals}dp</span>
                  {c.loanEnabled && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">লোন</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(c, { status: c.status === 'Active' ? 'Inactive' : 'Active' })}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${c.status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
                  >
                    {c.status === 'Active' ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => handleToggle(c, { loanEnabled: !c.loanEnabled })}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  >
                    লোন {c.loanEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            </SwipeCard>
          ))}
          {currencies.length === 0 && <div className="text-[11px] text-gray-400 dark:text-gray-500 py-1">কোনো কারেন্সি নেই।</div>}
        </div>
      )}
    </div>
  );
}

export default function SettingsView({ showAlert, currentUser, can }) {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Settings (সেটিংস)</h3>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
        <div className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
          <i className="fa-solid fa-shield-halved"></i> নিরাপত্তা সংক্রান্ত তথ্য
        </div>
        <p>আপনার ডাটা শুধুমাত্র আপনার নিজস্ব Google Drive এবং Google Sheets-এ সংরক্ষিত। অন্য কেউ আপনার অনুমোদিত PIN ছাড়া এক্সেস করতে পারবে না।</p>
      </div>

      <CurrenciesManager currentUser={currentUser} can={can} showAlert={showAlert} />
      <CategoriesManager currentUser={currentUser} can={can} showAlert={showAlert} />
    </div>
  );
}
