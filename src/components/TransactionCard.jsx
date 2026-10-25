import { useState } from "react";
import Popup from "./Popup.jsx";
import { DetailCell } from "./FormField.jsx";
import { accountName } from "../utils/accounts.js";
import { toneStyle } from "../ui/index.jsx";
import { MASK, useBalanceReveal } from "../utils/balanceReveal.jsx";

// Each transaction type gets a colour tone + icon. The tone drives both the
// icon tile and the small badge, so a row always reads the same way.
const TYPE_BADGES = {
  Income: { tone: "success", icon: "fa-sack-dollar", label: "Income" },
  Expense: { tone: "danger", icon: "fa-cart-shopping", label: "Expense" },
  "Transfer In": { tone: "info", icon: "fa-arrow-right-to-bracket", label: "Transfer In" },
  "Transfer Out": { tone: "warning", icon: "fa-arrow-right-from-bracket", label: "Transfer Out" },
  "Loan In": { tone: "success", icon: "fa-hand-holding-dollar", label: "Loan In" },
  "Loan Repaid": { tone: "success", icon: "fa-money-bill-transfer", label: "Loan Repaid" },
  "Loan Out": { tone: "danger", icon: "fa-hand-holding-dollar", label: "Loan Out" },
  "Loan Payment": { tone: "danger", icon: "fa-money-bill-transfer", label: "Loan Payment" },
  "Savings Deposit": { tone: "brand", icon: "fa-piggy-bank", label: "Savings Deposit" },
  "Savings Withdrawal": { tone: "success", icon: "fa-piggy-bank", label: "Savings Withdrawal" },
  "Savings Contribution": { tone: "brand", icon: "fa-piggy-bank", label: "Savings Contribution" },
  "Savings Payout": { tone: "success", icon: "fa-piggy-bank", label: "Savings Payout" },
  "Savings Payment": { tone: "brand", icon: "fa-piggy-bank", label: "Savings Payment" },
  Transfer: { tone: "neutral", icon: "fa-right-left", label: "Transfer" },
  Deposit: { tone: "success", icon: "fa-building-columns", label: "Deposit" },
  Withdraw: { tone: "danger", icon: "fa-building-columns", label: "Withdraw" },
  "Bank Deposit": { tone: "success", icon: "fa-building-columns", label: "Bank Deposit" },
  "Bank Withdraw": { tone: "danger", icon: "fa-building-columns", label: "Bank Withdraw" },
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
  // Any savings row keeps the savings (piggy-bank) icon, even a subtype the
  // badge table does not name explicitly - it must never fall back to the
  // generic transfer icon.
  if (String(t.Type || "").indexOf("Savings") === 0) {
    return TYPE_BADGES[t.Type] || { ...TYPE_BADGES["Savings Deposit"], label: t.Type };
  }
  return TYPE_BADGES[t.Type] || TYPE_BADGES.Transfer;
}

const LOAN_TXN_TYPES = ["Loan Out", "Loan In", "Loan Payment", "Loan Repaid"];
const SAVINGS_TXN_TYPES = ["Savings Deposit", "Savings Withdrawal", "Savings Contribution", "Savings Payout", "Savings Payment"];

// Loan/savings-linked rows are never free-form editable, and they are not
// deletable on their own — they are the other side of a record.
const EDITABLE_TYPES = ["Income", "Expense", "Transfer Out", "Transfer In"];

export default function TransactionCard({ t, balanceAfter, userMap, canEdit, canDelete, onEdit, onDelete }) {
  const badge = getBadge(t);
  const isIncome = t.Type === "Income" || t.Type === "Transfer In" || t.Type === "Loan In" || t.Type === "Loan Repaid" || t.Type === "Bank Deposit" || t.Type === "Savings Withdrawal" || t.Type === "Savings Payout";
  const isExpense = t.Type === "Expense" || t.Type === "Transfer Out" || t.Type === "Loan Out" || t.Type === "Loan Payment" || t.Type === "Bank Withdraw" || t.Type === "Savings Deposit" || t.Type === "Savings Contribution" || t.Type === "Savings Payment";
  const [detailsOpen, setDetailsOpen] = useState(false);
  const balanceVisibility = useBalanceReveal(`${t.ID}:${balanceAfter ?? "unavailable"}`);

  const canEditThis = canEdit && EDITABLE_TYPES.includes(t.Type);
  const canDeleteThis = canDelete && !LOAN_TXN_TYPES.includes(t.Type) && !SAVINGS_TXN_TYPES.includes(t.Type);

  const amountColor = isIncome
    ? "var(--ah-success)"
    : isExpense
      ? "var(--ah-danger)"
      : "var(--ah-info)";
  const tile = toneStyle(badge.tone);

  return (
    <div className="card flex items-center justify-between gap-2 p-3">
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className="flex items-center gap-3 min-w-0 text-left"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm shrink-0"
          style={tile}
        >
          <i className={`fa-solid ${badge.icon}`} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-xs text-ink flex items-center gap-1.5">
            <span className="truncate">{t.SourceCategory || t.Description || "Transaction"}</span>
            <span
              className="badge shrink-0"
              style={{ background: tile.background, color: tile.color }}
            >
              {badge.label}
            </span>
          </div>
          <div className="text-[11px] text-ink-2 mt-0.5 truncate">
            {t.Type === "Transfer In" || t.Type === "Transfer Out"
              ? (t.Type === "Transfer Out"
                  ? `${t.WalletName} → ${t.WhereVendor}`
                  : `${t.WhereVendor} → ${t.WalletName}`)
              : (t.WalletName ? t.WalletName + " • " : "") + (t.Account ? accountName(t.WalletID, t.Account) : "")}
          </div>
          <div className="text-[10px] text-ink-3 mt-0.5">
            {userMap ? <><i className="fa-solid fa-user me-1" />{userMap[t.User] || t.User || "Unknown"} • </> : null}
            {t.Date}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="text-right">
          <div className="font-bold text-xs tnum" style={{ color: amountColor }}>
            {isIncome ? "+" : "-"}
            {formatAmount(t.Amount)}
          </div>
          <div className="text-[10px] font-bold text-ink-3">{t.Currency}</div>
          {balanceAfter !== undefined ? (
            <div className="flex items-center justify-end gap-1 text-[9px] font-medium text-ink-3 whitespace-nowrap">
              <span>Balance: {t.Currency} {balanceVisibility.revealed ? formatAmount(balanceAfter) : MASK}</span>
              <BalanceVisibilityButton
                revealed={balanceVisibility.revealed}
                secondsLeft={balanceVisibility.secondsLeft}
                onToggle={balanceVisibility.toggle}
              />
            </div>
          ) : null}
        </div>
      </div>

      <Popup open={detailsOpen} title="Transaction Details" onClose={() => setDetailsOpen(false)} maxWidth="max-w-lg">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm shrink-0"
            style={tile}
          >
            <i className={`fa-solid ${badge.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-ink truncate">{t.SourceCategory || t.Description || "Transaction"}</div>
            <div className="text-[11px] text-ink-2">{t.WalletName ? `${t.WalletName} • ` : ""}{t.Currency}</div>
          </div>
          <div className="font-bold text-sm tnum" style={{ color: amountColor }}>
            {isIncome ? "+" : "-"}{formatAmount(t.Amount)} {t.Currency}
          </div>
        </div>

        <div className="card-inset p-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {t.ID ? <DetailCell label="Transaction ID" value={String(t.ID)} full /> : null}
          {t.Date ? <DetailCell label="Date" value={String(t.Date)} /> : null}
          {t.Type ? <DetailCell label="Type" value={String(t.Type)} /> : null}
          {t.Account ? <DetailCell label="Account" value={accountName(t.WalletID, t.Account)} /> : null}
          {t.SourceCategory ? <DetailCell label="Category" value={String(t.SourceCategory)} /> : null}
          {t.WhereVendor ? <DetailCell label="Vendor" value={String(t.WhereVendor)} full /> : null}
          {t.Description ? <DetailCell label="Description" value={String(t.Description)} full /> : null}
          {t.Note ? <DetailCell label="Note" value={String(t.Note)} full /> : null}
          {t.User ? <DetailCell label="Entry By" value={userMap ? (userMap[t.User] || t.User) : t.User} /> : null}
          {t.Timestamp ? <DetailCell label="Entry Time" value={String(t.Timestamp)} /> : null}
          {balanceAfter !== undefined ? (
            <div className="col-span-2 flex items-center justify-between gap-2">
              <div>
                <div className="section-sub uppercase tracking-wide">Balance after</div>
                <div className="text-[11px] font-semibold text-ink mt-0.5 break-words">
                  {t.Currency} {balanceVisibility.revealed ? formatAmount(balanceAfter) : MASK}
                </div>
              </div>
              <BalanceVisibilityButton
                revealed={balanceVisibility.revealed}
                secondsLeft={balanceVisibility.secondsLeft}
                onToggle={balanceVisibility.toggle}
              />
            </div>
          ) : null}
        </div>

        {(canEditThis || canDeleteThis) && (
          <div className="grid grid-cols-2 gap-2">
            {canEditThis && (
              <button onClick={() => { setDetailsOpen(false); onEdit(t); }} className="btn btn-secondary">
                <i className="fa-solid fa-pen" /> Edit
              </button>
            )}
            {canDeleteThis && (
              <button onClick={() => { setDetailsOpen(false); onDelete(t.ID, t.WalletID); }} className="btn btn-danger">
                <i className="fa-solid fa-trash-can" /> Delete
              </button>
            )}
          </div>
        )}
      </Popup>
    </div>
  );
}

function BalanceVisibilityButton({ revealed, secondsLeft, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-3 hover:bg-[var(--ah-surface-3)]"
      title={revealed ? `Hide balance (${secondsLeft}s)` : "Show balance"}
      aria-label={revealed ? "Hide balance" : "Show balance"}
    >
      <i className={`fa-solid ${revealed ? "fa-eye-slash" : "fa-eye"} text-[9px]`} />
    </button>
  );
}

function formatAmount(a) {
  return (Number.isFinite(parseFloat(a)) ? parseFloat(a) : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
