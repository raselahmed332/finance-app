import { Icon } from "../ui/Icon.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import Popup from "../components/Popup.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import ShopLedgerMarketForm from "../components/ShopLedgerMarketForm.jsx";
import ShopLedgerPaymentForm from "../components/ShopLedgerPaymentForm.jsx";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Segmented,
  SectionCard,
  toneStyle,
} from "../ui/index.jsx";
import {
  formatShopDate,
  money,
  operationRequestId,
  productSummary,
  releaseOperationRequestId,
  sortShopRecordsNewestFirst,
  unitLabel,
} from "../utils/shopLedger.js";

function ShopContactLine({ shop, className = "" }) {
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 align-middle ${className}`}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <Icon name="map-pin" className="shrink-0" />
        <span className="truncate">{shop?.Address || "ঠিকানা নেই"}</span>
      </span>
      {shop?.Mobile ? (
        <span className="inline-flex shrink-0 items-center gap-1">
          <Icon name="phone" />
          {shop.Mobile}
        </span>
      ) : null}
    </span>
  );
}

function RecordCreator({ record, userNames }) {
  const name = record?.CreatedByName || userNames?.[record?.CreatedBy] || record?.CreatedBy || "অজানা";
  return (
    <span className="me-auto min-w-0 truncate text-[9px] text-ink-3" title={`তৈরি: ${name}`}>
      <Icon name="user" className="me-1" />
      {name}
    </span>
  );
}

function SummaryStat({ label, value, tone }) {
  const style = tone ? toneStyle(tone) : null;
  return (
    <div
      className="rounded-lg p-2.5 border"
      style={style
        ? { background: style.background, borderColor: `var(--ah-${tone}-border)` }
        : { background: "var(--ah-surface-inset)", borderColor: "var(--ah-border)" }}
    >
      <div className="text-[9px] font-semibold text-ink-3 flex items-center gap-1">
        <span className="truncate">{label}</span>
      </div>
      <div className="text-xs font-bold tnum mt-1 break-words" style={style ? { color: style.color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function MarketCard({ market, currency, canEdit, canDelete, onView, onEdit, onDelete, userNames }) {
  const products = market.Products || [];
  return (
    <Card className="p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={toneStyle("warning")}>
          <Icon name="shopping-basket" className="text-sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-ink">{formatShopDate(market.Date)}</div>
            <div className="text-sm font-bold tnum text-brand shrink-0">{money(market.Total, currency)}</div>
          </div>
          <div className="text-[10px] text-ink-3 mt-0.5 break-words">{productSummary(products)}</div>
          <div className="text-[10px] text-ink-3 mt-1">
            <Icon name="boxes" className="me-1" />
            {products.length} টি পণ্য
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 pt-1 border-t border-[var(--ah-border)]">
        <RecordCreator record={market} userNames={userNames} />
        <Button size="sm" variant="ghost" icon="eye" onClick={onView}>দেখুন</Button>
        {canEdit ? <Button size="sm" variant="ghost" icon="pencil" onClick={onEdit}>এডিট</Button> : null}
        {canDelete ? <Button size="sm" variant="ghost" icon="trash-2" onClick={onDelete}>মুছুন</Button> : null}
      </div>
    </Card>
  );
}

function PaymentCard({ payment, currency, canEdit, canDelete, onView, onEdit, onDelete, userNames }) {
  const allocations = payment.Allocations || [];
  return (
    <Card className="p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={toneStyle("success")}>
          <Icon name="banknote" className="text-sm" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-ink">{formatShopDate(payment.Date)}</div>
            <div className="text-sm font-bold tnum text-success shrink-0">{money(payment.Total, currency)}</div>
          </div>
          <div className="space-y-1 mt-1.5">
            {allocations.length ? allocations.map((allocation, index) => (
              <div key={`${allocation.AccountID}-${index}`} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-ink-3 truncate">
                  <Icon name="wallet" className="me-1" />
                  {allocation.AccountName || allocation.AccountID}
                </span>
                <span className="font-semibold tnum text-ink-2 shrink-0">{money(allocation.Amount, currency)}</span>
              </div>
            )) : <div className="text-[10px] text-ink-3">Account তথ্য নেই</div>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 pt-1 border-t border-[var(--ah-border)]">
        <RecordCreator record={payment} userNames={userNames} />
        <Button size="sm" variant="ghost" icon="eye" onClick={onView}>দেখুন</Button>
        {canEdit ? <Button size="sm" variant="ghost" icon="pencil" onClick={onEdit}>এডিট</Button> : null}
        {canDelete ? <Button size="sm" variant="ghost" icon="trash-2" onClick={onDelete}>মুছুন</Button> : null}
      </div>
    </Card>
  );
}

function MarketDetail({ shop, market }) {
  const products = market.Products || [];
  return (
    <div className="space-y-3">
      <div className="card-inset p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-ink-2">{formatShopDate(market.Date)}</div>
          <div className="text-base font-bold tnum text-brand">{money(market.Total, shop?.Currency)}</div>
        </div>
        <div className="text-[11px] font-bold text-ink mt-2 truncate">{shop?.Name}</div>
        <ShopContactLine shop={shop} className="mt-0.5 text-[10px] text-ink-3" />
      </div>
      <div>
        <div className="text-[10px] font-semibold text-ink-3 mb-1.5">পণ্যের তালিকা</div>
        <div className="card-inset divide-y divide-[var(--ah-border)]">
          {products.map((product, index) => (
            <div key={index} className="p-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink break-words">{product.Name}</div>
                <div className="text-[10px] text-ink-3 mt-0.5">
                  {product.Quantity} {unitLabel(product.Unit)}
                </div>
              </div>
              <div className="text-xs font-bold tnum text-ink shrink-0">{money(product.Total, shop?.Currency)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-ink-3">
        <Icon name="calendar-1" className="me-1" />
        যোগ করা হয়েছে: {formatShopDate(market.CreatedAt)}
      </div>
    </div>
  );
}

function PaymentDetail({ shop, payment }) {
  const allocations = payment.Allocations || [];
  return (
    <div className="space-y-3">
      <div className="card-inset p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-ink-2">{formatShopDate(payment.Date)}</div>
          <div className="text-base font-bold tnum text-success">{money(payment.Total, shop?.Currency)}</div>
        </div>
        <div className="text-[10px] text-ink-3 mt-1">
          <Icon name="calendar-1" className="me-1" />
          {formatShopDate(payment.CreatedAt)}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold text-ink-3 mb-1.5">Account অনুযায়ী</div>
        <div className="card-inset divide-y divide-[var(--ah-border)]">
          {allocations.map((allocation, index) => (
            <div key={`${allocation.AccountID}-${index}`} className="p-2.5 flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-ink truncate">
                <Icon name="wallet" className="me-1 text-ink-3" />
                {allocation.AccountName || allocation.AccountID}
              </div>
              <div className="text-xs font-bold tnum text-ink shrink-0">{money(allocation.Amount, shop?.Currency)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card-inset p-3">
        <div className="text-[10px] font-semibold text-ink-3">দোকান</div>
        <div className="text-xs font-bold text-ink mt-0.5 break-words">{shop?.Name}</div>
        <ShopContactLine shop={shop} className="mt-0.5 text-[10px] text-ink-3" />
      </div>
    </div>
  );
}

export default function ShopLedgerDetailsView({
  shopId,
  can,
  showAlert,
  users = [],
  initialTab = "markets",
  initialAction = "",
  onBack,
  onOpenReport,
}) {
  const confirm = useConfirm();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState(initialTab === "payments" ? "payments" : "markets");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const intentApplied = useRef(false);

  const canAddMarket = can("ADD_MARKET_RECORD");
  const canEditMarket = can("EDIT_MARKET_RECORD");
  const canDeleteMarket = can("DELETE_MARKET_RECORD");
  const canAddPayment = can("ADD_SHOP_PAYMENT");
  const canEditPayment = can("EDIT_SHOP_PAYMENT");
  const canDeletePayment = can("DELETE_SHOP_PAYMENT");
  const canReport = can("VIEW_SHOP_REPORTS");
  const closeModal = () => { if (!busy) setModal(null); };

  const shop = details?.shop;
  const markets = sortShopRecordsNewestFirst(details?.markets);
  const payments = sortShopRecordsNewestFirst(details?.payments);
  const outstanding = Number(shop?.OutstandingBalance) || 0;
  const isActive = shop?.Status === "Active";
  const userNames = useMemo(() => {
    const map = {};
    (Array.isArray(users) ? users : []).forEach((user) => {
      if (user?.Username) map[user.Username] = user.FullName || user.Username;
    });
    return map;
  }, [users]);

  const loadDetails = async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");
    try {
      const response = await api.getShopLedgerDetails(shopId);
      if (response.status !== "SUCCESS") throw new Error(response.message || "দোকানের বিস্তারিত লোড হয়নি।");
      setDetails(response);
    } catch (error) {
      setLoadError(error.message || "দোকানের বিস্তারিত লোড হয়নি।");
      if (!silent) setDetails(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (!details || intentApplied.current) return;
    intentApplied.current = true;
    if (initialAction !== "new") return;
    if (initialTab === "payments" && canAddPayment && isActive && outstanding > 0) {
      setModal({ type: "payment-form" });
    } else if (initialTab === "markets" && canAddMarket && isActive) {
      setModal({ type: "market-form" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details]);

  const finishMutation = async (response, fallbackMessage) => {
    if (!response || response.status !== "SUCCESS") {
      showAlert(response?.message || fallbackMessage, "error");
      return response;
    }
    showAlert(response.message || "সংরক্ষণ হয়েছে।", "success");
    setModal(null);
    await loadDetails(true);
    return response;
  };

  const saveMarket = async (payload, info) => {
    if (busy) return null;
    setBusy(true);
    try {
      const response = info.editing
        ? await api.updateShopMarket(info.marketId, payload)
        : await api.addShopMarket(shopId, payload);
      return await finishMutation(response, "বাজারের তথ্য সংরক্ষণ করা যায়নি।");
    } catch (error) {
      showAlert(error.message || "নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async (payload, info) => {
    if (busy) return null;
    setBusy(true);
    try {
      const response = info.editing
        ? await api.updateShopPayment(info.paymentId, payload)
        : await api.addShopPayment(shopId, payload);
      return await finishMutation(response, "পেমেন্ট সংরক্ষণ করা যায়নি।");
    } catch (error) {
      showAlert(error.message || "নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const deleteMarket = async (market) => {
    if (busy) return;
    const ok = await confirm({
      title: "বাজার মুছবেন?",
      message: `${formatShopDate(market.Date)} তারিখের ${money(market.Total, shop?.Currency)} বাজারের রেকর্ড মুছে ফেলবেন?`,
      detail: "দোকানের বাকি আবার হিসাব করা হবে।",
      confirmLabel: "মুছে ফেলুন",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const key = { marketId: market.MarketID };
    try {
      const response = await api.deleteShopMarket(market.MarketID, {
        requestId: operationRequestId("shop-market-delete", key),
      });
      if (response.status === "SUCCESS") {
        releaseOperationRequestId("shop-market-delete", key);
        setModal(null);
        showAlert(response.message || "বাজার মুছে ফেলা হয়েছে।", "success");
        await loadDetails(true);
      } else {
        showAlert(response.message || "বাজার মুছে ফেলা যায়নি।", "error");
      }
    } catch (error) {
      showAlert(error.message || "নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error");
    } finally {
      setBusy(false);
    }
  };

  const deletePayment = async (payment) => {
    if (busy) return;
    const ok = await confirm({
      title: "পেমেন্ট মুছবেন?",
      message: `${formatShopDate(payment.Date)} তারিখের ${money(payment.Total, shop?.Currency)} পেমেন্ট মুছে ফেলবেন?`,
      detail: "Wallet-এর সংশ্লিষ্ট Account ব্যালেন্স আগের অবস্থায় ফিরে যাবে।",
      confirmLabel: "মুছে ফেলুন",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const key = { paymentId: payment.PaymentID };
    try {
      const response = await api.deleteShopPayment(payment.PaymentID, {
        requestId: operationRequestId("shop-payment-delete", key),
      });
      if (response.status === "SUCCESS") {
        releaseOperationRequestId("shop-payment-delete", key);
        setModal(null);
        showAlert(response.message || "পেমেন্ট মুছে ফেলা হয়েছে।", "success");
        await loadDetails(true);
      } else {
        showAlert(response.message || "পেমেন্ট মুছে ফেলা যায়নি।", "error");
      }
    } catch (error) {
      showAlert(error.message || "নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !details) {
    return (
      <div className="space-y-4">
        <PageHeader title="দোকানের খাতা" icon="store" onBack={onBack} />
        <LoadingState label="দোকানের বিস্তারিত লোড হচ্ছে..." />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="space-y-4">
        <PageHeader title="দোকানের খাতা" icon="store" onBack={onBack} />
        <ErrorState
          title="দোকানের বিস্তারিত লোড হয়নি"
          text={loadError || "দোকান পাওয়া যায়নি।"}
          onRetry={() => void loadDetails()}
        />
      </div>
    );
  }

  const detailActions = (record, type) => {
    const canEdit = type === "market" ? canEditMarket : canEditPayment;
    const canDelete = type === "market" ? canDeleteMarket : canDeletePayment;
    const actions = [];
    if (canEdit) {
      actions.push(
        <Button
          key="edit"
          variant="secondary"
          icon="pencil"
          disabled={busy}
          onClick={() => setModal({ type: `${type}-form`, [type]: record })}
        >
          এডিট
        </Button>,
      );
    }
    if (canDelete) {
      actions.push(
        <Button
          key="delete"
          variant="danger"
          icon="trash-2"
          disabled={busy}
          onClick={() => (type === "market" ? deleteMarket(record) : deletePayment(record))}
        >
          মুছুন
        </Button>,
      );
    }
    if (!actions.length) return null;
    return <div className={`grid gap-2 ${actions.length > 1 ? "grid-cols-2" : ""}`}>{actions}</div>;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={shop.Name}
        subtitle={<ShopContactLine shop={shop} className="min-w-0" />}
        icon="store"
        onBack={onBack}
        right={
          canReport ? (
            <Button size="sm" variant="secondary" icon="receipt-text" onClick={onOpenReport}>
              রিপোর্ট
            </Button>
          ) : (
            <Badge tone={isActive ? "success" : "neutral"}>{isActive ? "চালু" : "বন্ধ"}</Badge>
          )
        }
      />

      {loadError ? (
        <div className="card-warning p-2.5 text-[11px] text-[var(--ah-warning)]">
          <Icon name="triangle-alert" className="me-1" />
          {loadError} দেখানো তথ্য পুরোনো হতে পারে।
        </div>
      ) : null}

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={isActive ? toneStyle("info") : toneStyle("warning")}
          >
            <Icon name="store" className="text-base" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-ink truncate">{shop.Name}</div>
            <ShopContactLine shop={shop} className="mt-0.5 text-[10px] text-ink-3" />
            <div className="text-[10px] text-ink-3 mt-1">
              <Icon name="wallet" className="me-1" />
              {shop.WalletName || shop.WalletID} · {shop.Currency}
            </div>
          </div>
          <Badge tone={isActive ? "success" : "neutral"}>{isActive ? "চালু" : "বন্ধ"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <SummaryStat label="বর্তমান বাকি" value={money(outstanding, shop.Currency)} tone={outstanding > 0 ? "warning" : "success"} />
          <SummaryStat label="শুরুর বাকি" value={money(shop.OpeningBalance, shop.Currency)} />
          <SummaryStat label="মোট বাজার" value={money(shop.TotalMarketPurchases, shop.Currency)} tone="info" />
          <SummaryStat label="মোট পেমেন্ট" value={money(shop.TotalPayments, shop.Currency)} tone="success" />
        </div>
      </Card>

      {canAddMarket || canAddPayment ? (
        <div className={`grid gap-2 ${canAddMarket && canAddPayment ? "grid-cols-2" : ""}`}>
          {canAddMarket ? (
            <Button
              icon="shopping-basket"
              disabled={!isActive || busy}
              onClick={() => setModal({ type: "market-form" })}
            >
              নতুন বাজার
            </Button>
          ) : null}
          {canAddPayment ? (
            <Button
              variant="secondary"
              icon="banknote"
              disabled={!isActive || outstanding <= 0 || busy}
              onClick={() => setModal({ type: "payment-form" })}
            >
              পেমেন্ট
            </Button>
          ) : null}
        </div>
      ) : null}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "markets", label: `বাজার (${markets.length})`, icon: "shopping-basket" },
          { value: "payments", label: `পেমেন্ট (${payments.length})`, icon: "banknote" },
        ]}
      />

      {tab === "markets" ? (
        <SectionCard
          title="বাজারের তালিকা"
          subtitle={`${markets.length} টি রেকর্ড · মোট ${money(shop.TotalMarketPurchases, shop.Currency)}`}
          bodyClassName="p-4 pt-0 space-y-2"
        >
          {markets.length === 0 ? (
            <EmptyState icon="shopping-basket" title="কোনো বাজার নেই" text="প্রথম বাজারের রেকর্ড যোগ করুন।" />
          ) : markets.map((market) => (
            <MarketCard
              key={market.MarketID}
              market={market}
              currency={shop.Currency}
              canEdit={canEditMarket}
              canDelete={canDeleteMarket}
              onView={() => setModal({ type: "market-detail", market })}
              onEdit={() => setModal({ type: "market-form", market })}
              onDelete={() => deleteMarket(market)}
              userNames={userNames}
            />
          ))}
        </SectionCard>
      ) : (
        <SectionCard
          title="পেমেন্ট হিস্টোরি"
          subtitle={`${payments.length} টি পেমেন্ট · মোট ${money(shop.TotalPayments, shop.Currency)}`}
          bodyClassName="p-4 pt-0 space-y-2"
        >
          {payments.length === 0 ? (
            <EmptyState icon="banknote" title="কোনো পেমেন্ট নেই" text="দোকানে পেমেন্ট যোগ করে শুরু করুন।" />
          ) : payments.map((payment) => (
            <PaymentCard
              key={payment.PaymentID}
              payment={payment}
              currency={shop.Currency}
              canEdit={canEditPayment}
              canDelete={canDeletePayment}
              onView={() => setModal({ type: "payment-detail", payment })}
              onEdit={() => setModal({ type: "payment-form", payment })}
              onDelete={() => deletePayment(payment)}
              userNames={userNames}
            />
          ))}
        </SectionCard>
      )}

      <Popup
        open={modal?.type === "market-detail"}
        title="বাজারের বিস্তারিত"
        onClose={closeModal}
      >
        {modal?.market ? (
          <>
            <MarketDetail shop={shop} market={modal.market} />
            {detailActions(modal.market, "market")}
          </>
        ) : null}
      </Popup>

      <Popup
        open={modal?.type === "payment-detail"}
        title="পেমেন্ট কার্ড ডিটেইলস"
        onClose={closeModal}
      >
        {modal?.payment ? (
          <>
            <PaymentDetail shop={shop} payment={modal.payment} />
            {detailActions(modal.payment, "payment")}
          </>
        ) : null}
      </Popup>

      <Popup
        open={modal?.type === "market-form"}
        title={modal?.market ? "বাজার এডিট" : "নতুন বাজার"}
        onClose={closeModal}
      >
        <ShopLedgerMarketForm
          key={modal?.market?.MarketID || "new-market"}
          shop={shop}
          market={modal?.market}
          accounts={details.accounts || []}
          canAddPayment={canAddPayment}
          onCancel={() => setModal(null)}
          onSave={saveMarket}
        />
      </Popup>

      <Popup
        open={modal?.type === "payment-form"}
        title={modal?.payment ? "পেমেন্ট এডিট" : "নতুন পেমেন্ট"}
        onClose={closeModal}
      >
        <ShopLedgerPaymentForm
          key={modal?.payment?.PaymentID || "new-payment"}
          shop={shop}
          payment={modal?.payment}
          accounts={details.accounts || []}
          onCancel={() => setModal(null)}
          onSave={savePayment}
        />
      </Popup>
    </div>
  );
}

