import { useState, useRef, useEffect } from "react";

// NOTE: Chart is loaded globally via the <script> tag in index.html
// (same as your original Chart.js CDN setup), so no import is needed here.
/* global Chart */

export default function ReportsView({ transactions }) {
  const [currency, setCurrency] = useState('SAR');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const filtered = transactions.filter(t => t.Currency === currency && (t.Date || '').startsWith(month));

  const totalInc = filtered.filter(t => t.Type === 'Income').reduce((a, b) => a + parseFloat(b.Amount || 0), 0);
  const totalExp = filtered.filter(t => t.Type === 'Expense').reduce((a, b) => a + parseFloat(b.Amount || 0), 0);
  const net = totalInc - totalExp;
  const accountTotals = ['Cash', 'Bank'].map(account => ({
    account,
    balance: filtered.filter(t => t.Account === account).reduce((sum, t) => {
      const amount = parseFloat(t.Amount || 0);
      return sum + ((t.Type === 'Income' || t.Type === 'Transfer In') ? amount : -amount);
    }, 0)
  }));

  // Group expense by category dynamically
  const expCategories = {};
  filtered.filter(t => t.Type === 'Expense').forEach(t => {
    const cat = t.SourceCategory || 'Other';
    expCategories[cat] = (expCategories[cat] || 0) + parseFloat(t.Amount || 0);
  });

  const chartLabels = Object.keys(expCategories);
  const chartData = Object.values(expCategories);

  useEffect(() => {
    if (chartRef.current) {
      if (chartInstance.current) chartInstance.current.destroy();

      const ctx = chartRef.current.getContext('2d');
      chartInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: chartLabels.length ? chartLabels : ['No Data'],
          datasets: [{
            data: chartData.length ? chartData : [1],
            backgroundColor: chartLabels.length ? ['#2563eb', '#3b82f6', '#f97316', '#eab308', '#94a3b8', '#10b981'] : ['#e2e8f0'],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'right', labels: { font: { size: 10 } } }
          },
          cutout: '65%'
        }
      });
    }
  }, [currency, month, transactions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-base">Reports (রিপোর্ট)</h3>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Select Currency</label>
        <div className="grid grid-cols-2 gap-2 bg-gray-200 p-1 rounded-xl text-xs font-bold">
          <button onClick={() => setCurrency('SAR')} className={`py-1.5 rounded-lg transition-all ${currency === 'SAR' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600'}`}>
            🇸🇦 SAR
          </button>
          <button onClick={() => setCurrency('BDT')} className={`py-1.5 rounded-lg transition-all ${currency === 'BDT' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600'}`}>
            🇧🇩 BDT
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Select Period</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold bg-white" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
          <div className="text-[10px] font-bold text-emerald-800">Total Income</div>
          <div className="text-sm font-bold text-emerald-600 mt-1">{currency} {totalInc.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
          <div className="text-[10px] font-bold text-rose-800">Total Expense</div>
          <div className="text-sm font-bold text-rose-600 mt-1">{currency} {totalExp.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
        <div className="text-[11px] font-bold text-blue-800">Net Balance (অবশিষ্ট)</div>
        <div className="text-lg font-extrabold text-blue-700 mt-0.5">{currency} {net.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
      </div>

      <div className="bg-white rounded-xl p-3 border border-gray-200">
        <div className="text-xs font-bold text-slate-800 mb-2">Monthly Balance by Account</div>
        <div className="grid grid-cols-3 gap-2">{accountTotals.map(item => <div key={item.account} className="bg-slate-50 rounded-lg p-2 text-center"><div className="text-[10px] text-gray-500">{item.account}</div><div className={`text-xs font-bold mt-1 ${item.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{currency} {item.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div></div>)}</div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs">
        <div className="text-xs font-bold text-slate-800 mb-3">Expense by Category ({currency})</div>
        <div className="max-w-[280px] mx-auto">
          <canvas ref={chartRef}></canvas>
        </div>
      </div>
    </div>
  );
}
