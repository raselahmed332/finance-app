import { useState, useRef, useEffect, useMemo } from "react";
import { api } from "../api.js";
import Chart from "chart.js/auto";
import { downloadCsv } from "../utils/csvExport.js";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import { todayStr } from "../utils/loan.js";

export default function ReportsView({ wallets, currentUser, users }) {
  const [walletId, setWalletId] = useState(wallets[0]?.WalletID || '');
  const [account, setAccount] = useState('All');
  const [period, setPeriod] = useState('monthly');
  const [periodValue, setPeriodValue] = useState(todayStr().slice(0, 7));
  // customFrom/customTo are the APPLIED range the report is fetched with;
  // customDraft is what the open popup is editing, so closing without applying
  // discards the edits the same way the Transactions date sheet does.
  const [customFrom, setCustomFrom] = useState(`${todayStr().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(todayStr());
  const [customDraft, setCustomDraft] = useState({ from: `${todayStr().slice(0, 7)}-01`, to: todayStr() });
  const [customOpen, setCustomOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // Wallets may load asynchronously after this view mounts — if the selected id
  // is blank or is no longer available, fall back to the first available wallet
  // so the report actually renders instead of silently showing nothing.
  useEffect(() => {
    if (wallets && wallets.length && !(wallets || []).some(w => String(w.WalletID) === String(walletId))) {
      setWalletId(String(wallets[0].WalletID));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  const selectedWallet = wallets.find(w => String(w.WalletID) === String(walletId));

  // Transactions store the creator's username; the statement shows the friendly
  // full name when the viewer can see the user list (same mapping the
  // Transactions view uses), falling back to the username otherwise.
  const userMap = useMemo(() => {
    const map = {};
    (users || []).forEach((u) => {
      map[u.Username] = u.FullName || u.Username;
    });
    return map;
  }, [users]);

  // Client-side account filter: the report is fetched once per wallet/period,
  // and the Account dropdown narrows it. Totals are recomputed from the filtered
  // rows in integer cents (same approach as the backend) so figures never drift.
  const filtered = useMemo(() => {
    if (!report) return null;
    const rows = (report.transactions || []).filter(t => account === 'All' || String(t.Account) === String(account));
    let incomeCents = 0, expenseCents = 0, loanInCents = 0, loanOutCents = 0;
    const categoryCents = {};
    const accountCents = { Cash: 0, Bank: 0 };
    rows.forEach((t) => {
      const amt = Math.round((Number(t.Amount) || 0) * 100);
      if (t.Type === 'Income') incomeCents += amt;
      if (t.Type === 'Expense') {
        expenseCents += amt;
        const cat = t.SourceCategory || 'Other';
        categoryCents[cat] = (categoryCents[cat] || 0) + amt;
      }
      if (t.Type === 'Loan In' || t.Type === 'Loan Repaid') loanInCents += amt;
      if (t.Type === 'Loan Out' || t.Type === 'Loan Payment') loanOutCents += amt;
      if (t.Type === 'Income' || t.Type === 'Transfer In' || t.Type === 'Loan In' || t.Type === 'Loan Repaid') {
        accountCents[t.Account] = (accountCents[t.Account] || 0) + amt;
      }
      if (t.Type === 'Expense' || t.Type === 'Transfer Out' || t.Type === 'Loan Out' || t.Type === 'Loan Payment') {
        accountCents[t.Account] = (accountCents[t.Account] || 0) - amt;
      }
    });
    const toAmount = (c) => (c || 0) / 100;
    const categoryBreakdown = {};
    Object.keys(categoryCents).forEach((cat) => { categoryBreakdown[cat] = toAmount(categoryCents[cat]); });
    return {
      rows,
      totalIncome: toAmount(incomeCents),
      totalExpense: toAmount(expenseCents),
      loanIn: toAmount(loanInCents),
      loanOut: toAmount(loanOutCents),
      netChange: toAmount(incomeCents - expenseCents),
      transactionCount: rows.length,
      categoryBreakdown,
      accountBreakdown: { Cash: toAmount(accountCents.Cash || 0), Bank: toAmount(accountCents.Bank || 0) },
    };
  }, [report, account]);

  const data = filtered || report;

  const changePeriod = (val) => {
    setPeriod(val);
    if (val === 'daily' || val === 'weekly') setPeriodValue(todayStr());
    else if (val === 'monthly') setPeriodValue(todayStr().slice(0, 7));
    else if (val === 'yearly') setPeriodValue(String(new Date().getFullYear()));
    else if (val === 'custom') {
      setCustomDraft({ from: customFrom, to: customTo });
      setCustomOpen(true);
    }
  };

  const openCustom = () => {
    setCustomDraft({ from: customFrom, to: customTo });
    setCustomOpen(true);
  };

  // Only "Apply" changes the applied range, which is what the fetch effect
  // depends on - so the report refilters exactly when the user confirms.
  const applyCustomRange = () => {
    if (!customDraft.from || !customDraft.to || customDraft.from > customDraft.to) return;
    setCustomFrom(customDraft.from);
    setCustomTo(customDraft.to);
    setCustomOpen(false);
  };

  const clearCustomRange = () => {
    setCustomOpen(false);
    setPeriod('monthly');
    setPeriodValue(todayStr().slice(0, 7));
  };

  const invalidCustomDraft = !customDraft.from || !customDraft.to || customDraft.from > customDraft.to;
  const periodLabel = period === 'custom' ? `${customFrom} থেকে ${customTo}` : `${period} ${periodValue}`;

  useEffect(() => {
    if (!walletId) return;
    if (period === 'custom' && (!customFrom || !customTo || customFrom > customTo)) { setReport(null); setLoading(false); return; }
    const value = period === 'custom' ? `${customFrom}:${customTo}` : periodValue;
    setLoading(true);
    api.getReport(currentUser.username, walletId, period, value).then((res) => {
      setReport(res.status === 'SUCCESS' ? res : null);
      setLoading(false);
    }).catch(() => { setReport(null); setLoading(false); });
  }, [walletId, period, periodValue, customFrom, customTo, currentUser.username]);

  const CHART_COLORS = ['#2563eb', '#3b82f6', '#f97316', '#eab308', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#64748b'];

  useEffect(() => {
    if (!chartRef.current || !data) {
      // Tear down any instance when there is nothing to draw (e.g. a new
      // request is loading or report was cleared) so canvas re-renders don't
      // stack stale doughnuts.
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
      return;
    }
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }
    const labels = Object.keys(data.categoryBreakdown || {});
    const categoryData = Object.values(data.categoryBreakdown || {});
    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [{
          data: categoryData.length ? categoryData : [1],
          backgroundColor: labels.length ? labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]) : ['#e2e8f0'],
          borderWidth: 2, borderColor: '#ffffff',
        }],
      },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } }, cutout: '65%' },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Reports (রিপোর্ট)</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Wallet</label>
          <Select value={walletId} onChange={setWalletId}>
            {wallets.length === 0 && <option value="">কোনো Wallet এক্সেস নেই</option>}
            {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Account</label>
          <Select value={account} onChange={setAccount}>
            <option value="All">সব Account</option>
            <option value="Cash">Cash</option>
            <option value="Bank">Bank</option>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Period</label>
        <div className="grid grid-cols-5 gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-[11px] font-bold">
          {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly'], ['custom', 'Custom']].map(([val, label]) => (
            <button key={val} onClick={() => changePeriod(val)} className={`py-1.5 rounded-lg transition-all ${period === val ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Select {period === 'daily' ? 'Date' : period === 'weekly' ? 'Any date in the week' : period === 'yearly' ? 'Year' : period === 'custom' ? 'Date Range' : 'Month'}</label>
        {period === 'custom' ? (
          <button
            onClick={openCustom}
            className="w-full flex items-center justify-between border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100"
          >
            <span className="truncate">{customFrom} থেকে {customTo}</span>
            <span className="shrink-0 ms-2 text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
              <i className="fa-solid fa-sliders"></i> পরিবর্তন
            </span>
          </button>
        ) : period === 'yearly' ? (
          <input type="number" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" />
        ) : period === 'monthly' ? (
          <input type="month" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" />
        ) : (
          <input type="date" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" />
        )}
      </div>

      {loading && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">লোড হচ্ছে...</div>}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl p-3">
              <div className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">Total Income</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">{selectedWallet?.Currency} {data.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl p-3">
              <div className="text-[10px] font-bold text-rose-800 dark:text-rose-300">Total Expense</div>
              <div className="text-sm font-bold text-rose-600 dark:text-rose-400 mt-1">{selectedWallet?.Currency} {data.totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-xl p-3">
            <div className="text-[10px] font-bold text-violet-800 dark:text-violet-300"><i className="fa-solid fa-hand-holding-dollar me-1"></i>Loan (হাওলাত)</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-violet-600 dark:text-violet-400">মোট আসা</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{selectedWallet?.Currency} {data.loanIn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[10px] text-violet-600 dark:text-violet-400">মোট যাওয়া</span>
              <span className="text-sm font-bold text-rose-600 dark:text-rose-400">{selectedWallet?.Currency} {data.loanOut.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3 text-center">
            {/* This figure is Income - Expense for the selected period, NOT a
                balance: transfers and loan movements are deliberately excluded
                from it. Labelling it "Net Balance" showed a number that
                disagreed with the per-account figure right below it. */}
            <div className="text-[11px] font-bold text-blue-800 dark:text-blue-300">Income − Expense (এই সময়ে)</div>
            <div className="text-lg font-extrabold text-blue-700 dark:text-blue-400 mt-0.5">{selectedWallet?.Currency} {data.netChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">{data.transactionCount} টি লেনদেন</div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800">
            {/* Per-account net MOVEMENT over the period (inflows minus outflows,
                including transfers and loan effects) — not the account's
                current balance, which also depends on opening balances and
                every other period. */}
            <div className="text-xs font-bold text-slate-800 dark:text-gray-100 mb-2">Net Movement by Account (এই সময়ে)</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(data.accountBreakdown || {}).map(([acc, bal]) => (
                <div key={acc} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">{acc}</div>
                  <div className={`text-xs font-bold mt-1 ${bal >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{selectedWallet?.Currency} {bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs">
            <div className="text-xs font-bold text-slate-800 dark:text-gray-100 mb-3">Expense by Category</div>
            <div className="max-w-[280px] mx-auto">
              <canvas ref={chartRef}></canvas>
            </div>
          </div>

          <div id="report-print" className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-2xs">
            <div className="hidden print:block mb-3">
              <div className="text-base font-bold text-slate-900">{selectedWallet?.WalletName} — Statement</div>
              <div className="text-[11px] text-gray-600">
                {selectedWallet?.Currency} · {periodLabel} · {account === 'All' ? 'সব Account' : account} · {todayStr()}
              </div>
            </div>
            <div className="text-xs font-bold text-slate-800 dark:text-gray-100 mb-2">Statement (লেনদেনের তালিকা)</div>
            <div className="report-scroll overflow-auto -mx-1 max-h-[85vh]">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-gray-900">
                  <tr className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    <th className="px-1 pb-1.5 font-semibold">তারিখ</th>
                    <th className="px-1 pb-1.5 font-semibold">Type</th>
                    <th className="px-1 pb-1.5 font-semibold">Account</th>
                    <th className="px-1 pb-1.5 font-semibold">খাত</th>
                    <th className="px-1 pb-1.5 font-semibold">Where/Vendor</th>
                    <th className="px-1 pb-1.5 font-semibold">বিবরণ</th>
                    <th className="px-1 pb-1.5 font-semibold">নোট</th>
                    <th className="px-1 pb-1.5 font-semibold">ইউজার</th>
                    <th className="px-1 pb-1.5 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.rows || []).map((t, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-1 py-1.5 whitespace-nowrap text-gray-500 dark:text-gray-400">{t.Date}</td>
                      <td className="px-1 py-1.5 whitespace-nowrap font-semibold text-slate-700 dark:text-gray-200">{t.Type}</td>
                      <td className="px-1 py-1.5 whitespace-nowrap text-gray-500 dark:text-gray-400">{t.Account || "—"}</td>
                      <td className="px-1 py-1.5 text-gray-500 dark:text-gray-400">{t.SourceCategory || "—"}</td>
                      <td className="px-1 py-1.5 text-gray-500 dark:text-gray-400">{t.WhereVendor || "—"}</td>
                      <td className="px-1 py-1.5 text-gray-500 dark:text-gray-400 max-w-[180px] truncate">{t.Description || "—"}</td>
                      <td className="px-1 py-1.5 text-gray-500 dark:text-gray-400 max-w-[160px] truncate">{t.Note || "—"}</td>
                      <td className="px-1 py-1.5 text-gray-500 dark:text-gray-400">{userMap[t.User] || t.User || "—"}</td>
                      <td className={`px-1 py-1.5 whitespace-nowrap text-right font-bold ${t.Type === 'Income' || t.Type === 'Transfer In' || t.Type === 'Loan In' || t.Type === 'Loan Repaid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {Number(t.Amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {(data.rows || []).length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-1 py-2 font-bold text-slate-800 dark:text-gray-100" colSpan="8">মোট লেনদেন ({data.transactionCount})</td>
                      <td className={`px-1 py-2 text-right font-bold ${data.netChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {data.netChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {(data.rows || []).length === 0 ? (
              <div className="px-1 pt-3 text-center text-gray-400 dark:text-gray-500">এই সময়ে কোনো লেনদেন নেই।</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 no-print mt-3">
                <button
                  onClick={() => downloadCsv(
                    `report_${selectedWallet?.WalletName}${account !== 'All' ? '_' + account : ''}_${period === 'custom' ? `custom_${customFrom}_to_${customTo}` : period}_${todayStr()}.csv`,
                    ['Date', 'Type', 'Currency', 'Account', 'Category', 'Vendor', 'Description', 'Amount', 'Note', 'User'],
                    (data.rows || []).map(t => [t.Date, t.Type, t.Currency, t.Account, t.SourceCategory, t.WhereVendor, t.Description, t.Amount, t.Note, userMap[t.User] || t.User]),
                  )}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl py-2 text-xs font-semibold text-slate-700 dark:text-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <i className="fa-solid fa-file-csv text-emerald-600"></i> Export CSV
                </button>
                <button onClick={() => window.print()} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl py-2 text-xs font-semibold text-slate-700 dark:text-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <i className="fa-solid fa-file-pdf text-rose-600"></i> Print / PDF
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !report && walletId && (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-xs">এই সময়ের জন্য কোনো ডেটা নেই।</div>
      )}

      <Popup
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="কাস্টম তারিখ সীমা"
        maxWidth="max-w-sm"
      >
        <div className="grid grid-cols-1 gap-2">
          <label className="block">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">থেকে</span>
            <input
              type="date"
              value={customDraft.from}
              onChange={(e) => setCustomDraft((p) => ({ ...p, from: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">পর্যন্ত</span>
            <input
              type="date"
              value={customDraft.to}
              onChange={(e) => setCustomDraft((p) => ({ ...p, to: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          {customDraft.from && customDraft.to && customDraft.from > customDraft.to && (
            <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              "থেকে" তারিখ "পর্যন্ত" তারিখের পরে হতে পারে না।
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={clearCustomRange}
            className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2.5 rounded-xl text-xs"
          >
            ক্লিয়ার
          </button>
          <button
            onClick={applyCustomRange}
            disabled={invalidCustomDraft}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-xs"
          >
            আপ্লাই করুন
          </button>
        </div>
      </Popup>
    </div>
  );
}