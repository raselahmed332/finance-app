import { useState, useRef } from "react";

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

function getBadge(t) {
  const v = (t.WhereVendor || "").toLowerCase();
  if (v.includes("deposit")) return TYPE_BADGES.Deposit;
  if (v.includes("withdraw")) return TYPE_BADGES.Withdraw;
  return TYPE_BADGES[t.Type] || TYPE_BADGES.Transfer;
}

export default function TransactionSwipeCard({ t, userMap, canEdit, canDelete, onEdit, onDelete }) {
  const badge = getBadge(t);
  const isIncome = t.Type === "Income" || t.Type === "Transfer In" || t.Type === "Loan In" || t.Type === "Loan Repaid" || t.Type === "Bank Deposit";
  const isExpense = t.Type === "Expense" || t.Type === "Transfer Out" || t.Type === "Loan Out" || t.Type === "Loan Payment" || t.Type === "Bank Withdraw";
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
      {/* Background actions revealed on swipe */}
      <div className="absolute inset-0 flex">
        <div className="w-1/2 bg-blue-500 flex items-center justify-end pr-4 text-white text-xs font-semibold">
          <i className="fa-solid fa-pen me-1"></i> Edit
        </div>
        <div className="w-1/2 bg-red-500 flex items-center justify-start pl-4 text-white text-xs font-semibold">
          Delete <i className="fa-solid fa-trash-can ms-1"></i>
        </div>
      </div>

      {/* Card */}
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
              {userMap ? <><i className="fa-solid fa-user me-1"></i>{userMap[t.User] || t.User || "Unknown"} • </> : null}
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