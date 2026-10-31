import { Icon } from "../ui/Icon.jsx";
import { useState } from "react";
import Select from "./Select.jsx";
import ShopLedgerAllocationEditor from "./ShopLedgerAllocationEditor.jsx";
import { Button, Field, Input } from "../ui/index.jsx";
import { todayStr } from "../utils/loan.js";
import {
  SHOP_LEDGER_UNITS,
  money,
  operationRequestId,
  releaseOperationRequestId,
} from "../utils/shopLedger.js";

function blankProduct() {
  return { name: "", quantity: "1", unit: "kg", total: "" };
}

function productsOf(market) {
  if (!market?.Products?.length) return [blankProduct()];
  return market.Products.map((product) => ({
    name: String(product.Name || ""),
    quantity: String(product.Quantity ?? ""),
    unit: String(product.Unit || "kg"),
    total: String(product.Total ?? ""),
  }));
}

function allocationsOf(payment) {
  if (!payment?.Allocations?.length) return [{ accountId: "", amount: "" }];
  return payment.Allocations.map((allocation) => ({
    accountId: String(allocation.AccountID || allocation.accountId || ""),
    amount: String(allocation.Amount ?? ""),
  }));
}

function amountOf(value) {
  const text = String(value ?? "").trim();
  if (!text || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export default function ShopLedgerMarketForm({
  shop,
  market,
  accounts,
  canAddPayment,
  onCancel,
  onSave,
}) {
  const [date, setDate] = useState(market?.Date || todayStr());
  const [products, setProducts] = useState(productsOf(market));
  const [includePayment, setIncludePayment] = useState(false);
  const [paymentDate, setPaymentDate] = useState(market?.Date || todayStr());
  const [paymentAllocations, setPaymentAllocations] = useState(allocationsOf(null));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const editing = !!market;
  const outstanding = Number(shop?.OutstandingBalance) || 0;
  const currency = shop?.Currency || "";
  const activeAccounts = (accounts || []).filter((account) => account.Status === "Active");
  const marketTotal = products.reduce((sum, product) => sum + (amountOf(product.total) || 0), 0);
  const paymentTotal = paymentAllocations.reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0);
  const maxPayment = editing ? null : outstanding + marketTotal;
  const showPayment = !editing && canAddPayment && activeAccounts.length > 0;

  const updateProduct = (index, patch) => {
    setProducts(products.map((product, productIndex) => (
      productIndex === index ? { ...product, ...patch } : product
    )));
  };

  const addProduct = () => setProducts([...products, blankProduct()]);

  const removeProduct = (index) => {
    if (products.length === 1) {
      setProducts([blankProduct()]);
      return;
    }
    setProducts(products.filter((_, productIndex) => productIndex !== index));
  };

  const validate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "বাজারের তারিখ নির্বাচন করুন।";
    if (!products.length) return "অন্তত একটি পণ্য যোগ করুন।";
    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      if (!product.name.trim()) return `${index + 1} নম্বর পণ্যের নাম লিখুন।`;
      if (!/^\d+(?:\.\d{1,3})?$/.test(String(product.quantity).trim()) || Number(product.quantity) <= 0) {
        return `${index + 1} নম্বর পণ্যের পরিমাণ শূন্যের বেশি হতে হবে (সর্বোচ্চ ৩ দশমিক)।`;
      }
      if (!product.unit) return `${index + 1} নম্বর পণ্যের একক নির্বাচন করুন।`;
      if (amountOf(product.total) === null) return `${index + 1} নম্বর পণ্যের মোট দাম বৈধভাবে লিখুন।`;
    }
    if (marketTotal <= 0) return "বাজারের মোট দাম শূন্যের বেশি হতে হবে।";
    if (includePayment && showPayment) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return "পেমেন্টের তারিখ নির্বাচন করুন।";
      const seen = new Set();
      for (const allocation of paymentAllocations) {
        if (!allocation.accountId) return "পেমেন্টের Account নির্বাচন করুন।";
        if (seen.has(String(allocation.accountId))) return "একই Account একাধিকবার ব্যবহার করা যাবে না।";
        seen.add(String(allocation.accountId));
        if (!/^\d+(?:\.\d{1,2})?$/.test(String(allocation.amount).trim()) || Number(allocation.amount) <= 0) {
          return "প্রতিটি Account-এর পেমেন্ট শূন্যের বেশি বৈধ পরিমাণ হতে হবে।";
        }
      }
      if (paymentTotal <= 0) return "পেমেন্টের পরিমাণ লিখুন।";
      if (paymentTotal > maxPayment + 0.000001) return "পেমেন্ট বর্তমান বাকির চেয়ে বেশি হতে পারে না।";
    }
    return "";
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSubmitting(true);
    const normalizedProducts = products.map((product) => ({
      name: product.name.trim(),
      quantity: String(product.quantity).trim(),
      unit: product.unit,
      total: String(amountOf(product.total)),
    }));
    const marketKey = {
      shopId: shop?.ShopID,
      date,
      products: normalizedProducts,
    };
    const marketScope = editing ? "shop-market-update" : "shop-market-create";
    const payload = {
      ...marketKey,
      requestId: operationRequestId(marketScope, editing ? { marketId: market.MarketID, ...marketKey } : marketKey),
    };
    let paymentKey = null;
    if (includePayment && showPayment) {
      const allocations = paymentAllocations.map((allocation) => ({
        accountId: allocation.accountId,
        amount: String(Number(allocation.amount)),
      }));
      paymentKey = { shopId: shop?.ShopID, date: paymentDate, allocations };
      payload.payment = {
        ...paymentKey,
        requestId: operationRequestId("shop-market-payment", paymentKey),
      };
    }
    try {
      const result = await onSave(payload, { editing, marketId: market?.MarketID });
      if (result && result.status === "SUCCESS") {
        releaseOperationRequestId(
          marketScope,
          editing ? { marketId: market.MarketID, ...marketKey } : marketKey,
        );
        if (paymentKey) releaseOperationRequestId("shop-market-payment", paymentKey);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <Field label="বাজারের তারিখ">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
      </Field>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="label mb-0">পণ্যের তালিকা</span>
          <span className="text-[10px] text-ink-3">মোট {products.length} টি</span>
        </div>
        <div className="space-y-2">
          {products.map((product, index) => (
            <div key={index} className="card-inset p-2">
              <div className="grid grid-cols-[18px_minmax(0,1fr)_42px_60px_66px_22px] items-center gap-1">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--ah-brand-soft)] text-[8px] font-bold text-[var(--ah-brand)]">
                  {index + 1}
                </span>
                <Input
                  value={product.name}
                  onChange={(event) => updateProduct(index, { name: event.target.value })}
                  placeholder="পণ্যের নাম"
                  aria-label="পণ্যের নাম"
                  maxLength={100}
                  className="min-w-0 px-2 text-[11px]"
                  required
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="0.001"
                  value={product.quantity}
                  onChange={(event) => updateProduct(index, { quantity: event.target.value })}
                  placeholder="পরিমাণ"
                  aria-label="পরিমাণ"
                  className="min-w-0 px-1 text-center text-[11px]"
                  required
                />
                <Select
                  value={product.unit}
                  onChange={(value) => updateProduct(index, { unit: value })}
                  className="min-w-0"
                  triggerClassName="px-1 text-[10px] gap-1"
                  menuClassName="min-w-[7rem] right-0"
                >
                  {SHOP_LEDGER_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>{unit.label}</option>
                  ))}
                </Select>
                <div className="relative min-w-0">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={product.total}
                    onChange={(event) => updateProduct(index, { total: event.target.value })}
                    placeholder="দাম"
                    aria-label="মোট দাম"
                    className="min-w-0 pl-1 pr-5 text-center text-[11px]"
                    required
                  />
                  <span className="absolute right-1 text-[8px] font-bold text-ink-3 pointer-events-none">{currency}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger shrink-0"
                  style={{ width: 22, height: 22 }}
                  title="পণ্য বাদ দিন"
                  aria-label="পণ্য বাদ দিন"
                  onClick={() => removeProduct(index)}
                >
                  <Icon name="trash-2" className="text-[10px]" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="secondary" icon="plus" className="mt-2" onClick={addProduct}>
          পণ্য যোগ করুন
        </Button>
      </div>

      <div className="card-inset p-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2">বাজারের মোট</span>
        <span className="text-sm font-bold tnum text-brand">{money(marketTotal, currency)}</span>
      </div>

      {showPayment ? (
        <div className="card-inset p-3 space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={includePayment}
              onChange={(event) => setIncludePayment(event.target.checked)}
            />
            এখনই পেমেন্ট যোগ করুন
          </label>
          {includePayment ? (
            <>
              <Field label="পেমেন্টের তারিখ">
                <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </Field>
              <ShopLedgerAllocationEditor
                accounts={activeAccounts}
                allocations={paymentAllocations}
                onChange={setPaymentAllocations}
                currency={currency}
                maxAmount={maxPayment}
                disabled={submitting}
              />
              <div className="hint">
                সর্বোচ্চ পেমেন্ট: {money(maxPayment, currency)} (বর্তমান বাকি + এই বাজার)
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="err">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>বাতিল</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ"}
        </Button>
      </div>
    </form>
  );
}
