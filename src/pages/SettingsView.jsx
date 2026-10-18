import { useState, useEffect, useMemo } from "react";
import { api } from "../api.js";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import { useToast } from "../components/Toast.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { getAllCurrencies, getActiveCurrencies, refreshCurrencies, onCurrenciesChange } from "../utils/currency.js";
import { loadAccounts } from "../utils/accounts.js";

// Shared input look for every form control on this screen so the two manager
// cards read as one design system.
const INPUT_CLS =
  "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors";

const LABEL_CLS = "block text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1";

function SectionCard({ icon, iconTone, title, subtitle, count, children }) {
  return (
    <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      <header className="flex items-center gap-2.5 px-3.5 py-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconTone}`}>
          <i className={`fa-solid ${icon} text-xs`}></i>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-slate-800 dark:text-gray-100 leading-tight truncate">{title}</h4>
          {subtitle && <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">{subtitle}</p>}
        </div>
        {typeof count === "number" && (
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 tabular-nums">
            {count}
          </span>
        )}
      </header>
      <div className="border-t border-gray-100 dark:border-gray-800 p-3.5 space-y-3">{children}</div>
    </section>
  );
}

function EmptyState({ icon, children }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-4 text-center">
      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 flex items-center justify-center">
        <i className={`fa-solid ${icon} text-[10px]`}></i>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">{children}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-gray-400 dark:text-gray-500">
      <i className="fa-solid fa-spinner fa-spin text-[10px]"></i> লোড হচ্ছে...
    </div>
  );
}

function CategoriesManager({ currentUser, can, showAlert }) {
  const [categories, setCategories] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('Expense');
  const [adding, setAdding] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
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

  const handleSaveEdit = () => {
    if (!editingCategory || savingEdit) return;
    const trimmed = editName.trim();
    if (!trimmed) return toast.error('ক্যাটাগরির নাম দিন!');
    if (trimmed === editingCategory.Name) { setEditingCategory(null); return; }
    setSavingEdit(true);
    api.updateCategory(editingCategory.CategoryID, { name: trimmed }, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setEditingCategory(null); load(); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setSavingEdit(false));
  };

  if (!can('MANAGE_CATEGORIES')) return null;

  const groups = ['Expense', 'Income'].map((t) => ({
    type: t,
    tone: t === 'Expense'
      ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
      : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
    items: (categories || []).filter((c) => c.Type === t),
  }));

  return (
    <SectionCard
      icon="fa-tags"
      iconTone="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
      title="ক্যাটাগরি"
      subtitle="Income ও Expense ক্যাটাগরি"
      count={categories ? categories.length : undefined}
    >
      <form onSubmit={handleAdd} className="rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-gray-800 px-2.5 py-2">
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <label className={LABEL_CLS} htmlFor="cat-name">ক্যাটাগরির নাম</label>
            <input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="যেমন: বাজার, বেতন"
              className={INPUT_CLS}
            />
          </div>
          <div className="w-[88px] shrink-0">
            <label className={LABEL_CLS} htmlFor="cat-type">ধরন</label>
            <Select value={type} onChange={setType}>
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
            </Select>
          </div>
          <button
            type="submit"
            disabled={adding}
            aria-label="ক্যাটাগরি যোগ করুন"
            className="shrink-0 h-[34px] w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center transition-colors"
          >
            {adding ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-plus"></i>}
          </button>
        </div>
      </form>

      {categories === null && <LoadingState />}

      {categories && (
        <div className="grid grid-cols-2 gap-2.5 items-start">
          {groups.map(({ type: t, tone, items }) => (
            <div key={t} className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${tone}`}>{t}</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="text-[11px] text-gray-400 dark:text-gray-500 py-1 px-1">কোনো ক্যাটাগরি নেই।</div>
              ) : (
                <ul className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800/80">
                  {items.map((c) => (
                    <li key={c.CategoryID} className="flex items-center gap-1.5 px-2 py-1.5 text-xs bg-white dark:bg-gray-900">
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${tone}`}>
                        <i className={`fa-solid ${t === 'Expense' ? 'fa-arrow-up' : 'fa-arrow-down'} text-[8px]`}></i>
                      </span>
                      <span className="flex-1 min-w-0 font-semibold text-slate-700 dark:text-gray-200 truncate">{c.Name}</span>
                      <button
                        onClick={() => { setEditingCategory(c); setEditName(c.Name); }}
                        aria-label={`${c.Name} সম্পাদনা`}
                        className="shrink-0 w-5 h-5 rounded text-gray-300 dark:text-gray-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center"
                      >
                        <i className="fa-solid fa-pen text-[9px]"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(c.CategoryID)}
                        aria-label={`${c.Name} মুছুন`}
                        className="shrink-0 w-5 h-5 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center"
                      >
                        <i className="fa-solid fa-trash-can text-[9px]"></i>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <Popup
        open={editingCategory !== null}
        onClose={() => { if (!savingEdit) setEditingCategory(null); }}
        title={editingCategory ? `${editingCategory.Name} সম্পাদনা` : ''}
        maxWidth="max-w-xs"
      >
        <div className="space-y-3">
          <div>
            <label className={LABEL_CLS} htmlFor="edit-cat-name">ক্যাটাগরির নাম</label>
            <input
              id="edit-cat-name"
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); } }}
              maxLength={60}
              placeholder="যেমন: বাজার, বেতন"
              className={INPUT_CLS}
            />
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-gray-800 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-600 dark:text-gray-300">ধরন</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                editingCategory && editingCategory.Type === 'Expense'
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              }`}>
                {editingCategory ? editingCategory.Type : ''}
              </span>
            </div>
          </div>
          <button
            onClick={handleSaveEdit}
            disabled={savingEdit}
            className="w-full h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {savingEdit ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
            সেভ করুন
          </button>
        </div>
      </Popup>
    </SectionCard>
  );
}

// Admin-only currency registry. The backend Currencies sheet is the source of
// truth (backend/Currencies.gs); this screen just edits rows. MANAGE_CURRENCIES
// is in ADMIN_ONLY_ACTIONS, so `can` is only true for an Admin - the server
// re-checks it on every mutation regardless of what this UI allows.
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
  const [editingCode, setEditingCode] = useState(null);
  const [editSymbol, setEditSymbol] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editLoan, setEditLoan] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
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

  // The code and the decimal count are fixed for a currency (wallets and loans
  // already reference them), so the editor only offers symbol + the two flags.
  const handleSaveEdit = () => {
    if (savingEdit || editingCode === null) return;
    if (!editSymbol.trim()) return toast.error('কারেন্সির চিহ্ন দিন।');
    setSavingEdit(true);
    const patch = {
      symbol: editSymbol.trim(),
      status: editActive ? 'Active' : 'Inactive',
      loanEnabled: editLoan,
    };
    api.updateCurrency(editingCode, patch, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setEditingCode(null); load(); refreshCurrencies(currentUser.username); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setSavingEdit(false));
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

  const activeCount = (currencies || []).filter((c) => c.status === 'Active').length;

  return (
    <SectionCard
      icon="fa-coins"
      iconTone="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
      title="কারেন্সি"
      subtitle="Currencies · অ্যাক্টিভ"
      count={currencies ? activeCount : undefined}
    >
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/70 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
        <i className="fa-solid fa-circle-info mt-0.5 shrink-0"></i>
        <span>Wallet তৈরির পর কারেন্সি পরিবর্তন করা যায় না। হাওলাত শুধু লোন চিহ্নিত কারেন্সিতে চলে।</span>
      </div>

      <form onSubmit={handleAdd} className="rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-gray-800 px-2.5 py-2">
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <label className={LABEL_CLS} htmlFor="cur-code">কোড</label>
            <input
              id="cur-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="BDT"
              maxLength={3}
              className={`${INPUT_CLS} uppercase text-center text-sm font-bold tracking-wide`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className={LABEL_CLS} htmlFor="cur-symbol">চিহ্ন</label>
            <input
              id="cur-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.slice(0, 6))}
              placeholder="৳"
              maxLength={6}
              className={`${INPUT_CLS} text-center text-lg`}
            />
          </div>
          <div className="shrink-0">
            <span className={LABEL_CLS}>ঘর</span>
            <span
              title="পুরো হিসাবটি পূর্ণসংখ্য সেন্টে (integer cents) হিসাব হয়, তাই দশমিক ঘর নির্দিষ্ট।"
              className="flex h-[34px] px-2.5 items-center justify-center text-[11px] font-bold text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-900 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl"
            >
              {CURRENCY_DECIMALS}dp
            </span>
          </div>
          <button
            type="submit"
            disabled={adding}
            aria-label="কারেন্সি যোগ করুন"
            className="ml-auto shrink-0 h-[34px] w-[34px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center transition-colors"
          >
            {adding ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-plus"></i>}
          </button>
        </div>
        <label className="flex items-center gap-2 mt-1.5 text-[11px] font-medium text-slate-600 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={loanEnabled}
            onChange={(e) => setLoanEnabled(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-emerald-600"
          />
          হাওলাতের জন্য সমর্থিত
        </label>
      </form>

      {currencies === null && <LoadingState />}

      {currencies && (
        currencies.length === 0 ? (
          <EmptyState icon="fa-coins">কোনো কারেন্সি নেই।</EmptyState>
        ) : (
          <div className="space-y-1.5">
            <ul className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800/80">
              {currencies.map((c) => {
                const active = c.status === 'Active';
                return (
                  <li key={c.code} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${active ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}>
                      {c.symbol}
                    </span>
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-xs font-bold text-slate-800 dark:text-gray-100 tracking-wide">{c.code}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{c.decimals}dp</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        title={active ? 'চালু আছে' : 'নিষ্ক্রিয়'}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
                      >
                        {active ? 'Active' : 'Inactive'}
                      </span>
                      <span
                        title={c.loanEnabled ? 'হাওলাতের জন্য সমর্থিত' : 'হাওলাতের জন্য অসমর্থিত'}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${c.loanEnabled ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
                      >
                        লোন {c.loanEnabled ? 'ON' : 'OFF'}
                      </span>
                      <button
                        onClick={() => { setEditingCode(c.code); setEditSymbol(c.symbol); setEditActive(active); setEditLoan(c.loanEnabled); }}
                        aria-label={`${c.code} সম্পাদনা`}
                        className="w-6 h-6 rounded-lg text-gray-300 dark:text-gray-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center"
                      >
                        <i className="fa-solid fa-pen text-[10px]"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        aria-label={`${c.code} কারেন্সি মুছুন`}
                        className="w-6 h-6 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center"
                      >
                        <i className="fa-solid fa-trash-can text-[10px]"></i>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      )}

      <Popup
        open={editingCode !== null}
        onClose={() => { if (!savingEdit) setEditingCode(null); }}
        title={editingCode ? `${editingCode} সম্পাদনা` : ''}
        maxWidth="max-w-xs"
      >
        <div className="space-y-3">
          <div>
            <label className={LABEL_CLS} htmlFor="edit-cur-symbol">চিহ্ন</label>
            <input
              id="edit-cur-symbol"
              value={editSymbol}
              onChange={(e) => setEditSymbol(e.target.value.slice(0, 6))}
              maxLength={6}
              placeholder="৳"
              className={`${INPUT_CLS} text-center text-base`}
            />
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-gray-800 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-600 dark:text-gray-300">Active</span>
              <button
                onClick={() => setEditActive(!editActive)}
                role="switch"
                aria-checked={editActive}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${editActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${editActive ? 'translate-x-4' : ''}`}></span>
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-600 dark:text-gray-300">লোন</span>
              <button
                onClick={() => setEditLoan(!editLoan)}
                role="switch"
                aria-checked={editLoan}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${editLoan ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${editLoan ? 'translate-x-4' : ''}`}></span>
              </button>
            </div>
          </div>
          <button
            onClick={handleSaveEdit}
            disabled={savingEdit}
            className="w-full h-[38px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {savingEdit ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
            সেভ করুন
          </button>
        </div>
      </Popup>
    </SectionCard>
  );
}

// Admin-only account-type registry (backend/Accounts.gs). A type says what KIND
// of account exists ("Cash", "Bank", "Mobile Wallet") and which currencies it may
// be used with; empty applicableCurrencies means "any currency". MANAGE_ACCOUNTS
// is an ADMIN_ONLY action, so `can` is only true for an Admin and the server
// re-checks it regardless.
function CurrencyToggles({ selected, onChange, disabled }) {
  const codes = getActiveCurrencies().map((c) => c.code);
  if (!codes.length) return null;
  const toggle = (code) => {
    if (disabled) return;
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((code) => {
        const on = selected.includes(code);
        return (
          <button
            key={code}
            type="button"
            onClick={() => toggle(code)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${on ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700"}`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}

function AccountTypesManager({ currentUser, can, showAlert, wallets }) {
  const [types, setTypes] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [icon, setIcon] = useState('');
  const [applicable, setApplicable] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const reloadRegistry = () => loadAccounts(currentUser.username, (wallets || []).map((w) => w.WalletID));

  const load = () => {
    api.getAccountTypes(currentUser.username).then((res) => {
      if (res.status === 'ERROR') { showAlert(res.message || 'Account Type লোড করা যায়নি।', 'error'); return; }
      if (res.status === 'SUCCESS') setTypes(res.accountTypes || []);
    }).catch(() => showAlert('Account Type লোড করা যায়নি।', 'error'));
  };

  useEffect(() => {
    if (can('MANAGE_ACCOUNTS')) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = (e) => {
    e.preventDefault();
    if (adding) return;
    if (!name.trim()) return toast.error('Account Type এর নাম দিন!');
    if (!/^[A-Za-z0-9_]{2,20}$/.test(code.trim())) return toast.error('Code ২-২০ অক্ষরের A-Z, 0-9 বা _ হতে হবে।');
    setAdding(true);
    api.addAccountType(
      { name: name.trim(), code: code.trim().toUpperCase(), icon: icon.trim(), applicableCurrencies: applicable },
      currentUser.username
    ).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setName(''); setCode(''); setIcon(''); setApplicable([]); load(); reloadRegistry(); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setAdding(false));
  };

  const openEdit = (t) => {
    setEditing(t);
    setEditDraft({ name: t.Name, code: t.Code, icon: t.Icon || '', applicable: t.ApplicableCurrencies || [], status: t.Status });
  };

  const handleSaveEdit = () => {
    if (!editing || !editDraft || savingEdit) return;
    if (!editDraft.name.trim()) return toast.error('Account Type এর নাম দিন!');
    if (!/^[A-Za-z0-9_]{2,20}$/.test(editDraft.code.trim())) return toast.error('Code ২-২০ অক্ষরের A-Z, 0-9 বা _ হতে হবে।');
    setSavingEdit(true);
    api.updateAccountType(editing.AccountTypeID, {
      name: editDraft.name.trim(),
      code: editDraft.code.trim().toUpperCase(),
      icon: editDraft.icon.trim(),
      applicableCurrencies: editDraft.applicable,
      status: editDraft.status,
    }, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setEditing(null); setEditDraft(null); load(); reloadRegistry(); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setSavingEdit(false));
  };

  const handleDelete = async (t) => {
    const ok = await confirm({ message: `"${t.Name}" Account Type মুছে ফেলবেন? এটি কোনো অ্যাকাউন্ট ব্যবহার করলে মুছে ফেলা যাবে না।` });
    if (!ok) return;
    api.deleteAccountType(t.AccountTypeID, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { load(); reloadRegistry(); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  if (!can('MANAGE_ACCOUNTS')) return null;

  return (
    <SectionCard
      icon="fa-layer-group"
      iconTone="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
      title="অ্যাকাউন্ট টাইপ"
      subtitle="Account Types · সব Wallet-এ প্রযোজ্য"
      count={types ? types.length : undefined}
    >
      <form onSubmit={handleAdd} className="rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-gray-800 px-2.5 py-2 space-y-2">
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0">
            <label className={LABEL_CLS} htmlFor="at-name">নাম</label>
            <input id="at-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: মোবাইল ওয়ালেট" className={INPUT_CLS} />
          </div>
          <div className="w-[92px] shrink-0">
            <label className={LABEL_CLS} htmlFor="at-code">Code</label>
            <input id="at-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20))} placeholder="WALLET" className={`${INPUT_CLS} uppercase`} />
          </div>
          <div className="w-[72px] shrink-0">
            <label className={LABEL_CLS} htmlFor="at-icon">Icon</label>
            <input id="at-icon" value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 40))} placeholder="wallet" className={INPUT_CLS} />
          </div>
          <button type="submit" disabled={adding} aria-label="Account Type যোগ করুন" className="shrink-0 h-[34px] w-[34px] rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center transition-colors">
            {adding ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-plus"></i>}
          </button>
        </div>
        <div>
          <span className={LABEL_CLS}>প্রযোজ্য কারেন্সি (খালি = সব)</span>
          <CurrencyToggles selected={applicable} onChange={setApplicable} disabled={adding} />
        </div>
      </form>

      {types === null && <LoadingState />}

      {types && (
        types.length === 0 ? (
          <EmptyState icon="fa-layer-group">কোনো Account Type নেই।</EmptyState>
        ) : (
          <ul className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800/80">
            {types.map((t) => {
              const active = t.Status === 'Active';
              return (
                <li key={t.AccountTypeID} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}>
                    <i className={`fa-solid fa-${t.Icon || 'wallet'} text-[11px]`}></i>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 dark:text-gray-100 truncate">{t.Name}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                      {t.Code}{(t.ApplicableCurrencies || []).length ? ` · ${t.ApplicableCurrencies.join(', ')}` : ' · সব কারেন্সি'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                    <button onClick={() => openEdit(t)} aria-label={`${t.Name} সম্পাদনা`} className="w-6 h-6 rounded-lg text-gray-300 dark:text-gray-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center">
                      <i className="fa-solid fa-pen text-[10px]"></i>
                    </button>
                    <button onClick={() => handleDelete(t)} aria-label={`${t.Name} মুছুন`} className="w-6 h-6 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center">
                      <i className="fa-solid fa-trash-can text-[10px]"></i>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}

      <Popup open={editing !== null} onClose={() => { if (!savingEdit) { setEditing(null); setEditDraft(null); } }} title={editing ? `${editing.Name} সম্পাদনা` : ''} maxWidth="max-w-xs">
        {editDraft && (
          <div className="space-y-3">
            <div>
              <label className={LABEL_CLS} htmlFor="at-edit-name">নাম</label>
              <input id="at-edit-name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} maxLength={60} className={INPUT_CLS} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS} htmlFor="at-edit-code">Code</label>
                <input id="at-edit-code" value={editDraft.code} onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20) })} className={`${INPUT_CLS} uppercase`} />
              </div>
              <div>
                <label className={LABEL_CLS} htmlFor="at-edit-icon">Icon</label>
                <input id="at-edit-icon" value={editDraft.icon} onChange={(e) => setEditDraft({ ...editDraft, icon: e.target.value.slice(0, 40) })} className={INPUT_CLS} />
              </div>
            </div>
            <div>
              <span className={LABEL_CLS}>প্রযোজ্য কারেন্সি (খালি = সব)</span>
              <CurrencyToggles selected={editDraft.applicable} onChange={(v) => setEditDraft({ ...editDraft, applicable: v })} disabled={savingEdit} />
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-gray-800 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-600 dark:text-gray-300">Active</span>
                <button onClick={() => setEditDraft({ ...editDraft, status: editDraft.status === 'Active' ? 'Inactive' : 'Active' })} role="switch" aria-checked={editDraft.status === 'Active'} className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${editDraft.status === 'Active' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${editDraft.status === 'Active' ? 'translate-x-4' : ''}`}></span>
                </button>
              </div>
            </div>
            <button onClick={handleSaveEdit} disabled={savingEdit} className="w-full h-[38px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors">
              {savingEdit ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>} সেভ করুন
            </button>
          </div>
        )}
      </Popup>
    </SectionCard>
  );
}

// Per-wallet financial accounts. A financial account is the real thing money
// moves through (Wallet "W001"'s "Cash" or "Islami Bank"); its AccountID is what
// every transaction stores. Adding uses ADD_WALLET, editing uses EDIT_WALLET and
// retiring uses MANAGE_WALLET_STATUS - matching backend/Accounts.gs. Opening
// balance is fixed at creation (the money model does not restate history).
function FinancialAccountsManager({ currentUser, can, showAlert, wallets }) {
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [accounts, setAccounts] = useState(null);
  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState('');
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const canAdd = can('ADD_WALLET');
  const canEdit = can('EDIT_WALLET');
  const canRetire = can('MANAGE_WALLET_STATUS');
  const allowed = canAdd || canEdit || canRetire;
  const walletList = wallets || [];

  const selectedWallet = walletList.find((w) => String(w.WalletID) === String(selectedWalletId));

  useEffect(() => {
    if (!selectedWalletId && walletList.length) setSelectedWalletId(String(walletList[0].WalletID));
    else if (selectedWalletId && walletList.length && !walletList.some((w) => String(w.WalletID) === String(selectedWalletId))) {
      setSelectedWalletId(String(walletList[0].WalletID));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  const load = (walletId) => {
    if (!walletId) { setAccounts([]); return; }
    api.getFinancialAccounts(currentUser.username, walletId).then((res) => {
      if (res.status === 'ERROR') { showAlert(res.message || 'অ্যাকাউন্ট লোড করা যায়নি।', 'error'); return; }
      if (res.status === 'SUCCESS') setAccounts(res.accounts || []);
    }).catch(() => showAlert('অ্যাকাউন্ট লোড করা যায়নি।', 'error'));
  };

  useEffect(() => {
    if (!allowed) return;
    api.getAccountTypes(currentUser.username).then((res) => {
      if (res.status === 'SUCCESS') setTypes(res.accountTypes || []);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!allowed) return;
    setAccounts(null);
    setTypeId('');
    load(selectedWalletId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWalletId]);

  const eligibleTypes = useMemo(() => {
    const cur = selectedWallet ? String(selectedWallet.Currency).toUpperCase() : '';
    return types.filter((t) => {
      if (t.Status !== 'Active') return false;
      const list = t.ApplicableCurrencies || [];
      return list.length === 0 || !cur || list.map((c) => String(c).toUpperCase()).includes(cur);
    });
  }, [types, selectedWallet]);

  useEffect(() => {
    if (eligibleTypes.length && !eligibleTypes.some((t) => t.AccountTypeID === typeId)) setTypeId(eligibleTypes[0].AccountTypeID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleTypes.map((t) => t.AccountTypeID).join(',')]);

  const refreshBoth = () => { load(selectedWalletId); loadAccounts(currentUser.username, [selectedWalletId]); };

  const handleAdd = (e) => {
    e.preventDefault();
    if (adding) return;
    if (!selectedWalletId) return toast.error('Wallet নির্বাচন করুন।');
    if (!typeId) return toast.error('Account Type নির্বাচন করুন।');
    const open = parseFloat(opening) || 0;
    if (open < 0) return toast.error('Opening balance ঋণাত্মক হতে পারবে না।');
    setAdding(true);
    api.addFinancialAccount({
      walletId: selectedWalletId,
      accountTypeId: typeId,
      name: name.trim(),
      openingBalance: open,
    }, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setName(''); setOpening(''); refreshBoth(); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setAdding(false));
  };

  const openEdit = (a) => {
    setEditing(a);
    setEditDraft({ name: a.Name, status: a.Status });
  };

  const handleSaveEdit = () => {
    if (!editing || !editDraft || savingEdit) return;
    if (!editDraft.name.trim()) return toast.error('অ্যাকাউন্টের নাম দিন!');
    setSavingEdit(true);
    api.updateFinancialAccount(editing.AccountID, { walletId: selectedWalletId, name: editDraft.name.trim(), status: editDraft.status }, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') { setEditing(null); setEditDraft(null); refreshBoth(); }
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error')).finally(() => setSavingEdit(false));
  };

  const handleRetire = async (a) => {
    const ok = await confirm({ message: `"${a.Name}" অ্যাকাউন্ট মুছবেন? কোনো লেনদেন ও ব্যালেন্স না থাকলে ডাটাবেস থেকে স্থায়ীভাবে মুছে যাবে। লেনদেন/ব্যালেন্স থাকলে নিষ্ক্রিয় হবে এবং এই পেজে দেখাবে — এখান থেকেই আবার সক্রিয় করা যাবে।` });
    if (!ok) return;
    api.deleteFinancialAccount(a.AccountID, { walletId: selectedWalletId }, currentUser.username).then((res) => {
      showAlert(res.message, res.status === 'ERROR' ? 'error' : 'success');
      if (res.status === 'SUCCESS') refreshBoth();
    }).catch(() => showAlert('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'error'));
  };

  if (!allowed) return null;

  return (
    <SectionCard
      icon="fa-building-columns"
      iconTone="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
      title="Wallet অ্যাকাউন্ট"
      subtitle="প্রতিটি Wallet-এর অ্যাকাউন্ট"
      count={accounts ? accounts.length : undefined}
    >
      <div>
        <label className={LABEL_CLS} htmlFor="fa-wallet">Wallet</label>
        {walletList.length === 0 ? (
          <div className="text-[11px] text-gray-400 dark:text-gray-500 py-1">কোনো Wallet এক্সেস নেই।</div>
        ) : (
          <Select value={selectedWalletId} onChange={setSelectedWalletId}>
            {walletList.map((w) => <option key={w.WalletID} value={String(w.WalletID)}>{w.WalletName} ({w.Currency})</option>)}
          </Select>
        )}
      </div>

      {canAdd && walletList.length > 0 && (
        <form onSubmit={handleAdd} className="rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-gray-800 px-2.5 py-2 space-y-2">
          <div className="flex gap-2 items-end">
            <div className="w-[116px] shrink-0">
              <label className={LABEL_CLS} htmlFor="fa-type">টাইপ</label>
              <Select value={typeId} onChange={setTypeId}>
                {eligibleTypes.length === 0 && <option value="">—</option>}
                {eligibleTypes.map((t) => <option key={t.AccountTypeID} value={t.AccountTypeID}>{t.Name}</option>)}
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <label className={LABEL_CLS} htmlFor="fa-name">নাম (ঐচ্ছিক)</label>
              <input id="fa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: Islami Bank" className={INPUT_CLS} />
            </div>
            <div className="w-[96px] shrink-0">
              <label className={LABEL_CLS} htmlFor="fa-open">শুরু</label>
              <input id="fa-open" type="number" step="0.01" min="0" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" className={INPUT_CLS} />
            </div>
            <button type="submit" disabled={adding} aria-label="অ্যাকাউন্ট যোগ করুন" className="shrink-0 h-[34px] w-[34px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center transition-colors">
              {adding ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-plus"></i>}
            </button>
          </div>
        </form>
      )}

      {accounts === null && <LoadingState />}

      {accounts && (
        accounts.length === 0 ? (
          <EmptyState icon="fa-building-columns">এই Wallet-এ কোনো অ্যাকাউন্ট নেই।</EmptyState>
        ) : (
          <ul className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800/80">
            {accounts.map((a) => {
              const active = a.Status === 'Active';
              return (
                <li key={a.AccountID} className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}>
                    <i className={`fa-solid fa-${a.Icon || 'wallet'} text-[11px]`}></i>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 dark:text-gray-100 truncate">{a.Name}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{a.AccountTypeName || a.AccountTypeID} · {selectedWallet?.Currency} {Number(a.OpeningBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                    {canEdit && (
                      <button onClick={() => openEdit(a)} aria-label={`${a.Name} সম্পাদনা`} className="w-6 h-6 rounded-lg text-gray-300 dark:text-gray-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center">
                        <i className="fa-solid fa-pen text-[10px]"></i>
                      </button>
                    )}
                    {canRetire && (
                      <button onClick={() => handleRetire(a)} aria-label={`${a.Name} নিষ্ক্রিয়`} className="w-6 h-6 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center">
                        <i className="fa-solid fa-trash-can text-[10px]"></i>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}

      <Popup open={editing !== null} onClose={() => { if (!savingEdit) { setEditing(null); setEditDraft(null); } }} title={editing ? `${editing.Name} সম্পাদনা` : ''} maxWidth="max-w-xs">
        {editDraft && (
          <div className="space-y-3">
            <div>
              <label className={LABEL_CLS} htmlFor="fa-edit-name">নাম</label>
              <input id="fa-edit-name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} maxLength={60} className={INPUT_CLS} />
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-gray-800 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-600 dark:text-gray-300">Active</span>
                <button onClick={() => setEditDraft({ ...editDraft, status: editDraft.status === 'Active' ? 'Inactive' : 'Active' })} role="switch" aria-checked={editDraft.status === 'Active'} className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${editDraft.status === 'Active' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${editDraft.status === 'Active' ? 'translate-x-4' : ''}`}></span>
                </button>
              </div>
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 px-1">শুরুর ব্যালেন্স ও কারেন্সি পরে পরিবর্তন করা যায় না।</div>
            <button onClick={handleSaveEdit} disabled={savingEdit} className="w-full h-[38px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors">
              {savingEdit ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>} সেভ করুন
            </button>
          </div>
        )}
      </Popup>
    </SectionCard>
  );
}

export default function SettingsView({ showAlert, currentUser, can, wallets }) {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Settings (সেটিংস)</h3>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 flex items-start gap-2.5">
        <div className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-shield-halved text-[10px]"></i>
        </div>
        <div className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 space-y-0.5">
          <div className="font-bold text-amber-900 dark:text-amber-200">নিরাপত্তা সংক্রান্ত তথ্য</div>
          <p>আপনার ডাটা শুধুমাত্র আপনার নিজস্ব Google Drive এবং Google Sheets-এ সংরক্ষিত। অন্য কেউ আপনার অনুমোদিত PIN ছাড়া এক্সেস করতে পারবে না।</p>
        </div>
      </div>

      <CurrenciesManager currentUser={currentUser} can={can} showAlert={showAlert} />
      <AccountTypesManager currentUser={currentUser} can={can} showAlert={showAlert} wallets={wallets} />
      <FinancialAccountsManager currentUser={currentUser} can={can} showAlert={showAlert} wallets={wallets} />
      <CategoriesManager currentUser={currentUser} can={can} showAlert={showAlert} />
    </div>
  );
}
