import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  formatMoney, fmtDate, statusOf, STATUS_META, avatarClass, initialOf,
  loanTypeMeta, remainingOf, todayStr,
} from "../utils/loan.js";
import LoanRepaymentForm from "../components/LoanRepaymentForm.jsx";

function DetailRow({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <span className={`text-xs ${bold ? "font-bold" : "font-semibold"} text-slate-800 dark:text-gray-100`}>{value}</span>
    </div>
  );
}

export default function LoanDetailsView({ loan: initialLoan, wallets, currentUser, can, showAlert, onBack, onGoHome, onEdit, onRepayment }) {
  const meta = loanTypeMeta(initialLoan?.type);

  const [loan, setLoan] = useState(initialLoan);
  const [payments, setPayments] = useState(initialLoan?.payments || []);
  const [loading, setLoading] = useState(true);
  const [showRepay, setShowRepay] = useState(false);

  // Derive status/remaining from the live fetched loan state (not the initial
  // prop) so they refresh immediately after a payment is saved.
  const status = statusOf(loan);
  const statusMeta = STATUS_META[status];
  const remaining = remainingOf(loan);
  // Editing needs MANAGE_LOANS (never auto-granted) — hide the affordance from
  // viewers so they don't hit a dead-end edit screen.
  const canEditLoan = can && can("MANAGE_LOANS");

  useEffect(() => {
    let active = true;
    if (!initialLoan?.id) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    api.getLoanDetails(currentUser.username, initialLoan.id).then((res) => {
      if (!active) return;
      if (res && res.status === "SUCCESS" && res.loan) {
        setLoan(res.loan);
        setPayments(res.loan.payments || []);
      } else if (res && res.status === "ERROR") {
        showAlert(res.message, "error");
      }
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoan?.id]);

  const timeline = useMemo(() => {
    const items = [];
    if (loan) {
      items.push({ key: "initial", date: loan.loanDate, title: meta.ledgerLabel, amount: loan.amount, walletName: loan.walletName, account: loan.account, currency: loan.currency, initial: true });
    }
    (payments || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((p, i) => {
      items.push({ key: p.id || "p" + i, date: p.date, title: p.title || meta.repaymentTitle, amount: p.amount, walletName: p.walletName, account: p.account, currency: p.currency || loan?.currency, initial: false });
    });
    return items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [loan, payments, meta]);

  const handleRepaymentSaved = (res) => {
    if (res && res.status === "SUCCESS") {
      if (res.loan) {
        const refreshed = { ...loan, ...res.loan };
        if (res.loan.payments) refreshed.payments = res.loan.payments;
        setLoan(refreshed);
      }
      if (res.payment) {
        setPayments(prev => {
          const exists = (prev || []).some(p => p.id && String(p.id) === String(res.payment.id));
          if (exists) return prev;
          return [...(prev || []), res.payment];
        });
      }
    }
    setShowRepay(false);
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
            <div className="text-sm font-bold text-slate-800 dark:text-gray-100 mt-0.5">{formatMoney(loan.amount, loan.currency)}</div>
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

      <div className={canEditLoan ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
        <button onClick={() => setShowRepay(true)} disabled={remaining <= 0.005}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-sm shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
          <i className="fa-solid fa-plus"></i> ফেরত যোগ করুন
        </button>
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
                  <span className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-4 ${item.initial ? "bg-slate-500 ring-slate-100 dark:ring-gray-800" : "bg-emerald-500 ring-emerald-100 dark:ring-emerald-900/40"}`}></span>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">{fmtDate(item.date)}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.initial ? "bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"}`}>
                      {item.title}
                    </span>
                  </div>
                  <div className={`text-sm font-bold mt-0.5 ${item.initial ? "text-slate-800 dark:text-gray-100" : "text-emerald-600 dark:text-emerald-400"}`}>
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
          onSave={(formData) => onRepayment(loan.id, formData).then(handleRepaymentSaved).catch(() => {})}
        />
      )}
    </div>
  );
}