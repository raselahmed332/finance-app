import { memo, useState, useEffect, useMemo } from "react";
import { useBalanceReveal, BalanceRevealToggle, MASK } from "../utils/balanceReveal.jsx";
import { getWalletAccounts, accountName, onAccountsChange } from "../utils/accounts.js";

const CURRENCY_FLAGS = {
  SAR: "🇸🇦", BDT: "🇧🇩", USD: "🇺🇸", EUR: "🇪🇺",
  KWD: "🇰🇼", GBP: "🇬🇧", AED: "🇦🇪",
};

// One gradient per wallet slot so a list of wallets is easy to scan. Every
// gradient is dark enough to carry white text in BOTH themes.
const PALETTES = [
  { head: "linear-gradient(135deg,#0b8f68 0%,#06412f 100%)", badge: "rgba(255,255,255,.16)", tint: "var(--ah-surface-2)", border: "var(--ah-border)", icon: "var(--ah-brand)", iconBg: "var(--ah-brand-soft)" },
  { head: "linear-gradient(135deg,#3d55cf 0%,#1d2760 100%)", badge: "rgba(255,255,255,.16)", tint: "var(--ah-surface-2)", border: "var(--ah-border)", icon: "var(--ah-info)", iconBg: "var(--ah-info-soft)" },
  { head: "linear-gradient(135deg,#1f74b8 0%,#0c3357 100%)", badge: "rgba(255,255,255,.16)", tint: "var(--ah-surface-2)", border: "var(--ah-border)", icon: "var(--ah-info)", iconBg: "var(--ah-info-soft)" },
  { head: "linear-gradient(135deg,#7b3fb5 0%,#391a57 100%)", badge: "rgba(255,255,255,.16)", tint: "var(--ah-surface-2)", border: "var(--ah-border)", icon: "var(--ah-brand)", iconBg: "var(--ah-brand-soft)" },
  { head: "linear-gradient(135deg,#b4740d 0%,#5a3704 100%)", badge: "rgba(255,255,255,.16)", tint: "var(--ah-surface-2)", border: "var(--ah-border)", icon: "var(--ah-warning)", iconBg: "var(--ah-warning-soft)" },
  { head: "linear-gradient(135deg,#b8384f 0%,#571422 100%)", badge: "rgba(255,255,255,.16)", tint: "var(--ah-surface-2)", border: "var(--ah-border)", icon: "var(--ah-danger)", iconBg: "var(--ah-danger-soft)" },
];

// Icon per account type so cash/bank keep the icons they always had and any
// custom type (e.g. a wallet) still gets something sensible.
function iconClass(code, p) {
  if (code === "BANK") return `fa-solid fa-building-columns`;
  if (code === "CASH") return `fa-solid fa-money-bill-wave`;
  return `fa-solid fa-wallet`;
}

export default memo(function WalletCard({ wallet, summary, index, onOpen }) {
  const p = PALETTES[index % PALETTES.length];
  const flag = CURRENCY_FLAGS[wallet.Currency] || "💰";
  const [expanded, setExpanded] = useState(false);
  // Re-render when the account registry changes (a new account/rename), since
  // this card is memoized on wallet+summary alone.
  const [, force] = useState(0);
  useEffect(() => onAccountsChange(() => force((v) => v + 1)), []);

  const accountIds = useMemo(() => {
    const list = getWalletAccounts(wallet.WalletID, { activeOnly: false });
    const ids = list.map((a) => a.AccountID);
    Object.keys(summary?.accounts || {}).forEach((id) => {
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    if (ids.length === 0) ids.push("Cash", "Bank");
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.WalletID, summary]);

  const openingFor = (id) => {
    const a = getWalletAccounts(wallet.WalletID, { activeOnly: false }).find((x) => x.AccountID === id);
    if (a) return Number(a.OpeningBalance) || 0;
    if (id === "Cash") return parseFloat(wallet.OpeningCash) || 0;
    if (id === "Bank") return parseFloat(wallet.OpeningBank) || 0;
    return 0;
  };
  const accountLabel = (id) => {
    const list = getWalletAccounts(wallet.WalletID, { activeOnly: false });
    const a = list.find((x) => x.AccountID === id);
    return a ? a.Name : accountName(wallet.WalletID, id);
  };
  const accountIcon = (id) => {
    const list = getWalletAccounts(wallet.WalletID, { activeOnly: false });
    const a = list.find((x) => x.AccountID === id);
    return iconClass(a ? a.AccountTypeCode : id, p);
  };
  const openingAccounts = accountIds.filter((id) => openingFor(id) > 0);
  const hasOpening = openingAccounts.length > 0;

  // The balance figures are masked until the user reveals them, and re-mask
  // themselves BALANCE_REVEAL_SECONDS later. Income/expense totals stay
  // visible - they are flow figures, not the current standing balance.
  const balance = useBalanceReveal(summary);
  const revealed = balance.revealed;
  const amount = (v) => (revealed ? v.toLocaleString("en-US", { minimumFractionDigits: 2 }) : MASK);

  return (
    <div
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      className="card p-3.5 transition-colors"
      style={{ background: p.tint, borderColor: p.border }}
    >
      <div className="flex items-center gap-2 mb-2.5 font-bold text-sm text-ink">
        <span className="text-lg">{flag}</span>
        <span className="truncate">{wallet.WalletName} ({wallet.Currency})</span>
      </div>

      <div
        className="rounded-xl p-3.5 flex justify-between items-start gap-2 mb-3"
        style={{ background: p.head, boxShadow: "var(--ah-shadow)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,.78)" }}>
              মোট ব্যালেন্স
            </span>
            <BalanceRevealToggle
              revealed={balance.revealed}
              secondsLeft={balance.secondsLeft}
              onToggle={balance.toggle}
              tone="onDark"
            />
          </div>
          <div className="text-2xl font-bold tracking-wide tabular-nums break-all" style={{ color: "#fff" }}>
            {wallet.Currency} {amount(summary.totalBalance)}
          </div>
        </div>
        <div className="p-2.5 rounded-lg text-xl shrink-0" style={{ background: p.badge, color: "#fff" }}>
          <i className="fa-solid fa-wallet" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {accountIds.map((id) => (
          <div key={id} className="card-flat p-2 text-center">
            <div className="text-[10px] text-ink-2 flex items-center justify-center gap-1 font-semibold">
              <i className={accountIcon(id)} style={{ color: p.icon }} /> {accountLabel(id)}
            </div>
            <div className="text-xs font-bold text-ink mt-1 tabular-nums">
              {wallet.Currency} {amount(summary?.accounts?.[id] || 0)}
            </div>
          </div>
        ))}
      </div>

      {hasOpening && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="w-full text-[10px] text-ink-3 text-center mb-3 flex items-center justify-center gap-1 transition-colors"
        >
          <i className={`fa-solid fa-chevron-${expanded ? "up" : "down"}`} />
          শুরুর ব্যালেন্স
        </button>
      )}

      {hasOpening && expanded && (
        <div className="card-flat p-2.5 mb-3 text-center text-[11px] text-ink-2 space-y-1">
          {openingAccounts.map((id) => (
            <div key={id}>{accountLabel(id)}: {wallet.Currency} {amount(openingFor(id))}</div>
          ))}
        </div>
      )}

      {/* Income/expense are the current calendar month; the balance figures
          above stay lifetime because that is the wallet's real standing. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="card-flat p-2 px-3" style={{ borderColor: "var(--ah-success)" }}>
          <div className="text-[11px] text-ink-2 font-medium">এ মাসের আয়</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums" style={{ color: "var(--ah-success)" }}>
            <i className="fa-solid fa-arrow-up text-xs me-1" />
            {wallet.Currency} {summary.income.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card-flat p-2 px-3" style={{ borderColor: "var(--ah-danger)" }}>
          <div className="text-[11px] text-ink-2 font-medium">এ মাসের খরচ</div>
          <div className="text-sm font-bold mt-0.5 tabular-nums" style={{ color: "var(--ah-danger)" }}>
            <i className="fa-solid fa-arrow-down text-xs me-1" />
            {wallet.Currency} {summary.expense.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
});
