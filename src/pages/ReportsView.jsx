import { useState, useRef, useEffect, useMemo } from "react";
import { api } from "../api.js";
import Chart from "chart.js/auto";
import { downloadCsv } from "../utils/csvExport.js";
import { downloadBlob, shareBlob, isNative } from "../utils/files.js";
import Select from "../components/Select.jsx";
import Popup from "../components/Popup.jsx";
import { todayStr } from "../utils/loan.js";
import { accountName } from "../utils/accounts.js";
import { EmptyState, LoadingState, PageHeader, Segmented, Stat } from "../ui/index.jsx";

// Add the captured statement to the PDF one page at a time. The same page
// images preview it in native WebViews, which do not reliably render PDF blobs
// in an iframe. Processing serially avoids retaining all page canvases at once.
async function addCanvasPagesToPdf(pdf, canvas, orientation, makePreview) {
  const isLandscape = orientation === 'landscape';
  const pageW = isLandscape ? 297 : 210;
  const pageH = isLandscape ? 210 : 297;
  const margin = 10;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const fullImgH = canvas.height * (usableW / canvas.width);
  const previewBlobs = [];
  let pageIndex = 0;

  const addPage = async (page) => {
    if (pageIndex) pdf.addPage();
    pdf.addImage(page, 'PNG', margin, margin, usableW, page.height * (usableW / page.width));
    if (makePreview) previewBlobs.push(await canvasToBlob(page));
    pageIndex += 1;
  };

  // Everything fits on one page — no slicing needed.
  if (fullImgH <= usableH) {
    await addPage(canvas);
    return previewBlobs;
  }

  // Pixel height of one page's worth of the capture.
  const slicePx = Math.max(1, Math.floor(canvas.width * (usableH / usableW)));
  let y = 0;
  while (y < canvas.height) {
    const h = Math.min(slicePx, canvas.height - y);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = h;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    await addPage(slice);
    y += h;
  }
  return previewBlobs;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create report preview image'));
    }, 'image/png');
  });
}

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
  const [pdfBusy, setPdfBusy] = useState(false);
  // The generated statement PDF, kept so Preview / Download / Share all reuse
  // one build instead of regenerating. { url, blob, filename }.
  const [pdfPreview, setPdfPreview] = useState(null);
  const pdfUrlRef = useRef(null);
  const previewUrlsRef = useRef([]);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // Release the object URL when this view unmounts.
  useEffect(() => () => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Wallets may load asynchronously after this view mounts — if the selected id
  // is blank or is no longer available, fall back to the first available wallet
  // so the report actually renders instead of silently showing nothing.
  useEffect(() => {
    if (wallets && wallets.length && !(wallets || []).some(w => String(w.WalletID) === String(walletId))) {
      setWalletId(String(wallets[0].WalletID));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  // A wallet switch invalidates any account selection, since account ids only
  // exist inside their own wallet.
  useEffect(() => { setAccount('All'); }, [walletId]);

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

  // Rasterise ONLY the statement card (#report-print) and build an A4 multi-page
  // PDF blob. We capture the rendered DOM instead of building the PDF from text
  // because the statement contains Bengali, which needs the browser's text
  // shaping. The heavy libs are imported lazily so they stay out of the main
  // bundle. Returns { blob, filename } or null.
  const buildStatementPdf = async () => {
    const el = document.getElementById('report-print');
    if (!el) return null;

    // html2canvas measures the element's LIVE size, so a scroll-capped box would
    // clip the export to the visible rows ("full table" missing). Temporarily
    // expand the real DOM — reveal header, drop the scroll cap, drop buttons,
    // flatten the sticky thead — and remember the originals to restore them.
    const scrollState = [];
    const rememberScroll = (node) => {
      if (!node) return;
      if (node.scrollTop || node.scrollLeft) {
        scrollState.push([node, node.scrollTop, node.scrollLeft]);
      }
    };
    let ancestor = el.parentElement;
    while (ancestor) {
      rememberScroll(ancestor);
      ancestor = ancestor.parentElement;
    }
    [el, ...el.querySelectorAll('*')].forEach(rememberScroll);
    const windowScroll = { x: window.scrollX, y: window.scrollY };
    const restore = [];
    const patch = (node, style) => {
      restore.push([node, node.getAttribute('style')]);
      Object.assign(node.style, style);
    };
    const scroller = el.querySelector('.report-scroll');
    const table = el.querySelector('table');
    const header = document.getElementById('report-pdf-header');
    const theads = Array.from(el.querySelectorAll('thead'));
    const noPrints = Array.from(el.querySelectorAll('.no-print'));
    try {
      // Widen the card so the table's right-hand columns (ইউজার / Amount) — which
      // overflow horizontally on screen — are NOT clipped out of the capture.
      patch(el, { width: 'max-content', maxWidth: 'none' });
      if (scroller) patch(scroller, { maxHeight: 'none', overflow: 'visible', margin: '0', width: 'max-content' });
      if (table) patch(table, { width: 'max-content', minWidth: '0' });
      if (header) patch(header, { display: 'block' });
      theads.forEach((t) => patch(t, { position: 'static' }));
      noPrints.forEach((n) => patch(n, { display: 'none' }));
      void el.offsetHeight; // force a synchronous reflow before measuring

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);

      const captureW = Math.ceil(el.offsetWidth);
      const captureH = Math.ceil(el.offsetHeight);

      // Cap the canvas area so long statements don't blow past mobile GPU/canvas
      // limits (iOS ~16M px), which would otherwise yield a blank/partial PDF.
      const MAX_AREA = 16000000;
      const scale = Math.max(1, Math.min(2, Math.sqrt(MAX_AREA / Math.max(1, captureW * captureH))));

      const canvas = await html2canvas(el, {
        scale,
        width: captureW,
        height: captureH,
        windowWidth: Math.max(window.innerWidth, captureW + 40),
        windowHeight: Math.max(window.innerHeight, captureH + 40),
        backgroundColor: '#ffffff',
        useCORS: true,
        ignoreElements: (n) => n.classList && n.classList.contains('no-print'),
        onclone: (doc) => { doc.documentElement.classList.remove('dark'); },
      });

      // A4 pages (mm) so every row survives: long statements paginate instead of
      // being squashed onto one unreadable sheet.
      const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
      const previewBlobs = await addCanvasPagesToPdf(pdf, canvas, orientation, isNative());

      const filename = `report_${selectedWallet?.WalletName || ''}${account !== 'All' ? '_' + account : ''}_${period === 'custom' ? `custom_${customFrom}_to_${customTo}` : period}_${todayStr()}.pdf`;
      return { blob: pdf.output('blob'), filename, previewBlobs };
    } finally {
      restore.reverse().forEach(([node, prev]) => {
        if (prev === null) node.removeAttribute('style');
        else node.setAttribute('style', prev);
      });
      const restoreScroll = () => {
        window.scrollTo(windowScroll.x, windowScroll.y);
        scrollState.forEach(([node, top, left]) => {
          node.scrollTop = top;
          node.scrollLeft = left;
        });
      };
      restoreScroll();
      // Run once more after layout settles so scroll anchoring cannot move the
      // page while the PDF preview opens.
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restoreScroll);
    }
  };

  const closePdfPreview = () => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setPdfPreview(null);
  };

  // Build the PDF and open it in an in-app preview (with Download / Share).
  const openPdfPreview = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      // Let the spinner render before the synchronous DOM capture starts.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = await buildStatementPdf();
      if (!result) return;
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      const url = URL.createObjectURL(result.blob);
      const previewUrls = result.previewBlobs.map((blob) => URL.createObjectURL(blob));
      pdfUrlRef.current = url;
      previewUrlsRef.current = previewUrls;
      setPdfPreview({ url, blob: result.blob, filename: result.filename, previewUrls });
    } catch (e) {
      console.error('PDF export failed', e);
      alert('PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (!pdfPreview) return;
    try {
      await downloadBlob(pdfPreview.filename, pdfPreview.blob);
    } catch (error) {
      if (error?.code === 'SAVE_CANCELLED') return;
      console.error('PDF download failed', error);
      alert('PDF ডাউনলোড করা যায়নি। আবার চেষ্টা করুন।');
    }
  };

  // Native share sheet on the Android/iOS shell, Web Share API on supported
  // browsers, and an ordinary download everywhere else.
  const sharePdf = async () => {
    if (!pdfPreview) return;
    await shareBlob(pdfPreview.filename, pdfPreview.blob, pdfPreview.filename);
  };

  // Accounts available to filter by: the wallet's registered accounts (from the
  // backend report) unioned with any account id that actually appears on a row
  // (covers a since-deactivated account that still has history).
  const reportAccounts = useMemo(() => {
    const map = {};
    const add = (id, name) => {
      const key = String(id == null ? "" : id);
      if (!key) return;
      if (!map[key]) map[key] = { id: key, name: name ? String(name) : key };
    };
    (report?.accounts || []).forEach(a => add(a.accountId ?? a.AccountID, a.name ?? a.Name));
    (report?.transactions || []).forEach(t => add(t.Account, accountName(walletId, t.Account)));
    return Object.values(map);
  }, [report]);

  // Client-side account filter: the report is fetched once per wallet/period,
  // and the Account dropdown narrows it. Totals are recomputed from the filtered
  // rows in integer cents (same approach as the backend) so figures never drift.
  const filtered = useMemo(() => {
    if (!report) return null;
    const rows = (report.transactions || []).filter(t => account === 'All' || String(t.Account) === String(account));
    let incomeCents = 0, expenseCents = 0, loanInCents = 0, loanOutCents = 0;
    const categoryCents = {};
    const accountCents = {};
    reportAccounts.forEach(a => { accountCents[a.id] = 0; });
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
      if (t.Type === 'Income' || t.Type === 'Transfer In' || t.Type === 'Loan In' || t.Type === 'Loan Repaid' || t.Type === 'Savings Withdrawal' || t.Type === 'Savings Payout') {
        accountCents[t.Account] = (accountCents[t.Account] || 0) + amt;
      }
      if (t.Type === 'Expense' || t.Type === 'Transfer Out' || t.Type === 'Loan Out' || t.Type === 'Loan Payment' || t.Type === 'Savings Deposit' || t.Type === 'Savings Contribution' || t.Type === 'Savings Payment') {
        accountCents[t.Account] = (accountCents[t.Account] || 0) - amt;
      }
    });
    const toAmount = (c) => (c || 0) / 100;
    const categoryBreakdown = {};
    Object.keys(categoryCents).forEach((cat) => { categoryBreakdown[cat] = toAmount(categoryCents[cat]); });
    const nameById = {};
    reportAccounts.forEach(a => { nameById[a.id] = a.name; });
    const accountBreakdown = {};
    Object.keys(accountCents).forEach((id) => { accountBreakdown[nameById[id] || id] = toAmount(accountCents[id]); });
    return {
      rows,
      totalIncome: toAmount(incomeCents),
      totalExpense: toAmount(expenseCents),
      loanIn: toAmount(loanInCents),
      loanOut: toAmount(loanOutCents),
      netChange: toAmount(incomeCents - expenseCents),
      transactionCount: rows.length,
      categoryBreakdown,
      accountBreakdown,
    };
  }, [report, account, reportAccounts]);

  const data = filtered || report;
  const accountLabel = account === 'All' ? 'সব Account' : (reportAccounts.find(a => a.id === String(account))?.name || account);
  const accountLabelOf = (id) => {
    if (id === undefined || id === null || id === '') return '—';
    const a = reportAccounts.find(x => x.id === String(id));
    return a ? a.name : String(id);
  };

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
      <PageHeader title="Reports" subtitle="রিপোর্ট ও স্টেটমেন্ট" icon="fa-chart-pie" />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Wallet</label>
          <Select value={walletId} onChange={setWalletId}>
            {wallets.length === 0 && <option value="">কোনো Wallet এক্সেস নেই</option>}
            {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
          </Select>
        </div>
        <div>
          <label className="label">Account</label>
          <Select value={account} onChange={setAccount}>
            <option value="All">সব Account</option>
            {reportAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
      </div>

      <div>
        <label className="label">Period</label>
        <Segmented
          className="w-full"
          value={period}
          onChange={changePeriod}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </div>

      <div>
        <label className="label">Select {period === 'daily' ? 'Date' : period === 'weekly' ? 'Any date in the week' : period === 'yearly' ? 'Year' : period === 'custom' ? 'Date Range' : 'Month'}</label>
        {period === 'custom' ? (
          <button
            onClick={openCustom}
            className="select-trigger font-semibold"
          >
            <span className="truncate">{customFrom} থেকে {customTo}</span>
            <span className="shrink-0 text-ink-3 flex items-center gap-1.5">
              <i className="fa-solid fa-sliders" /> পরিবর্তন
            </span>
          </button>
        ) : period === 'yearly' ? (
          <input type="number" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="input font-semibold" />
        ) : period === 'monthly' ? (
          <input type="month" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="input font-semibold" />
        ) : (
          <input type="date" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className="input font-semibold" />
        )}
      </div>

      {loading && <div className="card"><LoadingState label="রিপোর্ট লোড হচ্ছে..." /></div>}

      {!loading && data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Total Income"
              icon="fa-arrow-down"
              tone="success"
              value={`${selectedWallet?.Currency} ${data.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <Stat
              label="Total Expense"
              icon="fa-arrow-up"
              tone="danger"
              value={`${selectedWallet?.Currency} ${data.totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
          </div>

          <div className="card-info p-3">
            <div className="text-[10px] font-bold text-info">
              <i className="fa-solid fa-hand-holding-dollar me-1" />Loan (হাওলাত)
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-ink-2">মোট আসা</span>
              <span className="text-sm font-bold tnum" style={{ color: "var(--ah-success)" }}>
                {selectedWallet?.Currency} {data.loanIn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[10px] text-ink-2">মোট যাওয়া</span>
              <span className="text-sm font-bold tnum" style={{ color: "var(--ah-danger)" }}>
                {selectedWallet?.Currency} {data.loanOut.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="card-info p-3 text-center">
            {/* This figure is Income - Expense for the selected period, NOT a
                balance: transfers and loan movements are deliberately excluded
                from it. Labelling it "Net Balance" showed a number that
                disagreed with the per-account figure right below it. */}
            <div className="text-[11px] font-bold text-info">Income − Expense (এই সময়ে)</div>
            <div className="text-lg font-extrabold tnum mt-0.5" style={{ color: "var(--ah-info)" }}>
              {selectedWallet?.Currency} {data.netChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-ink-2 mt-1">{data.transactionCount} টি লেনদেন</div>
          </div>

          <div className="card p-3">
            {/* Per-account net MOVEMENT over the period (inflows minus outflows,
                including transfers and loan effects) — not the account's
                current balance, which also depends on opening balances and
                every other period. */}
            <div className="text-xs font-bold text-ink mb-2">Net Movement by Account (এই সময়ে)</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(data.accountBreakdown || {}).map(([acc, bal]) => (
                <div key={acc} className="card-inset p-2 text-center">
                  <div className="text-[10px] text-ink-3">{acc}</div>
                  <div
                    className="text-xs font-bold mt-1 tnum"
                    style={{ color: bal >= 0 ? "var(--ah-success)" : "var(--ah-danger)" }}
                  >
                    {selectedWallet?.Currency} {bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs font-bold text-ink mb-3">Expense by Category</div>
            <div className="max-w-[280px] mx-auto">
              <canvas ref={chartRef}></canvas>
            </div>
          </div>

          <div id="report-print" className="card p-4">
            <div id="report-pdf-header" className="hidden print:block mb-3">
              <div className="text-base font-bold text-ink">{selectedWallet?.WalletName} — Statement</div>
              <div className="text-[11px] text-ink-2">
                {selectedWallet?.Currency} · {periodLabel} · {accountLabel} · {todayStr()}
              </div>
            </div>
            <div className="text-xs font-bold text-ink mb-2">Statement (লেনদেনের তালিকা)</div>
            <div className="report-scroll overflow-auto -mx-1 max-h-[85vh]">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 z-10 bg-[var(--ah-surface)]">
                  <tr className="text-[9px] uppercase tracking-wide text-ink-3">
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
                    <tr key={i} className="border-t border-[var(--ah-border)]">
                      <td className="px-1 py-1.5 whitespace-nowrap text-ink-3">{t.Date}</td>
                      <td className="px-1 py-1.5 whitespace-nowrap font-semibold text-ink">{t.Type}</td>
                      <td className="px-1 py-1.5 whitespace-nowrap text-ink-3">{accountLabelOf(t.Account)}</td>
                      <td className="px-1 py-1.5 text-ink-3">{t.SourceCategory || "—"}</td>
                      <td className="px-1 py-1.5 text-ink-3">{t.WhereVendor || "—"}</td>
                      <td className="px-1 py-1.5 text-ink-3 max-w-[180px] truncate">{t.Description || "—"}</td>
                      <td className="px-1 py-1.5 text-ink-3 max-w-[160px] truncate">{t.Note || "—"}</td>
                      <td className="px-1 py-1.5 text-ink-3">{userMap[t.User] || t.User || "—"}</td>
                      <td className={`px-1 py-1.5 whitespace-nowrap text-right font-bold ${t.Type === 'Income' || t.Type === 'Transfer In' || t.Type === 'Loan In' || t.Type === 'Loan Repaid' || t.Type === 'Savings Withdrawal' || t.Type === 'Savings Payout' ? 'text-[var(--ah-success)]' : 'text-[var(--ah-danger)]'}`}>
                        {Number(t.Amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {(data.rows || []).length > 0 && (
                  <tfoot>
                    <tr className="border-t border-[var(--ah-border)]">
                      <td className="px-1 py-2 font-bold text-ink" colSpan="8">মোট লেনদেন ({data.transactionCount})</td>
                      <td className={`px-1 py-2 text-right font-bold ${data.netChange >= 0 ? 'text-[var(--ah-success)]' : 'text-[var(--ah-danger)]'}`}>
                        {data.netChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {(data.rows || []).length === 0 ? (
              <div className="px-1 pt-3 text-center text-ink-3">এই সময়ে কোনো লেনদেন নেই।</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 no-print mt-3">
                <button
                  onClick={() => downloadCsv(
                    `report_${selectedWallet?.WalletName}${account !== 'All' ? '_' + account : ''}_${period === 'custom' ? `custom_${customFrom}_to_${customTo}` : period}_${todayStr()}.csv`,
                    ['Date', 'Type', 'Currency', 'Account', 'Category', 'Vendor', 'Description', 'Amount', 'Note', 'User'],
                    (data.rows || []).map(t => [t.Date, t.Type, t.Currency, accountLabelOf(t.Account), t.SourceCategory, t.WhereVendor, t.Description, t.Amount, t.Note, userMap[t.User] || t.User]),
                  )}
                  className="btn btn-secondary"
                >
                  <i className="fa-solid fa-file-csv" style={{ color: "var(--ah-success)" }} /> Export CSV
                </button>
                <button
                  onClick={openPdfPreview}
                  disabled={pdfBusy}
                  className="btn btn-secondary"
                >
                  <i
                    className={`fa-solid ${pdfBusy ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}
                    style={{ color: "var(--ah-danger)" }}
                  />
                  {pdfBusy ? 'তৈরি হচ্ছে...' : 'PDF'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !report && walletId && (
        <div className="card">
          <EmptyState
            icon="fa-chart-pie"
            title="এই সময়ের জন্য কোনো ডেটা নেই"
            text="অন্য সময় বা অন্য Wallet বেছে নিন।"
          />
        </div>
      )}

      <Popup
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="কাস্টম তারিখ সীমা"
        maxWidth="max-w-sm"
      >
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label className="label">থেকে</label>
            <input
              type="date"
              value={customDraft.from}
              onChange={(e) => setCustomDraft((p) => ({ ...p, from: e.target.value }))}
              className="input font-semibold"
            />
          </div>
          <div>
            <label className="label">পর্যন্ত</label>
            <input
              type="date"
              value={customDraft.to}
              onChange={(e) => setCustomDraft((p) => ({ ...p, to: e.target.value }))}
              className="input font-semibold"
            />
          </div>
          {customDraft.from && customDraft.to && customDraft.from > customDraft.to && (
            <div className="err">
              <i className="fa-solid fa-circle-exclamation" />
              "থেকে" তারিখ "পর্যন্ত" তারিখের পরে হতে পারে না।
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={clearCustomRange} className="btn btn-secondary">
            ক্লিয়ার
          </button>
          <button onClick={applyCustomRange} disabled={invalidCustomDraft} className="btn btn-primary">
            আপ্লাই করুন
          </button>
        </div>
      </Popup>

      <Popup
        open={!!pdfPreview}
        onClose={closePdfPreview}
        title="PDF প্রিভিউ"
        maxWidth="max-w-lg"
      >
        {pdfPreview && (
          <>
            {isNative() ? (
              <div className="w-full max-h-[55vh] overflow-y-auto rounded-xl border border-[var(--ah-border)] bg-[var(--ah-surface-3)]">
                {pdfPreview.previewUrls.map((url, index) => (
                  <div key={url} className="bg-white">
                    {index > 0 && <p className="px-3 py-1 text-center text-[10px] text-ink-3">Page {index + 1}</p>}
                    <img
                      src={url}
                      alt={`${pdfPreview.filename} page ${index + 1}`}
                      className="block h-auto w-full"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full h-[55vh] rounded-xl overflow-hidden border border-[var(--ah-border)] bg-[var(--ah-surface-3)]">
                <iframe
                  src={pdfPreview.url}
                  title={pdfPreview.filename}
                  className="w-full h-full"
                ></iframe>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={downloadPdf} className="btn btn-secondary">
                <i className="fa-solid fa-download" style={{ color: "var(--ah-success)" }} /> Download
              </button>
              <button onClick={sharePdf} className="btn btn-primary">
                <i className="fa-solid fa-share-nodes" /> Share
              </button>
            </div>
          </>
        )}
      </Popup>
    </div>
  );
}
