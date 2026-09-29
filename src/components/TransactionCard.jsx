import { useState } from "react";
import Popup from "./Popup.jsx";
import { DetailCell } from "./FormField.jsx";

const TYPE_BADGES = {
  Income: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Income" },
  Expense: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Expense" },
  "Transfer In": { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400", icon: "fa-arrow-down", label: "Transfer In" },
  "Transfer Out": { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", icon: "fa-arrow-up", label: "Transfer Out" },
  "Loan In": { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Loan In" },
  "Loan Repaid": { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Loan Repaid" },
  "Loan Out": { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Loan Out" },
  "Loan Payment": { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Loan Payment" },
  Transfer: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-400", icon: "fa-right-left", label: "Transfer" },
  Deposit: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Deposit" },
  Withdraw: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Withdraw" },
  "Bank Deposit": { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Bank Deposit" },
  "Bank Withdraw": { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Bank Withdraw" },
};

// Bank operation rows are real Transfer In/Out PAIRS with a "Bank Operation"
// category. The badge color/icon follow the row's money direction (in = green,
// out = rose) so they never contradict the +/- amount; the label keeps the
// operation name that the user performed.
function getBadge(t) {
  if (t.SourceCategory === "Bank Operation") {
    const into = t.Type === "Transfer In";
    const isWithdraw = String(t.WhereVendor || "").toLowerCase().includes("withdraw");
    return {
      ...TYPE_BADGES[into ? "Bank Deposit" : "Bank Withdraw"],
      label: isWithdraw ? "Bank Withdraw" : "Bank Deposit",
    };
  }
  // Legacy transfer rows that carry their direction in the vendor text. Only
  // applied to transfer rows — an Expense vendor containing "deposit"/"withdraw"
  // is NOT a bank operation and must keep its own badge.
  const v = (t.WhereVendor || "").toLowerCase();
  if ((t.Type === "Transfer In" || t.Type === "Transfer Out") &&
      (v.includes("deposit") || v.includes("withdraw"))) {
    return t.Type === "Transfer In" ? TYPE_BADGES.Deposit : TYPE_BADGES.Withdraw;
  }
  return TYPE_BADGES[t.Type] || TYPE_BADGES.Transfer;
}

const LOAN_TXN_TYPES = ["Loan Out", "Loan In", "Loan Payment", "Loan Repaid"];

// Loan-linked rows are never free-form editable, and they are not deletable on
// their own — they are the other side of a loan record.
const EDITABLE_TYPES = ["Income", "Expense", "Transfer Out", "Transfer In"];

export default function TransactionCard({ t, userMap, canEdit, canDelete, onEdit, onDelete }) {
  const badge = getBadge(t);
  const isIncome = t.Type === "Income" || t.Type === "Transfer In" || t.Type === "Loan In" || t.Type === "Loan Repaid" || t.Type === "Bank Deposit";
  const isExpense = t.Type === "Expense" || t.Type === "Transfer Out" || t.Type === "Loan Out" || t.Type === "Loan Payment" || t.Type === "Bank Withdraw";
  const [detailsOpen, setDetailsOpen] = useState(false);

  const canEditThis = canEdit && EDITABLE_TYPES.includes(t.Type);
  const canDeleteThis = canDelete && !LOAN_TXN_TYPES.includes(t.Type);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2 shadow-2xs">
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className="flex items-center gap-3 min-w-0 text-left"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm shrink-0 ${badge.bg} ${badge.text}`}>
          <i className={`fa-solid ${badge.icon}`}></i>
        </div>
        <div className="min-w-0">
          <div className="font-bold text-xs text-slate-800 dark:text-gray-100 flex items-center gap-1.5">
            <span className="truncate">{t.SourceCategory || t.Description || "Transaction"}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {t.Type === "Transfer In" || t.Type === "Transfer Out"
              ? (t.Type === "Transfer Out"
                  ? `${t.WalletName} → ${t.WhereVendor}`
                  : `${t.WhereVendor} → ${t.WalletName}`)
              : (t.WalletName ? t.WalletName + " • " : "") + (t.Account || "")}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5">
            {userMap ? <><i className="fa-solid fa-user me-1"></i>{userMap[t.User] || t.User || "Unknown"} • </> : null}
            {t.Date}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="text-right">
          <div className={`font-bold text-xs ${isIncome ? "text-emerald-600 dark:text-emerald-400" : isExpense ? "text-rose-600 dark:text-rose-400" : "text-purple-600 dark:text-purple-400"}`}>
            {isIncome ? "+" : "-"}
            {(Number.isFinite(parseFloat(t.Amount)) ? parseFloat(t.Amount) : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{t.Currency}</div>
        </div>
      </div>

      <Popup open={detailsOpen} title="Transaction Details" onClose={() => setDetailsOpen(false)} maxWidth="max-w-lg">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm shrink-0 ${badge.bg} ${badge.text}`}>
            <i className={`fa-solid ${badge.icon}`}></i>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-slate-800 dark:text-gray-100 truncate">{t.SourceCategory || t.Description || "Transaction"}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{t.WalletName ? `${t.WalletName} • ` : ""}{t.Currency}</div>
          </div>
          <div className={`font-bold text-sm ${isIncome ? "text-emerald-600 dark:text-emerald-400" : isExpense ? "text-rose-600 dark:text-rose-400" : "text-purple-600 dark:text-purple-400"}`}>
            {isIncome ? "+" : "-"}{formatAmount(t.Amount)} {t.Currency}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-200 dark:border-gray-800 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {t.ID ? <DetailCell label="Transaction ID" value={String(t.ID)} full /> : null}
          {t.Date ? <DetailCell label="Date" value={String(t.Date)} /> : null}
          {t.Type ? <DetailCell label="Type" value={String(t.Type)} /> : null}
          {t.Account ? <DetailCell label="Account" value={String(t.Account)} /> : null}
          {t.SourceCategory ? <DetailCell label="Category" value={String(t.SourceCategory)} /> : null}
          {t.WhereVendor ? <DetailCell label="Vendor" value={String(t.WhereVendor)} full /> : null}
          {t.Description ? <DetailCell label="Description" value={String(t.Description)} full /> : null}
          {t.Note ? <DetailCell label="Note" value={String(t.Note)} full /> : null}
          {t.User ? <DetailCell label="Entry By" value={userMap ? (userMap[t.User] || t.User) : t.User} /> : null}
          {t.Timestamp ? <DetailCell label="Entry Time" value={String(t.Timestamp)} /> : null}
        </div>

        {(canEditThis || canDeleteThis) && (
          <div className="grid grid-cols-2 gap-2">
            {canEditThis && (
              <button onClick={() => { setDetailsOpen(false); onEdit(t); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5">
                <i className="fa-solid fa-pen"></i> Edit
              </button>
            )}
            {canDeleteThis && (
              <button onClick={() => { setDetailsOpen(false); onDelete(t.ID, t.WalletID); }} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5">
                <i className="fa-solid fa-trash-can"></i> Delete
              </button>
            )}
          </div>
        )}
      </Popup>
    </div>
  );
}

function formatAmount(a) {
  return (Number.isFinite(parseFloat(a)) ? parseFloat(a) : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
