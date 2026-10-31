import { Icon } from "../ui/Icon.jsx";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Popup from "../components/Popup.jsx";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  toneStyle,
} from "../ui/index.jsx";
import { buildPdfFromElement } from "../utils/pdfExport.js";
import { downloadBlob, isNative, shareBlob } from "../utils/files.js";
import {
  currentMonth,
  formatShopDate,
  money,
  monthLabel,
  productSummary,
  shiftMonth,
  sortShopRecordsNewestFirst,
} from "../utils/shopLedger.js";

function SummaryBox({ label, value, hint, tone }) {
  const colors = tone ? toneStyle(tone) : null;
  const border = tone && tone !== "brand" ? `var(--ah-${tone}-border)` : "var(--ah-border)";
  return (
    <div
      className="rounded-xl p-3 border"
      style={{
        background: colors ? colors.background : "var(--ah-surface-inset)",
        borderColor: border,
      }}
    >
      <div className="text-[10px] font-semibold text-ink-3">{label}</div>
      <div className="text-sm font-bold tnum mt-1 break-words" style={colors ? { color: colors.color } : undefined}>
        {value}
      </div>
      {hint ? <div className="text-[9px] text-ink-3 mt-1">{hint}</div> : null}
    </div>
  );
}

function ReportHeader({ shop, shopId, month }) {
  return (
    <div className="flex items-start justify-between gap-3 pb-3 border-b border-[var(--ah-border)]">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={toneStyle("brand")}>
          <Icon name="store" className="text-base" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink break-words">{shop?.Name || shopId}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-ink-2">
            <span className="inline-flex min-w-0 items-center gap-1">
              <Icon name="map-pin" className="shrink-0" />
              <span className="break-words">{shop?.Address || "ঠিকানা নেই"}</span>
            </span>
            {shop?.Mobile ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Icon name="phone" />
                {shop.Mobile}
              </span>
            ) : null}
          </div>
          <div className="text-[10px] text-ink-3 mt-1">
            <Icon name="wallet" className="me-1" />
            {shop?.WalletName || shop?.WalletID || "Wallet"} · {shop?.Currency || ""}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[9px] font-semibold text-ink-3">মাসিক রিপোর্ট</div>
        <div className="text-xs font-bold text-brand mt-0.5">{monthLabel(month)}</div>
      </div>
    </div>
  );
}

function MarketRow({ market, currency }) {
  return (
    <div className="p-2.5 flex items-start justify-between gap-3 border-b border-[var(--ah-border)] last:border-b-0">
      <div className="min-w-0">
        <div className="text-xs font-bold text-ink">{formatShopDate(market.Date)}</div>
        <div className="text-[10px] text-ink-3 mt-0.5 break-words">{productSummary(market.Products)}</div>
      </div>
      <div className="text-xs font-bold tnum text-brand shrink-0">{money(market.Total, currency)}</div>
    </div>
  );
}

function PaymentRow({ payment, currency }) {
  const allocations = payment.Allocations || [];
  return (
    <div className="p-2.5 flex items-start justify-between gap-3 border-b border-[var(--ah-border)] last:border-b-0">
      <div className="min-w-0">
        <div className="text-xs font-bold text-ink">{formatShopDate(payment.Date)}</div>
        <div className="text-[10px] text-ink-3 mt-0.5 break-words">
          {allocations.length
            ? allocations.map((allocation) => allocation.AccountName || allocation.AccountID).join(", ")
            : "Account তথ্য নেই"}
        </div>
      </div>
      <div className="text-xs font-bold tnum text-success shrink-0">{money(payment.Total, currency)}</div>
    </div>
  );
}

export default function ShopLedgerReportView({ shopId, can, showAlert, onBack }) {
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState(null);
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reportRef = useRef(null);
  const pdfUrlRef = useRef(null);
  const previewUrlsRef = useRef([]);

  useEffect(() => () => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      setReport(null);
      try {
        const [detailsResult, reportResult] = await Promise.allSettled([
          api.getShopLedgerDetails(shopId),
          api.getShopLedgerReport(shopId, month),
        ]);
        if (cancelled) return;
        if (detailsResult.status === "fulfilled" && detailsResult.value.status === "SUCCESS") {
          setShop(detailsResult.value.shop);
        }
        if (reportResult.status === "fulfilled" && reportResult.value.status === "SUCCESS") {
          setReport(reportResult.value.report);
        } else {
          const message = reportResult.status === "fulfilled"
            ? reportResult.value.message
            : reportResult.reason?.message;
          setLoadError(message || "মাসিক রিপোর্ট লোড হয়নি।");
        }
      } catch (error) {
        if (!cancelled) setLoadError(error.message || "মাসিক রিপোর্ট লোড হয়নি।");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [shopId, month, reloadKey]);

  const closePdfPreview = () => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setPdfPreview(null);
  };

  const openPdfPreview = async () => {
    if (pdfBusy || !report || !reportRef.current) return;
    if (!can("VIEW_SHOP_REPORTS")) {
      showAlert("রিপোর্ট দেখার অনুমতি নেই।", "error");
      return;
    }
    setPdfBusy(true);
    try {
      const safeName = String(shop?.Name || shopId).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
      const result = await buildPdfFromElement(reportRef.current, `shop-ledger_${safeName}_${month}.pdf`);
      if (!result) return;
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      const url = URL.createObjectURL(result.blob);
      const previewUrls = result.previewBlobs.map((blob) => URL.createObjectURL(blob));
      pdfUrlRef.current = url;
      previewUrlsRef.current = previewUrls;
      setPdfPreview({ url, blob: result.blob, filename: result.filename, previewUrls });
    } catch (error) {
      console.error("Shop ledger PDF export failed", error);
      showAlert("PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।", "error");
    } finally {
      setPdfBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (!pdfPreview) return;
    try {
      await downloadBlob(pdfPreview.filename, pdfPreview.blob);
    } catch (error) {
      if (error?.code === "SAVE_CANCELLED") return;
      showAlert("PDF ডাউনলোড করা যায়নি। আবার চেষ্টা করুন।", "error");
    }
  };

  const sharePdf = async () => {
    if (!pdfPreview) return;
    try {
      await shareBlob(pdfPreview.filename, pdfPreview.blob, pdfPreview.filename);
    } catch (error) {
      showAlert("PDF শেয়ার করা যায়নি। আবার চেষ্টা করুন।", "error");
    }
  };

  const currency = shop?.Currency || report?.Currency || "";
  const outstanding = Number(shop?.OutstandingBalance ?? report?.EndingOutstanding) || 0;
  const markets = sortShopRecordsNewestFirst(report?.Markets);
  const payments = sortShopRecordsNewestFirst(report?.Payments);

  if (!can("VIEW_SHOP_REPORTS")) {
    return (
      <div className="space-y-4">
        <PageHeader title="মাসিক রিপোর্ট" icon="receipt-text" onBack={onBack} />
        <ErrorState title="অনুমতি নেই" text="শপ লেজার রিপোর্ট দেখার অনুমতি আপনার নেই।" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="মাসিক রিপোর্ট"
        subtitle={shop?.Name || shopId}
        icon="receipt-text"
        onBack={onBack}
        right={
          <Button
            size="sm"
            variant="secondary"
            icon={pdfBusy ? "loader-circle animate-spin" : "file-text"}
            disabled={!report || pdfBusy}
            onClick={openPdfPreview}
          >
            {pdfBusy ? "তৈরি হচ্ছে..." : "PDF"}
          </Button>
        }
      />

      <Card className="p-3 no-print">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon="chevron-left"
            aria-label="আগের মাস"
            disabled={pdfBusy}
            onClick={() => setMonth((value) => shiftMonth(value, -1))}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-semibold text-ink-3 text-center">রিপোর্টের মাস</div>
            <InputMonth value={month} onChange={setMonth} disabled={pdfBusy} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon="chevron-right"
            aria-label="পরের মাস"
            disabled={pdfBusy}
            onClick={() => setMonth((value) => shiftMonth(value, 1))}
          />
        </div>
      </Card>

      {loading ? (
        <Card><LoadingState label="মাসিক রিপোর্ট লোড হচ্ছে..." /></Card>
      ) : loadError && !report ? (
        <ErrorState
          title="রিপোর্ট লোড হয়নি"
          text={loadError}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : report ? (
        <div ref={reportRef} className="space-y-4">
          <Card className="p-4">
            <ReportHeader shop={shop} shopId={shopId} month={month} />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <SummaryBox
                label="বর্তমান বাকি"
                value={money(outstanding, currency)}
                hint="সর্বশেষ হিসাব"
                tone={outstanding > 0 ? "warning" : "success"}
              />
              <SummaryBox label="মাসের শুরুতে বাকি" value={money(report.BeginningOutstanding, currency)} />
              <SummaryBox label="এই মাসের বাজার" value={money(report.TotalMarketPurchases, currency)} tone="info" />
              <SummaryBox label="এই মাসের পেমেন্ট" value={money(report.TotalPayments, currency)} tone="success" />
            </div>
            <div className="flex items-center justify-between gap-2 mt-3 rounded-lg px-3 py-2" style={toneStyle("brand")}>
              <span className="text-[10px] font-semibold">মাস শেষে বাকি</span>
              <span className="text-sm font-bold tnum">{money(report.EndingOutstanding, currency)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-center">
              <div className="card-inset p-2">
                <div className="text-[9px] text-ink-3">বাজার রেকর্ড</div>
                <div className="text-xs font-bold text-ink mt-0.5">{markets.length} টি</div>
              </div>
              <div className="card-inset p-2">
                <div className="text-[9px] text-ink-3">পেমেন্ট রেকর্ড</div>
                <div className="text-xs font-bold text-ink mt-0.5">{payments.length} টি</div>
              </div>
            </div>
          </Card>

          <SectionCard
            title="এই মাসের বাজার"
            subtitle={`${markets.length} টি রেকর্ড · ${money(report.TotalMarketPurchases, currency)}`}
            bodyClassName="px-4 pb-4"
          >
            {markets.length ? (
              <div className="card-inset">
                {markets.map((market) => (
                  <MarketRow key={market.RecordID} market={market} currency={currency} />
                ))}
              </div>
            ) : (
              <EmptyState icon="shopping-basket" title="এই মাসে কোনো বাজার নেই" text="অন্য মাস নির্বাচন করে দেখুন।" />
            )}
          </SectionCard>

          <SectionCard
            title="এই মাসের পেমেন্ট"
            subtitle={`${payments.length} টি রেকর্ড · ${money(report.TotalPayments, currency)}`}
            bodyClassName="px-4 pb-4"
          >
            {payments.length ? (
              <div className="card-inset">
                {payments.map((payment) => (
                  <PaymentRow key={payment.RecordID} payment={payment} currency={currency} />
                ))}
              </div>
            ) : (
              <EmptyState icon="banknote" title="এই মাসে কোনো পেমেন্ট নেই" text="অন্য মাস নির্বাচন করে দেখুন।" />
            )}
          </SectionCard>

          <div className="text-center text-[9px] text-ink-3">
            {shop?.Name || shopId} · {monthLabel(month)} · Amar Hisab
          </div>
        </div>
      ) : null}

      <Popup
        open={!!pdfPreview}
        onClose={closePdfPreview}
        title="PDF প্রিভিউ"
        maxWidth="max-w-lg"
      >
        {pdfPreview ? (
          <>
            {isNative() ? (
              <div className="w-full max-h-[55vh] overflow-y-auto rounded-xl border border-[var(--ah-border)] bg-[var(--ah-surface-3)]">
                {pdfPreview.previewUrls.map((url, index) => (
                  <div key={url} className="bg-white">
                    {index > 0 ? <p className="px-3 py-1 text-center text-[10px] text-ink-3">Page {index + 1}</p> : null}
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
                <iframe src={pdfPreview.url} title={pdfPreview.filename} className="w-full h-full" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon="download" onClick={downloadPdf}>Download</Button>
              <Button icon="share-2" onClick={sharePdf}>Share</Button>
            </div>
          </>
        ) : null}
      </Popup>
    </div>
  );
}

function InputMonth({ value, onChange, disabled = false }) {
  return (
    <input
      type="month"
      value={value}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value) onChange(event.target.value);
      }}
      className="input font-semibold text-center mt-0.5"
      style={{ paddingTop: 4, paddingBottom: 4 }}
    />
  );
}
