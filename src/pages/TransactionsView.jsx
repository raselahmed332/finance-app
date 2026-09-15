import { useState, useMemo, useEffect, useRef } from "react";
import { downloadCsv } from "../utils/csvExport.js";
import Select from "../components/Select.jsx";

const TYPE_BADGES = {
  Income: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Income" },
  Expense: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Expense" },
  "Transfer In": { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400", icon: "fa-arrow-down", label: "Transfer In" },
  "Transfer Out": { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", icon: "fa-arrow-up", label: "Transfer Out" },
  Transfer: { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-400", icon: "fa-right-left", label: "Transfer" },
  Deposit: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", icon: "fa-arrow-down", label: "Deposit" },
  Withdraw: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", icon: "fa-arrow-up", label: "Withdraw" },
};

function getBadge(t) {
  var v = (t.WhereVendor || "").toLowerCase();
  if (v.includes("deposit")) return TYPE_BADGES.Deposit;
  if (v.includes("withdraw")) return TYPE_BADGES.Withdraw;
  return TYPE_BADGES[t.Type] || TYPE_BADGES.Transfer;
}

function SwipeCard({ t, userMap, canEdit, canDelete, onEdit, onDelete }) {
  const badge = getBadge(t);
  const isIncome = t.Type === "Income" || t.Type === "Transfer In";
  const isExpense = t.Type === "Expense" || t.Type === "Transfer Out";
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
              <i className="fa-solid fa-user me-1"></i>
              {userMap[t.User] || t.User || "Unknown"} • {t.Date}
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

export default function TransactionsView({ transactions, wallets, onDelete, onEdit, canEdit, canDelete, searchTerm, setSearchTerm, filterType, setFilterType, filterWallet, setFilterWallet, filterDate, setFilterDate, filterDescription, setFilterDescription, filterUser, setFilterUser, filterAccount, setFilterAccount, canViewUsers, users }) {
  const [page, setPage] = useState(1);
  const PER_PAGE = 15;

  const userMap = useMemo(() => {
    const map = {};
    (users || []).forEach((u) => {
      map[u.Username] = u.FullName || u.Username;
    });
    return map;
  }, [users]);

  const filteredTxns = useMemo(
    () =>
      transactions
        .filter((t) => {
          const matchesSearch =
            (t.Description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.SourceCategory || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.WhereVendor || "").toLowerCase().includes(searchTerm.toLowerCase());
          const matchesType = filterType === "All" || t.Type.toLowerCase().includes(filterType.toLowerCase());
          const matchesWallet = filterWallet === "All" || t.WalletID === filterWallet;
          const matchesDate = !filterDate || t.Date === filterDate;
          const matchesDescription = !filterDescription || (t.Description || "").toLowerCase().includes(filterDescription.toLowerCase());
          const matchesUser = !canViewUsers || filterUser === "All" || t.User === filterUser;
          const matchesAccount = filterAccount === "All" || (t.Account || "").toLowerCase() === filterAccount.toLowerCase();
          return matchesSearch && matchesType && matchesWallet && matchesDate && matchesDescription && matchesUser && matchesAccount;
        })
        .sort((a, b) => new Date(b.Date) - new Date(a.Date)),
    [transactions, searchTerm, filterType, filterWallet, filterDate, filterDescription, filterUser, filterAccount, canViewUsers]
  );

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterType, filterWallet, filterDate, filterDescription, filterUser, filterAccount]);

  const totalPages = Math.max(1, Math.ceil(filteredTxns.length / PER_PAGE));
  const pageItems = filteredTxns.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleExportCsv = () => {
    downloadCsv(
      `transactions_${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Type", "Wallet", "Currency", "Account", "Category", "Vendor", "Description", "Amount", "Note", "User"],
      filteredTxns.map((t) => [t.Date, t.Type, t.WalletName || t.WalletID, t.Currency, t.Account, t.SourceCategory, t.WhereVendor, t.Description, t.Amount, t.Note, t.User])
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Transactions (হিসাবের তালিকা)</h3>
        <div className="flex items-center gap-1.5">
          <span className="text-xs bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full font-semibold">{filteredTxns.length} টি</span>
          <button onClick={handleExportCsv} title="Export CSV" className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 hover:bg-emerald-200">
            <i className="fa-solid fa-file-csv"></i> CSV
          </button>
        </div>
      </div>

      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400 dark:text-gray-500 text-xs"></i>
        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full border border-gray-300 dark:border-gray-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" title="তারিখ" />
        <input type="text" value={filterDescription} onChange={(e) => setFilterDescription(e.target.value)} placeholder="Description" className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
      </div>

      <Select value={filterWallet} onChange={setFilterWallet}>
        <option value="All">সব Wallet</option>
        {wallets.map((w) => (
          <option key={w.WalletID} value={w.WalletID}>
            {w.WalletName} ({w.Currency})
          </option>
        ))}
      </Select>

      {canViewUsers && (
        <Select value={filterUser} onChange={setFilterUser}>
          <option value="All">সব ব্যবহারকারী</option>
          {[...new Set(transactions.map((t) => t.User).filter(Boolean))].map((user) => (
            <option key={user} value={user}>
              {user}
            </option>
          ))}
        </Select>
      )}

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

      {canEdit || canDelete ? (
        <div className="text-[10px] text-gray-400 dark:text-gray-500 px-1 flex items-center gap-1">
          <i className="fa-solid fa-hand-pointer"></i> Swipe right to edit, left to delete
        </div>
      ) : null}

      <div className="space-y-2">
        {pageItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">কোনো লেনদেন পাওয়া যায়নি</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">নতুন লেনদেন যোগ করুন অথবা ফিল্টার পরিবর্তন করুন।</div>
          </div>
        ) : (
          pageItems.map((t) => <SwipeCard key={t.ID} t={t} userMap={userMap} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} />)
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
