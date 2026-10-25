import { useState, useMemo, useEffect } from "react";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import TransactionCard from "../components/TransactionCard.jsx";
import { compareNewestFirst } from "../utils/sortTransactions.js";
import { DATE_CHOICES, dateInRange, todayStr } from "../utils/loan.js";
import { getWalletAccounts, onAccountsChange } from "../utils/accounts.js";
import { Chip, EmptyState, PageHeader } from "../ui/index.jsx";

// Shows the active window so the applied filter is visible without reopening
// the sheet. "Custom" keeps the raw range because the two dates are the only
// honest description of it.
function dateRangeLabel(range) {
  if (!range || range.option === "all") return "সব সময়";
  if (range.option === "custom") {
    if (range.from && range.to) return `${range.from} থেকে ${range.to}`;
    if (range.from) return `${range.from} থেকে আজ`;
    if (range.to) return `শুরু থেকে ${range.to}`;
    return "Custom Date Range";
  }
  return (DATE_CHOICES.find((d) => d.value === range.option) || {}).label || "সব সময়";
}

export default function TransactionsView({ transactions, transactionBalances, wallets, onDelete, onEdit, canEdit, canDelete, searchTerm, setSearchTerm, filterType, setFilterType, filterWallet, setFilterWallet, filterUser, setFilterUser, filterAccount, setFilterAccount, canViewUsers, users }) {
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  // Date range is kept local to this view rather than lifted into App: it is
  // only ever read here, and lifting it would put filter state in two places.
  // draft* is what the open sheet is editing; dateRange is the applied value,
  // so closing the sheet without applying discards the edits.
  const [dateRange, setDateRange] = useState({ option: "all", from: "", to: "" });
  const [draft, setDraft] = useState({ option: "all", from: "", to: "" });
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  const userMap = useMemo(() => {
    const map = {};
    (users || []).forEach((u) => {
      map[u.Username] = u.FullName || u.Username;
    });
    return map;
  }, [users]);

  // Defense-in-depth: only ever render/export transactions belonging to a
  // wallet in the user's authorized wallet list. The backend already filters,
  // but this keeps a stray row from leaking into the UI or CSV export.
  const accessibleWalletIds = useMemo(() => new Set((wallets || []).map(w => String(w.WalletID))), [wallets]);

  // Account chips follow the account registry: one pill per distinct account id
  // across the user's wallets. Ids (not names) are the filter value so the same
  // account in different wallets never collapses, while Income/Expense still
  // key off the stored Account id. Re-renders when accounts are (re)loaded.
  const [, forceAccounts] = useState(0);
  useEffect(() => onAccountsChange(() => forceAccounts((v) => v + 1)), []);

  const accountChips = useMemo(() => {
    const map = {};
    (wallets || []).forEach((w) => {
      getWalletAccounts(w.WalletID, { activeOnly: false }).forEach((a) => {
        if (!map[a.AccountID]) map[a.AccountID] = { id: a.AccountID, name: a.Name };
      });
    });
    const chips = Object.values(map);
    return chips.length ? chips : [{ id: "Cash", name: "Cash" }, { id: "Bank", name: "Bank" }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  const filteredTxns = useMemo(
    () =>
      transactions
        .filter((t) => {
          const matchesWalletAccess = !accessibleWalletIds.size || accessibleWalletIds.has(String(t.WalletID));
          if (!matchesWalletAccess) return false;
          const matchesSearch =
            (t.Description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.SourceCategory || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.WhereVendor || "").toLowerCase().includes(searchTerm.toLowerCase());
          const matchesType = filterType === "All" || t.Type.toLowerCase().includes(filterType.toLowerCase());
          const matchesWallet = filterWallet === "All" || String(t.WalletID) === String(filterWallet);
          const matchesUser = !canViewUsers || filterUser === "All" || t.User === filterUser;
          const matchesAccount = filterAccount === "All" || (t.Account || "").toLowerCase() === filterAccount.toLowerCase();
          const matchesDate = dateInRange(t.Date, dateRange, todayStr());
          return matchesSearch && matchesType && matchesWallet && matchesUser && matchesAccount && matchesDate;
        })
        .sort(compareNewestFirst),
    [transactions, searchTerm, filterType, filterWallet, filterUser, filterAccount, dateRange, canViewUsers, accessibleWalletIds]
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterType, filterWallet, filterUser, filterAccount, dateRange]);

  const totalPages = Math.max(1, Math.ceil(filteredTxns.length / PER_PAGE));
  const pageItems = filteredTxns.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // After deleting rows (or a filter reducing the list), page may point past
  // the last page; clamp it so the list and the "Showing X–Y" text stay valid.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Transactions"
        subtitle="হিসাবের তালিকা"
        icon="fa-list-check"
        right={
          <span
            className="badge"
            style={{ background: "var(--ah-brand-soft)", color: "var(--ah-brand-strong)" }}
          >
            {filteredTxns.length} টি
          </span>
        }
      />

      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-xs" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..."
          className="input pl-9"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-3 min-w-0">
          <i className="fa-solid fa-calendar-days text-[10px] shrink-0" />
          <span className="truncate">{dateRangeLabel(dateRange)}</span>
        </div>
        <button
          onClick={() => { setDraft(dateRange); setDateSheetOpen(true); }}
          className="chip shrink-0"
          style={
            dateRange.option === "all"
              ? undefined
              : { background: "var(--ah-brand)", borderColor: "var(--ah-brand)", color: "var(--ah-brand-contrast)" }
          }
        >
          <i className="fa-solid fa-sliders text-[9px]" /> তারিখ
        </button>
      </div>

      <Popup open={dateSheetOpen} title="তারিখ ফিল্টার" onClose={() => setDateSheetOpen(false)}>
        <div className="flex flex-wrap gap-1.5">
          {DATE_CHOICES.map((d) => (
            <Chip
              key={d.value}
              active={draft.option === d.value}
              onClick={() => setDraft((p) => ({ ...p, option: d.value }))}
            >
              {d.label}
            </Chip>
          ))}
        </div>

        {draft.option === "custom" && (
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="label">তারিখ (থেকে)</label>
              <input
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((p) => ({ ...p, from: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="label">তারিখ (পর্যন্ত)</label>
              <input
                type="date"
                value={draft.to}
                onChange={(e) => setDraft((p) => ({ ...p, to: e.target.value }))}
                className="input"
              />
            </div>
            {/* Catching the inverted case here beats silently returning nothing:
                a from later than to would otherwise filter out every row. */}
            {draft.from && draft.to && draft.from > draft.to && (
              <div className="err">
                <i className="fa-solid fa-circle-exclamation" />
                "থেকে" তারিখ "পর্যন্ত" তারিখের পরে হতে পারে না।
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { setDateRange({ option: "all", from: "", to: "" }); setDateSheetOpen(false); }}
            className="btn btn-secondary"
          >
            রিসেট
          </button>
          <button
            disabled={draft.option === "custom" && draft.from && draft.to && draft.from > draft.to}
            onClick={() => { setDateRange(draft); setDateSheetOpen(false); }}
            className="btn btn-primary"
          >
            ফিল্টার করুন
          </button>
        </div>
      </Popup>

      <div className={canViewUsers ? "grid grid-cols-2 gap-2" : ""}>
        <div>
          <label className="label">Wallet</label>
          <Select value={filterWallet} onChange={setFilterWallet}>
            <option value="All">সব Wallet</option>
            {wallets.map((w) => (
              <option key={w.WalletID} value={w.WalletID}>
                {w.WalletName} ({w.Currency})
              </option>
            ))}
          </Select>
        </div>

        {canViewUsers && (
          <div>
            <label className="label">ব্যবহারকারী</label>
            <Select value={filterUser} onChange={setFilterUser}>
              <option value="All">সব ব্যবহারকারী</option>
              {[...new Set(transactions.map((t) => t.User).filter(Boolean))].map((user) => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        {["All", "Income", "Expense", "Transfer"].map((t) => (
          <Chip key={t} active={filterType === t} onClick={() => setFilterType(t)}>
            {t}
          </Chip>
        ))}
        <span className="text-ink-3 mx-1 self-center">|</span>
        {[{ id: "All", name: "All" }, ...accountChips].map((a) => (
          <Chip key={a.id} active={filterAccount === a.id} onClick={() => setFilterAccount(a.id)}>
            {a.name}
          </Chip>
        ))}
      </div>

      <div className="text-[11px] text-ink-3 px-1">
        {filteredTxns.length > 0
          ? `Showing ${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, filteredTxns.length)} of ${filteredTxns.length}`
          : ""}
      </div>

      <div className="space-y-2">
        {pageItems.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="fa-inbox"
              title="কোনো লেনদেন পাওয়া যায়নি"
              text="নতুন লেনদেন যোগ করুন অথবা ফিল্টার পরিবর্তন করুন।"
            />
          </div>
        ) : (
          pageItems.map((t) => <TransactionCard key={t.ID} t={t} balanceAfter={transactionBalances?.get(t)} userMap={userMap} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} />)
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1.5 pt-2 flex-wrap">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="icon-btn"
            aria-label="আগের পাতা"
          >
            <i className="fa-solid fa-chevron-left text-xs" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                page === n
                  ? "bg-[var(--ah-brand)] text-[var(--ah-brand-contrast)]"
                  : "bg-[var(--ah-surface-3)] text-ink-2"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="icon-btn"
            aria-label="পরের পাতা"
          >
            <i className="fa-solid fa-chevron-right text-xs" />
          </button>
        </div>
      )}
    </div>
  );
}
