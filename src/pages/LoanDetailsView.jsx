import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  formatMoney, fmtDate, statusOf, STATUS_META, avatarClass, initialOf,
  loanTypeMeta, remainingOf, totalAmountOf, todayStr,
} from "../utils/loan.js";
import LoanRepaymentForm from "../components/LoanRepaymentForm.jsx";
import LoanAddForm from "../components/LoanAddForm.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";

function DetailRow({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <span className={`text-xs ${bold ? "font-bold" : "font-semibold"} text-slate-800 dark:text-gray-100`}>{value}</span>
    </div>
  );
}

export default function LoanDetailsView({ loan: initialLoan, wallets, currentUser, can, showAlert, onBack, onGoHome, onEdit, onRepayment, onAddAddition, onEditAddition, onDeleteAddition }) {
  const meta = loanTypeMeta(initialLoan?.type);

  const [loan, setLoan] = useState(initialLoan);
  const [payments, setPayments] = useState(initialLoan?.payments || []);
  const [additions, setAdditions] = useState(initialLoan?.additions || []);
  const [loading, setLoading] = useState(true);
  const [showRepay, setShowRepay] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingAddition, setEditingAddition] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const confirm = useConfirm();

  // Derive status/remaining from the live fetched loan state (not the initial
  // prop) so they refresh immediately after a payment is saved.
  const status = statusOf(loan);
  const statusMeta = STATUS_META[status];
  const remaining = remainingOf(loan);
  const loanTotal = totalAmountOf(loan);
  // Editing needs MANAGE_LOANS (never auto-granted) — hide the affordance from
  // viewers so they don't hit a dead-end edit screen.
  const canEditLoan = can && can("MANAGE_LOANS");
  // "টাকা যোগ করুন" uses the same issuing action the original loan used.
  const canAddExtra = can && can(String(loan?.type) === "given" ? "LOAN_GIVE" : "LOAN_TAKE");
  const actionCols = 1 + (canEditLoan ? 1 : 0) + (canAddExtra ? 1 : 0);

  useEffect(() => {
    let active = true;
    if (!initialLoan?.id) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    api.getLoanDetails(currentUser.username, initialLoan.id).then((res) => {
      if (!active) return;
      if (res && res.status === "SUCCESS" && res.loan) {
        setLoan(res.loan);
        setPayments(res.loan.payments || []);
        setAdditions(res.loan.additions || []);
      } else if (res && res.status === "ERROR") {
        showAlert(res.message, "error");
      }
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoan?.id, refreshKey]);

  const timeline = useMemo(() => {
    const items = [];
    if (loan) {
      items.push({ key: "initial", date: loan.loanDate, title: meta.ledgerLabel, amount: loan.amount, walletName: loan.walletName, account: loan.account, currency: loan.currency, initial: true });
    }
    (additions || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((ad, i) => {
      items.push({ key: ad.id || "a" + i, date: ad.date, title: meta.additionLabel, amount: ad.amount, walletName: ad.walletName, account: ad.account, currency: ad.currency || loan?.currency, initial: false, addition: true });
    });
    (payments || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((p, i) => {
      items.push({ key: p.id || "p" + i, date: p.date, title: p.title || meta.repaymentTitle, amount: p.amount, walletName: p.walletName, account: p.account, currency: p.currency || loan?.currency, initial: false });
    });
    return items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [loan, payments, additions, meta]);

  const handleRepaymentSaved = (res) => {
    if (res && res.status === "SUCCESS") {
      if (res.loan) {
        setLoan((prev) => prev ? { ...prev, ...res.loan } : { ...res.loan });
      }
      if (res.payment) {
        setPayments((prev) => {
          const exists = (prev || []).some(p => p.id && String(p.id) === String(res.payment.id));
          if (exists) return prev;
          return [...(prev || []), res.payment];
        });
      }
      // Re-fetch the full loan details (loan + payments + additions) so the
      // summary and payment history always reflect the saved repayment.
      setRefreshKey((k) => k + 1);
    }
    setShowRepay(false);
  };

  // After any addition add/edit/delete the derived totals change, so re-fetch
  // the full loan details (additions + payments + loan) for a consistent view.
  const handleAdditionSaved = (res) => {
    if (res && res.status === "SUCCESS") setRefreshKey((k) => k + 1);
    setShowAdd(false);
    setEditingAddition(null);
  };

  const handleDeleteAddition = async (ad) => {
    const ok = await confirm({ message: "এই অ্যাডিশনটি মুছে ফেলবেন? (Wallet ব্যালেন্স থেকেও টাকার প্রভাব ফেরত নেওয়া হবে)" });
    if (!ok) return;
    onDeleteAddition(ad.id).then(handleAdditionSaved).catch(() => {});
  };

  if (!initialLoan) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-gray-500 dark:text-gray-400"><i className="fa-solid fa-arrow-left text-lg"></i></button>
          <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">লোন বিস্তারিত</h3>
          <div className="w-5"></div>
        </div>
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">লোন পাওয়া যায়নি।</div>
        <button onClick={onBack} className="w-full bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-xs">লিষ্টে ফিরে যান</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base flex items-center gap-2">
          <i className="fa-solid fa-hand-holding-dollar text-emerald-600"></i> লোন বিস্তারিত
        </h3>
        <button onClick={onGoHome} className="text-gray-400 dark:text-gray-500 hover:text-emerald-600 text-sm" title="হোমে যান">
          <i className="fa-solid fa-house"></i>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`w-14 h-14 rounded-full ${avatarClass(loan.personName)} text-white flex items-center justify-center text-xl font-bold flex-shrink-0 shadow-sm`}>
            {initialOf(loan.personName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base text-slate-800 dark:text-gray-100 truncate">{loan.personName}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <i className="fa-solid fa-phone text-[10px] me-1"></i>{loan.phone || "নাম্বার নেই"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.short === "দিয়েছি" ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"}`}>
              {meta.short}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusMeta.bg} ${statusMeta.text}`}>{statusMeta.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-2.5 text-center border border-gray-100 dark:border-gray-800">
            <div className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">মোট হাওলাত</div>
            <div className="text-sm font-bold text-slate-800 dark:text-gray-100 mt-0.5">{formatMoney(loanTotal, loan.currency)}</div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2.5 text-center border border-emerald-100 dark:border-emerald-800">
            <div className="text-[9px] text-emerald-700 dark:text-emerald-400 font-medium">{meta.repaidLabel}</div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatMoney(loan.repaid, loan.currency)}</div>
          </div>
          <div className={`rounded-xl p-2.5 text-center border ${remaining > 0 ? "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800" : "bg-slate-50 dark:bg-gray-950 border-gray-100 dark:border-gray-800"}`}>
            <div className="text-[9px] text-amber-700 dark:text-amber-400 font-medium">বাকি</div>
            <div className={`text-sm font-bold mt-0.5 ${remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-gray-400"}`}>{formatMoney(remaining, loan.currency)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-1">বিস্তারিত</div>
        <DetailRow label="স্ট্যাটাস" value={statusMeta.label} />
        <DetailRow label="প্রথম হাওলাতের তারিখ" value={fmtDate(loan.loanDate)} />
        <DetailRow label="ডিউ তারিখ" value={loan.dueDate ? fmtDate(loan.dueDate) : "—"} />
        <DetailRow label="কারেন্সি" value={loan.currency} />
        <DetailRow label="ওয়ালেট" value={loan.walletName || loan.walletId} />
        <DetailRow label="ওয়ালেট অ্যাকাউন্ট" value={loan.account || "—"} />
        {loan.note && <DetailRow label="নোট" value={loan.note} />}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200">হাওলাতের বিস্তারিত</div>
          {canAddExtra && (
            <button onClick={() => { setEditingAddition(null); setShowAdd(true); }} className="text-[10px] font-bold bg-sky-600 hover:bg-sky-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1">
              <i className="fa-solid fa-plus"></i> টাকা যোগ করুন
            </button>
          )}
        </div>

        <div className="flex items-center justify-between py-1.5">
          <div>
            <div className="text-[11px] font-semibold text-slate-700 dark:text-gray-200">প্রথম হাওলাত</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">{fmtDate(loan.loanDate)}</div>
          </div>
          <span className="text-xs font-bold text-slate-800 dark:text-gray-100">{formatMoney(Number(loan.originalAmount || loan.amount) || 0, loan.currency)}</span>
        </div>

        {additions.length === 0 ? (
          <div className="py-2 text-[11px] text-gray-400 dark:text-gray-500">কোনো অতিরিক্ত টাকা যোগ হয়নি।</div>
        ) : (
          additions.map((ad) => (
            <div key={ad.id} className="flex items-center justify-between py-1.5 border-t border-gray-50 dark:border-gray-800">
              <div className="flex-1 min-w-0 pr-2">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-gray-200">{meta.additionLabel}</div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{fmtDate(ad.date)} • {ad.walletName || "—"} ({ad.account || "—"})</div>
                {ad.note && <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{ad.note}</div>}
              </div>
              <div className="text-right flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">+{formatMoney(ad.amount, ad.currency || loan.currency)}</span>
                {canEditLoan && (
                  <span className="flex items-center gap-1">
                    <button onClick={() => setEditingAddition(ad)} className="text-xs text-gray-400 hover:text-emerald-600"><i className="fa-solid fa-pen"></i></button>
                    <button onClick={() => handleDeleteAddition(ad)} className="text-xs text-gray-400 hover:text-rose-600"><i className="fa-solid fa-trash"></i></button>
                  </span>
                )}
              </div>
            </div>
          ))
        )}

        <div className="border-t border-gray-100 dark:border-gray-800 mt-2 pt-2 space-y-1.5">
          <div className="flex justify-between text-[11px]"><span className="text-gray-500 dark:text-gray-400">মোট হাওলাত</span><span className="font-bold text-slate-800 dark:text-gray-100">{formatMoney(loanTotal, loan.currency)}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-emerald-600 dark:text-emerald-400 font-medium">{meta.repaidLabel}</span><span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(loan.repaid, loan.currency)}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-amber-600 dark:text-amber-400 font-medium">বাকি</span><span className="font-bold text-amber-600 dark:text-amber-400">{formatMoney(remaining, loan.currency)}</span></div>
        </div>
      </div>

      <div className={`grid gap-2 ${actionCols === 3 ? "grid-cols-3" : actionCols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        <button onClick={() => setShowRepay(true)} disabled={remaining <= 0.005}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
          <i className="fa-solid fa-plus"></i> ফেরত যোগ করুন
        </button>
        {canAddExtra && (
          <button onClick={() => { setEditingAddition(null); setShowAdd(true); }} className="bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
            <i className="fa-solid fa-circle-plus"></i> টাকা যোগ করুন
          </button>
        )}
        {canEditLoan && (
          <button onClick={onEdit} className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 font-bold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
            <i className="fa-solid fa-pen"></i> এডিট করুন
          </button>
        )}
      </div>

      {remaining <= 0.005 && (
        <div className="text-center text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl p-2.5">
          <i className="fa-solid fa-circle-check me-1"></i> এই হাওলাত সম্পূর্ণ ফেরত হয়েছে।
        </div>
      )}

      {remaining > 0 && initialLoan.dueDate && initialLoan.dueDate < todayStr() && (
        <div className="text-center text-[11px] text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl p-2.5">
          <i className="fa-solid fa-triangle-exclamation me-1"></i> ডিউ তারিখ অতিক্রান্ত — হাওলাত ওভারডিউ।
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-4">পেমেন্ট হিস্টোরি</div>
        {loading ? (
          <div className="text-center py-6">
            <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">লোড হচ্ছে...</div>
          </div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">কোনো লেনদেন নেই।</div>
        ) : (
          <div className="relative">
            <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
            <div className="space-y-4">
              {timeline.map((item) => (
                <div key={item.key} className="relative pl-6">
                  <span className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-4 ${item.initial ? "bg-slate-500 ring-slate-100 dark:ring-gray-800" : item.addition ? "bg-amber-500 ring-amber-100 dark:ring-amber-900/40" : "bg-emerald-500 ring-emerald-100 dark:ring-emerald-900/40"}`}></span>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">{fmtDate(item.date)}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.initial ? "bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300" : item.addition ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"}`}>
                      {item.title}
                    </span>
                  </div>
                  <div className={`text-sm font-bold mt-0.5 ${item.initial ? "text-slate-800 dark:text-gray-100" : item.addition ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {formatMoney(item.amount, item.currency)}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Wallet: <span className="font-semibold">{item.walletName || "—"}</span> • Account: <span className="font-semibold">{item.account || "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showRepay && (
        <LoanRepaymentForm
          loan={loan}
          wallets={wallets || []}
          currentUser={currentUser}
          onCancel={() => setShowRepay(false)}
          onSave={(formData) => onRepayment(loan.id, formData).then((res) => {
            if (res && res.status === "SUCCESS") handleRepaymentSaved(res);
          }).catch(() => {})}
        />
      )}

      {(showAdd || editingAddition) && (
        <LoanAddForm
          loan={loan}
          addition={editingAddition || null}
          wallets={wallets || []}
          currentUser={currentUser}
          onCancel={() => { setShowAdd(false); setEditingAddition(null); }}
          onSave={(formData) => {
            const action = editingAddition ? onEditAddition(formData) : onAddAddition(loan.id, formData);
            return action.then(handleAdditionSaved).catch(() => {});
          }}
        />
      )}
    </div>
  );
}