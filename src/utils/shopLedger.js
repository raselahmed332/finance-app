import { formatMoney } from "./currency.js";
import { todayStr } from "./loan.js";

export const SHOP_LEDGER_UNITS = [
  { value: "kg", label: "কেজি" },
  { value: "g", label: "গ্রাম" },
  { value: "liter", label: "লিটার" },
  { value: "ml", label: "মিলিলিটার" },
  { value: "piece", label: "পিস" },
  { value: "packet", label: "প্যাকেট" },
  { value: "sack", label: "বস্তা" },
  { value: "dozen", label: "ডজন" },
  { value: "bundle", label: "বান্ডিল" },
  { value: "ltr", label: "লিটার" },
  { value: "other", label: "অন্যান্য" },
];

const UNIT_LABELS = SHOP_LEDGER_UNITS.reduce((map, unit) => {
  map[unit.value] = unit.label;
  return map;
}, {});

export function unitLabel(value) {
  const key = String(value || "");
  return UNIT_LABELS[key] || key || "—";
}

export function money(value, currency) {
  return formatMoney(Number(value) || 0, currency || "");
}

export function shopRecordId(record) {
  return String(record?.MarketID || record?.PaymentID || record?.RecordID || "");
}

// Newest first, with CreatedAt and the record id as stable tie-breakers for
// several records entered on the same date.
export function sortShopRecordsNewestFirst(records) {
  return (records || []).slice().sort((a, b) =>
    String(b.Date || "").localeCompare(String(a.Date || "")) ||
    String(b.CreatedAt || "").localeCompare(String(a.CreatedAt || "")) ||
    shopRecordId(b).localeCompare(shopRecordId(a)));
}

export function productSummary(products, maxItems = 3) {
  const items = (products || []).map((product) => {
    const quantity = String(product.Quantity ?? "").trim();
    return `${product.Name}${quantity ? ` ${quantity} ${unitLabel(product.Unit)}` : ""}`;
  });
  if (!items.length) return "পণ্যের বিবরণ নেই";
  if (items.length <= maxItems) return items.join(", ");
  return `${items.slice(0, maxItems).join(", ")} +${items.length - maxItems} আরও`;
}

export function totalOfAllocations(allocations) {
  return (allocations || []).reduce((sum, allocation) => sum + (Number(allocation.Amount) || 0), 0);
}

export function formatShopDate(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  const named = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(text);
  if (named) {
    return `${named[1]} ${named[2]} ${named[3]}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    const when = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(when.getTime())) {
      return when.toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
      });
    }
  }
  return text;
}

const BENGALI_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

export function monthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return String(month || "");
  return `${BENGALI_MONTHS[Number(match[2]) - 1] || match[2]} ${match[1]}`;
}

export function currentMonth() {
  return todayStr().slice(0, 7);
}

export function shiftMonth(month, delta) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
  if (!match) return currentMonth();
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// A request id is kept per operation payload until the backend confirms success.
// A network failure therefore retries the SAME id (the backend replays the saved
// result instead of applying the financial change twice); a genuinely new
// payload gets a new id.
const pendingOperationIds = new Map();

function randomId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "shop-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

export function operationRequestId(scope, payload) {
  const key = `${scope}:${JSON.stringify(payload ?? {})}`;
  if (!pendingOperationIds.has(key)) pendingOperationIds.set(key, randomId());
  return pendingOperationIds.get(key);
}

export function releaseOperationRequestId(scope, payload) {
  pendingOperationIds.delete(`${scope}:${JSON.stringify(payload ?? {})}`);
}
