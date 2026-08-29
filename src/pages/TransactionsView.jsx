export default function TransactionsView({
  transactions,
  onDelete,
  onEdit,
  canEdit,
  canDelete,
  searchTerm,
  setSearchTerm,
  filterType,
  setFilterType,
  filterCurrency,
  setFilterCurrency,
  filterDate,
  setFilterDate,
  filterDescription,
  setFilterDescription,
  filterUser,
  setFilterUser,
  isAdmin,
}) {
  const filteredTxns = transactions.filter((t) => {
    const matchesSearch =
      (t.Description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.SourceCategory || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (t.WhereVendor || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType =
      filterType === "All" ||
      t.Type.toLowerCase().includes(filterType.toLowerCase());
    const matchesCurr =
      filterCurrency === "All" || t.Currency === filterCurrency;
    const matchesDate = !filterDate || t.Date === filterDate;
    const matchesDescription =
      !filterDescription ||
      (t.Description || "")
        .toLowerCase()
        .includes(filterDescription.toLowerCase());
    const matchesUser =
      !isAdmin || filterUser === "All" || t.User === filterUser;
    return (
      matchesSearch &&
      matchesType &&
      matchesCurr &&
      matchesDate &&
      matchesDescription &&
      matchesUser
    );
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-base">
          Transactions (হিসাবের তালিকা)
        </h3>
        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">
          {filteredTxns.length} টি
        </span>
      </div>

      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400 text-xs"></i>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..."
          className="w-full border border-gray-300 rounded-xl pl-8 pr-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 bg-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white"
          title="তারিখ"
        />
        <input
          type="text"
          value={filterDescription}
          onChange={(e) => setFilterDescription(e.target.value)}
          placeholder="Description"
          className="border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white"
        />
      </div>

      {isAdmin && (
        <select
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs bg-white"
        >
          <option value="All">সব ব্যবহারকারী</option>
          {[...new Set(transactions.map((t) => t.User).filter(Boolean))].map(
            (user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ),
          )}
        </select>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        {["All", "Income", "Expense", "Transfer"].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-full font-semibold whitespace-nowrap transition-all ${filterType === t ? "bg-slate-800 text-white" : "bg-gray-200 text-gray-600"}`}
          >
            {t}
          </button>
        ))}
        <div className="border-r border-gray-300 mx-1"></div>
        {(isAdmin ? ["All", "SAR", "BDT"] : ["All", "BDT"]).map((c) => (
          <button
            key={c}
            onClick={() => setFilterCurrency(c)}
            className={`px-2.5 py-1 rounded-full font-semibold whitespace-nowrap transition-all ${filterCurrency === c ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-600"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredTxns.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-xs">
            কোনো লেনদেন পাওয়া যায়নি।
          </div>
        ) : (
          filteredTxns.map((t) => {
            const isIncome = t.Type === "Income" || t.Type === "Transfer In";
            const isExpense = t.Type === "Expense" || t.Type === "Transfer Out";

            return (
              <div
                key={t.ID}
                className="bg-white rounded-xl p-3 border border-gray-200 flex items-center justify-between shadow-2xs hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm ${
                      isIncome
                        ? "bg-emerald-100 text-emerald-600"
                        : isExpense
                          ? "bg-rose-100 text-rose-600"
                          : "bg-purple-100 text-purple-600"
                    }`}
                  >
                    <i
                      className={`fa-solid ${
                        isIncome
                          ? "fa-arrow-down-left"
                          : isExpense
                            ? "fa-arrow-up-right"
                            : "fa-right-left"
                      }`}
                    ></i>
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      {t.SourceCategory || t.Description || "Transaction"}
                      <span className="text-[10px] text-gray-400 font-normal">
                        ({t.Account} - {t.Currency})
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {t.Description ? t.Description + " • " : ""}
                      {t.WhereVendor ? t.WhereVendor : ""}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      <i className="fa-solid fa-user me-1"></i>
                      {t.User || "Unknown"} • {t.Date}
                    </div>
                  </div>
                </div>

                <div className="text-right flex items-center gap-2">
                  <div>
                    <div
                      className={`font-bold text-xs ${
                        isIncome
                          ? "text-emerald-600"
                          : isExpense
                            ? "text-rose-600"
                            : "text-purple-600"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {parseFloat(t.Amount).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                    <div className="text-[10px] font-bold text-gray-400">
                      {t.Currency}
                    </div>
                  </div>

                  {canEdit && (t.Type === "Income" || t.Type === "Expense") ? (
                    <button
                      onClick={() => onEdit(t)}
                      className="text-gray-300 hover:text-blue-500 text-xs p-1"
                      title="Edit"
                    >
                      <i className="fa-solid fa-pen"></i>
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      onClick={() => onDelete(t.ID)}
                      className="text-gray-300 hover:text-red-500 text-xs p-1"
                      title="Delete"
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
