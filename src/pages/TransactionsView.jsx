import { useState, useMemo, useEffect } from "react";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import TransactionCard from "../components/TransactionCard.jsx";
import { compareNewestFirst } from "../utils/sortTransactions.js";
import { DATE_CHOICES, dateInRange, todayStr } from "../utils/loan.js";

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

export default function TransactionsView({ transactions, wallets, onDelete, onEdit, canEdit, canDelete, searchTerm, setSearchTerm, filterType, setFilterType, filterWallet, setFilterWallet, filterUser, setFilterUser, filterAccount, setFilterAccount, canViewUsers, users }) {
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
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Transactions (হিসাবের তালিকা)</h3>
        <span className="text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full font-semibold">{filteredTxns.length} টি</span>
      </div>

      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400 dark:text-gray-500 text-xs"></i>
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full border border-gray-300 dark:border-gray-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 min-w-0">
          <i className="fa-solid fa-calendar-days text-[10px] shrink-0"></i>
          <span className="truncate">{dateRangeLabel(dateRange)}</span>
        </div>
        <button
          onClick={() => { setDraft(dateRange); setDateSheetOpen(true); }}
          className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            dateRange.option === "all"
              ? "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              : "bg-emerald-600 text-white"
          }`}
        >
          <i className="fa-solid fa-sliders text-[9px] me-1"></i>তারিখ
        </button>
      </div>

      <Popup open={dateSheetOpen} title="তারিখ ফিল্টার" onClose={() => setDateSheetOpen(false)}>
        <div className="flex flex-wrap gap-1.5">
          {DATE_CHOICES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDraft((p) => ({ ...p, option: d.value }))}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${draft.option === d.value ? "bg-emerald-600 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {draft.option === "custom" && (
          <div className="grid grid-cols-1 gap-2">
            <label className="block">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">তারিখ (থেকে)</span>
              <input type="date" value={draft.from} onChange={(e) => setDraft((p) => ({ ...p, from: e.target.value }))} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">তারিখ (পর্যন্ত)</span>
              <input type="date" value={draft.to} onChange={(e) => setDraft((p) => ({ ...p, to: e.target.value }))} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
            </label>
            {/* Catching the inverted case here beats silently returning nothing:
                a from later than to would otherwise filter out every row. */}
            {draft.from && draft.to && draft.from > draft.to && (
              <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                "থেকে" তারিখ "পর্যন্ত" তারিখের পরে হতে পারে না।
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { setDateRange({ option: "all", from: "", to: "" }); setDateSheetOpen(false); }}
            className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2.5 rounded-xl text-xs"
          >
            রিসেট
          </button>
          <button
            disabled={draft.option === "custom" && draft.from && draft.to && draft.from > draft.to}
            onClick={() => { setDateRange(draft); setDateSheetOpen(false); }}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-xs"
          >
            ফিল্টার করুন
          </button>
        </div>
      </Popup>

      <div className={canViewUsers ? "grid grid-cols-2 gap-2" : ""}>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Wallet</label>
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
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">ব্যবহারকারী</label>
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
          <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1 rounded-full font-semibold whitespace-nowrap transition-all ${filterType === t ? "bg-slate-800 dark:bg-emerald-600 text-white" : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
            {t}
          </button>
        ))}
        <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
        {["All", "Cash", "Bank"].map((a) => (
          <button key={a} onClick={() => setFilterAccount(a)} className={`px-3 py-1 rounded-full font-semibold whitespace-nowrap transition-all ${filterAccount === a ? "bg-slate-800 dark:bg-emerald-600 text-white" : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
            {a}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-gray-400 dark:text-gray-500 px-1">
        {filteredTxns.length > 0 ? `Showing ${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, filteredTxns.length)} of ${filteredTxns.length}` : ""}
      </div>

      <div className="space-y-2">
        {pageItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">কোনো লেনদেন পাওয়া যায়নি</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">নতুন লেনদেন যোগ করুন অথবা ফিল্টার পরিবর্তন করুন।</div>
          </div>
        ) : (
          pageItems.map((t) => <TransactionCard key={t.ID} t={t} userMap={userMap} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} />)
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1.5 pt-2 flex-wrap">
          <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-2.5 h-8 rounded-lg text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 disabled:opacity-30">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 rounded-lg text-xs font-semibold ${page === n ? "bg-slate-800 dark:bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
              {n}
            </button>
          ))}
          <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="px-2.5 h-8 rounded-lg text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 disabled:opacity-30">
            <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      )}
    </div>
  );
}
