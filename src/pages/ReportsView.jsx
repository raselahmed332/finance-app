import { useState, useRef, useEffect } from "react";
import { api } from "../api.js";
import Chart from "chart.js/auto";
import { downloadCsv } from "../utils/csvExport.js";
import Select from "../components/Select.jsx";
import { todayStr } from "../utils/loan.js";

export default function ReportsView({ wallets, currentUser }) {
  const [walletId, setWalletId] = useState(wallets[0]?.WalletID || '');
  const [period, setPeriod] = useState('monthly');
  const [periodValue, setPeriodValue] = useState(todayStr().slice(0, 7));
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

  const changePeriod = (val) => {
    setPeriod(val);
    if (val === 'daily' || val === 'weekly') setPeriodValue(todayStr());
    else if (val === 'monthly') setPeriodValue(todayStr().slice(0, 7));
    else if (val === 'yearly') setPeriodValue(String(new Date().getFullYear()));
  };

  useEffect(() => {
    if (!walletId) return;
    setLoading(true);
    api.getReport(currentUser.username, walletId, period, periodValue).then((res) => {
      setReport(res.status === 'SUCCESS' ? res : null);
      setLoading(false);
    }).catch(() => { setReport(null); setLoading(false); });
  }, [walletId, period, periodValue, currentUser.username]);

  const CHART_COLORS = ['#2563eb', '#3b82f6', '#f97316', '#eab308', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#64748b'];

  useEffect(() => {
    if (!chartRef.current || !report) {
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
    const labels = Object.keys(report.categoryBreakdown || {});
    const data = Object.values(report.categoryBreakdown || {});
    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [{
          data: data.length ? data : [1],
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
  }, [report]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Reports (রিপোর্ট)</h3>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Wallet</label>
        <Select value={walletId} onChange={setWalletId}>
          {wallets.length === 0 && <option value="">কোনো Wallet এক্সেস নেই</option>}
          {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
        </Select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Period</label>
        <div className="grid grid-cols-4 gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-bold">
          {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([val, label]) => (
            <button key={val} onClick={() => changePeriod(val)} className={`py-1.5 rounded-lg transition-all ${period === val ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Select {period === 'daily' ? 'Date' : period === 'weekly' ? 'Any date in the week' : period === 'yearly' ? 'Year' : 'Month'}</label>
        {period === 'yearly' ? (
          <input type="number" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" />
        ) : period === 'monthly' ? (
          <input type="month" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" />
        ) : (
          <input type="date" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" />
        )}
      </div>

      {loading && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">লোড হচ্ছে...</div>}

      {!loading && report && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => downloadCsv(
                `report_${selectedWallet?.WalletName}_${period}_${todayStr()}.csv`,
                ['Date', 'Type', 'Currency', 'Account', 'Category', 'Vendor', 'Description', 'Amount', 'Note', 'User'],
                (report.transactions || []).map(t => [t.Date, t.Type, t.Currency, t.Account, t.SourceCategory, t.WhereVendor, t.Description, t.Amount, t.Note, t.User]),
              )}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl py-2 text-xs font-semibold text-slate-700 dark:text-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <i className="fa-solid fa-file-csv text-emerald-600"></i> Export CSV
            </button>
            <button onClick={() => window.print()} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl py-2 text-xs font-semibold text-slate-700 dark:text-gray-200 flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
              <i className="fa-solid fa-file-pdf text-rose-600"></i> Print / PDF
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl p-3">
              <div className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">Total Income</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">{selectedWallet?.Currency} {report.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl p-3">
              <div className="text-[10px] font-bold text-rose-800 dark:text-rose-300">Total Expense</div>
              <div className="text-sm font-bold text-rose-600 dark:text-rose-400 mt-1">{selectedWallet?.Currency} {report.totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3 text-center">
            <div className="text-[11px] font-bold text-blue-800 dark:text-blue-300">Net Balance (অবশিষ্ট)</div>
            <div className="text-lg font-extrabold text-blue-700 dark:text-blue-400 mt-0.5">{selectedWallet?.Currency} {report.netChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">{report.transactionCount} টি লেনদেন</div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800">
            <div className="text-xs font-bold text-slate-800 dark:text-gray-100 mb-2">Balance by Account</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(report.accountBreakdown || {}).map(([acc, bal]) => (
                <div key={acc} className="bg-slate-50 dark:bg-gray-950 rounded-lg p-2 text-center">
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
        </>
      )}

      {!loading && !report && walletId && (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-xs">এই সময়ের জন্য কোনো ডেটা নেই।</div>
      )}
    </div>
  );
}
