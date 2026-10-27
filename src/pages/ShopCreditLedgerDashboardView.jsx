import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Popup from "../components/Popup.jsx";
import ShopLedgerShopForm from "../components/ShopLedgerShopForm.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Segmented,
  toneStyle,
} from "../ui/index.jsx";
import { formatMoney } from "../utils/loan.js";
import { formatShopDate } from "../utils/shopLedger.js";
import Select from "../components/Select.jsx";

const pendingRequestIds = new Map();

function requestId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "shop-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function money(value, currency) {
  return formatMoney(Number(value) || 0, currency || "");
}

function latestActivityDate(shop) {
  const marketDate = String(shop.MostRecentMarket?.Date || "");
  const paymentDate = String(shop.MostRecentPayment?.Date || "");
  return marketDate > paymentDate ? marketDate : paymentDate;
}

function ShopCard({ shop, onEdit, onToggle, canManage, canAddPayment, onOpen, onPay }) {
  const lastMarket = shop.MostRecentMarket;
  const lastPayment = shop.MostRecentPayment;
  return (
    <Card className="p-3 space-y-2.5 hover:border-[var(--ah-brand)] transition-colors">
      <div className="w-full text-left">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${shop.Status === "Active" ? "bg-[var(--ah-info-soft)] text-[var(--ah-info)]" : "bg-[var(--ah-warning-soft)] text-[var(--ah-warning)]"}`}>
            <i className="fa-solid fa-store text-base" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-ink truncate">{shop.Name}</div>
            <div className="flex items-center gap-1.5 text-[10px] text-ink-3 mt-0.5 min-w-0">
              <span className="max-w-[42%] truncate">
                <i className="fa-solid fa-location-dot me-1" />
                {shop.Address || "—"}
              </span>
              {shop.Mobile ? (
                <span className="shrink-0">
                  <i className="fa-solid fa-phone me-1" />
                  {shop.Mobile}
                </span>
              ) : null}
              <span className="min-w-0 truncate">
                <i className="fa-solid fa-wallet me-1" />
                {shop.WalletName || shop.WalletID}{shop.Currency ? ` · ${shop.Currency}` : ""}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge tone={shop.Status === "Active" ? "success" : "neutral"}>
              {shop.Status === "Active" ? "চালু" : "বন্ধ"}
            </Badge>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ["মোট বাজার", shop.TotalMarketPurchases, null],
          ["মোট পেমেন্ট", shop.TotalPayments, "success"],
          ["বর্তমান বাকি", shop.OutstandingBalance, Number(shop.OutstandingBalance) > 0 ? "warning" : "success"],
        ].map(([label, amount, tone]) => {
          const style = tone ? toneStyle(tone) : null;
          return (
            <div
              key={label}
              className="rounded-lg p-2 text-center border"
              style={style
                ? { background: style.background, borderColor: `var(--ah-${tone}-border)` }
                : { background: "var(--ah-surface-inset)", borderColor: "var(--ah-border)" }}
            >
              <div className="text-[9px] text-ink-3">{label}</div>
              <div className="text-xs font-bold tnum mt-0.5" style={style ? { color: style.color } : undefined}>
                {money(amount, shop.Currency)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="min-w-0 text-[9px] text-ink-3">
          <div className="truncate"><i className="fa-solid fa-calendar-day me-1" />সর্বশেষ বাজার</div>
          <div className="font-semibold text-ink-2 truncate mt-0.5">
            {lastMarket ? `${formatShopDate(lastMarket.Date)} · ${money(lastMarket.Total, shop.Currency)}` : "—"}
          </div>
        </div>
        <div className="min-w-0 text-[9px] text-ink-3">
          <div className="truncate"><i className="fa-solid fa-calendar-day me-1" />সর্বশেষ পেমেন্ট</div>
          <div className="font-semibold text-ink-2 truncate mt-0.5">
            {lastPayment ? `${formatShopDate(lastPayment.Date)} · ${money(lastPayment.Total, shop.Currency)}` : "—"}
          </div>
          {lastPayment?.Allocations?.length ? (
            <div className="text-[9px] text-ink-3 truncate mt-0.5">
              {lastPayment.Allocations.map((allocation) => allocation.AccountName).join(", ")}
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          size="sm"
          variant="secondary"
          icon="fa-book-open"
          className={canAddPayment ? "" : "col-span-2"}
          onClick={() => onOpen(shop)}
        >
          খাতা দেখুন
        </Button>
        {canAddPayment ? (
          <Button
            size="sm"
            icon="fa-money-bill-wave"
            disabled={shop.Status !== "Active" || Number(shop.OutstandingBalance) <= 0}
            onClick={() => onPay(shop)}
          >
            পেমেন্ট
          </Button>
        ) : null}
      </div>
      <div className="pt-1 border-t border-[var(--ah-border)]">
        <div className="flex items-center gap-2 pt-1.5 text-[9px] text-ink-3 min-w-0">
          <span className="min-w-0 truncate">
            <i className="fa-solid fa-user me-1" />
            {shop.CreatedByName || shop.CreatedBy || "—"}
          </span>
          <span className="shrink-0">
            <i className="fa-solid fa-calendar-day me-1" />
            {formatShopDate(shop.CreatedAt)}
          </span>
          {canManage ? (
            <div className="flex items-center gap-1 ms-auto shrink-0">
              <Button size="sm" variant="ghost" icon="fa-pen" onClick={() => onEdit(shop)}>এডিট</Button>
              <Button size="sm" variant="ghost" icon={shop.Status === "Active" ? "fa-box-archive" : "fa-rotate-left"} onClick={() => onToggle(shop)}>
                {shop.Status === "Active" ? "বন্ধ" : "চালু"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default function ShopCreditLedgerDashboardView({ wallets, can, showAlert, onOpenShop }) {
  const confirm = useConfirm();
  const [shops, setShops] = useState([]);
  const [reconciliationRequired, setReconciliationRequired] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("outstanding-desc");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const closeModal = () => { if (!busy) setModal(null); };

  const canView = can("VIEW_SHOP_LEDGER");
  const canManageShop = can("MANAGE_SHOP_LEDGER");
  const canAddPayment = can("ADD_SHOP_PAYMENT");
  const activeCount = shops.filter((shop) => shop.Status === "Active").length;
  const inactiveCount = shops.length - activeCount;

  const loadShops = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await api.getShopLedgers();
      if (response.status !== "SUCCESS") throw new Error(response.message || "দোকানের খাতা লোড হয়নি।");
      setShops(response.shops || []);
      setReconciliationRequired(response.reconciliationRequired || []);
    } catch (error) {
      setLoadError(error.message || "দোকানের খাতা লোড হয়নি।");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadShops(); }, []);

  const filteredShops = useMemo(() => shops
    .filter((shop) => statusFilter === "All" || shop.Status === statusFilter)
    .filter((shop) => {
      const search = query.trim().toLowerCase();
      return !search || String(shop.Name).toLowerCase().includes(search) ||
        String(shop.Mobile || "").toLowerCase().includes(search);
    })
    .sort((a, b) => {
      if (sortBy === "name-asc") return String(a.Name).localeCompare(String(b.Name));
      if (sortBy === "recent-desc") {
        return latestActivityDate(b).localeCompare(latestActivityDate(a));
      }
      const difference = Number(b.OutstandingBalance) - Number(a.OutstandingBalance);
      const sorted = sortBy === "outstanding-asc" ? -difference : difference;
      return sorted || String(a.Name).localeCompare(String(b.Name));
    }),
  [shops, statusFilter, query, sortBy]);

  const submit = async (action, data, scope) => {
    if (busy) return false;
    setBusy(true);
    const payload = { ...data };
    delete payload.requestId;
    const key = `${scope}:${JSON.stringify(payload)}`;
    if (!pendingRequestIds.has(key)) pendingRequestIds.set(key, requestId());
    try {
      const response = await action({ ...payload, requestId: pendingRequestIds.get(key) });
      if (response.status !== "SUCCESS") {
        showAlert(response.message || "সংরক্ষণ করা যায়নি।", "error");
        return false;
      }
      pendingRequestIds.delete(key);
      showAlert(response.message || "সংরক্ষণ হয়েছে।", "success");
      setModal(null);
      await loadShops();
      return true;
    } catch (error) {
      showAlert(error.message || "নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveShop = (data) => modal.shop
    ? submit((payload) => api.updateShopLedger(modal.shop.ShopID, payload), data, `update-shop:${modal.shop.ShopID}`)
    : submit(api.createShopLedger, data, `create-shop:${data.walletId}`);

  const toggleShop = async (shop) => {
    const next = shop.Status === "Active" ? "Inactive" : "Active";
    const message = next === "Inactive" && Number(shop.OutstandingBalance) > 0
      ? `এই দোকানের বাকি ${money(shop.OutstandingBalance, shop.Currency)}। বন্ধ করলেও এই ঋণ ও পুরনো তথ্য সংরক্ষিত থাকবে। চালিয়ে যাবেন?`
      : next === "Inactive" ? "এই দোকানের খাতা বন্ধ করবেন? ইতিহাস সংরক্ষিত থাকবে।" : "এই দোকানের খাতা আবার চালু করবেন?";
    const ok = await confirm({
      title: next === "Inactive" ? "খাতা বন্ধ করুন" : "খাতা চালু করুন",
      message,
      confirmLabel: next === "Inactive" ? "বন্ধ করুন" : "চালু করুন",
      danger: next === "Inactive",
    });
    if (ok) await submit((payload) => api.setShopLedgerStatus(shop.ShopID, payload), { status: next }, `status-shop:${shop.ShopID}:${next}`);
  };

  if (!canView) return <EmptyState title="অনুমতি নেই" text="Shop ledger দেখার অনুমতি আপনার নেই।" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="বাকির খাতা"
        icon="fa-book-open"
        subtitle="দোকানের বাজার, পেমেন্ট ও বর্তমান বাকি"
        right={
          canManageShop
            ? <Button size="sm" icon="fa-plus" onClick={() => setModal({ type: "shop" })}>নতুন দোকান</Button>
            : <span className="text-[10px] text-ink-3">যোগ করতে অনুমতি নেই</span>
        }
      />
      {reconciliationRequired.length ? (
        <Card className="p-3 text-xs text-[var(--ah-warning)]">
          <b>Reconciliation needed:</b> {reconciliationRequired.length} ledger operation(s) need Admin review. Do not resubmit those operations.
        </Card>
      ) : null}
      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-ink-3 text-xs" />
        <Input
          placeholder="দোকানের নাম বা মোবাইল নম্বর দিয়ে খুঁজুন..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Segmented
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "All", label: `সব (${shops.length})` },
              { value: "Active", label: `চালু (${activeCount})` },
              { value: "Inactive", label: `বন্ধ (${inactiveCount})` },
            ]}
          />
        </div>
        <Select value={sortBy} onChange={setSortBy} aria-label="দোকান সাজান">
          <option value="outstanding-desc">সর্বোচ্চ বাকি</option>
          <option value="outstanding-asc">সর্বনিম্ন বাকি</option>
          <option value="recent-desc">সর্বশেষ কার্যক্রম</option>
          <option value="name-asc">নাম অনুযায়ী</option>
        </Select>
      </div>
      {loading ? <LoadingState label="দোকানের খাতা লোড হচ্ছে..." /> : null}
      {!loading && loadError ? (
        <ErrorState
          title="দোকানের খাতা লোড হয়নি"
          text={`${loadError} দেখানো তথ্য পুরোনো হতে পারে — আবার চেষ্টা করুন।`}
          onRetry={loadShops}
        />
      ) : null}
      {!loading && !loadError && filteredShops.length === 0 ? (
        <EmptyState
          icon={query ? "fa-magnifying-glass" : "fa-store"}
          title={query ? "কোনো দোকান পাওয়া যায়নি" : "কোনো দোকানের খাতা নেই"}
          text={query ? "সার্চ পরিবর্তন করে আবার চেষ্টা করুন।" : "প্রথম দোকানের খাতা তৈরি করে শুরু করুন।"}
          action={query ? <Button size="sm" variant="secondary" onClick={() => setQuery("")}>সার্চ মুছুন</Button> : null}
        />
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredShops.map((shop) => (
          <ShopCard
            key={shop.ShopID}
            shop={shop}
            onEdit={(value) => setModal({ type: "shop", shop: value })}
            onToggle={toggleShop}
            canManage={canManageShop}
            canAddPayment={canAddPayment}
            onOpen={(value) => onOpenShop(value.ShopID)}
            onPay={(value) => onOpenShop(value.ShopID, "payments", "new")}
          />
        ))}
      </div>
      <Popup open={modal?.type === "shop"} title={modal?.shop ? "দোকানের তথ্য এডিট" : "নতুন দোকানের খাতা"} onClose={closeModal}>
        <ShopLedgerShopForm wallets={wallets} shop={modal?.shop} busy={busy} onCancel={() => setModal(null)} onSave={saveShop} />
      </Popup>
    </div>
  );
}
