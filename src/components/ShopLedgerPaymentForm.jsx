import { useState } from "react";
import ShopLedgerAllocationEditor from "./ShopLedgerAllocationEditor.jsx";
import { Button, Field, Input } from "../ui/index.jsx";
import { todayStr } from "../utils/loan.js";
import {
  money,
  operationRequestId,
  releaseOperationRequestId,
} from "../utils/shopLedger.js";

function accountsForPayment(accounts, payment) {
  const list = [...(accounts || [])];
  const known = new Set(list.map((account) => String(account.AccountID)));
  (payment?.Allocations || []).forEach((allocation) => {
    const id = String(allocation.AccountID || "");
    if (!id || known.has(id)) return;
    known.add(id);
    list.push({
      AccountID: id,
      Name: allocation.AccountName || id,
      Status: "Inactive",
    });
  });
  return list;
}

function allocationsOf(payment) {
  if (!payment?.Allocations?.length) return [{ accountId: "", amount: "" }];
  return payment.Allocations.map((allocation) => ({
    accountId: String(allocation.AccountID || ""),
    amount: String(allocation.Amount ?? ""),
  }));
}

export default function ShopLedgerPaymentForm({ shop, payment, accounts, onCancel, onSave }) {
  const [date, setDate] = useState(payment?.Date || todayStr());
  const [allocations, setAllocations] = useState(allocationsOf(payment));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const editing = !!payment;
  const currency = shop?.Currency || "";
  const options = accountsForPayment(accounts, payment);
  const activeOptions = options.filter((account) => account.Status === "Active");
  const outstanding = Number(shop?.OutstandingBalance) || 0;
  const maxPayment = outstanding + (Number(payment?.Total) || 0);
  const total = allocations.reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0);

  const validate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "পেমেন্টের তারিখ নির্বাচন করুন।";
    if (!allocations.length) return "অন্তত একটি Account নির্বাচন করুন।";
    if (maxPayment <= 0) return "বর্তমান বাকি শূন্য, তাই নতুন পেমেন্ট যোগ করা যাবে না।";
    const seen = new Set();
    for (const allocation of allocations) {
      if (!allocation.accountId) return "পেমেন্টের Account নির্বাচন করুন।";
      if (seen.has(String(allocation.accountId))) return "একই Account একাধিকবার ব্যবহার করা যাবে না।";
      seen.add(String(allocation.accountId));
      const account = options.find((item) => String(item.AccountID) === String(allocation.accountId));
      if (!account) return "নির্বাচিত Account পাওয়া যায়নি। অন্য Account নির্বাচন করুন।";
      if (account.Status && account.Status !== "Active") {
        return "নিষ্ক্রিয় Account-এ পেমেন্ট করা যাবে না। সক্রিয় Account নির্বাচন করুন।";
      }
      if (!/^\d+(?:\.\d{1,2})?$/.test(String(allocation.amount).trim()) || Number(allocation.amount) <= 0) {
        return "প্রতিটি Account-এর পেমেন্ট শূন্যের বেশি বৈধ পরিমাণ হতে হবে।";
      }
    }
    if (total <= 0) return "পেমেন্টের পরিমাণ লিখুন।";
    if (total > maxPayment + 0.000001) return "পেমেন্ট বর্তমান বাকির চেয়ে বেশি হতে পারে না।";
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
    const key = {
      shopId: shop?.ShopID,
      date,
      allocations: allocations.map((allocation) => ({
        accountId: allocation.accountId,
        amount: String(Number(allocation.amount)),
      })),
    };
    const scope = editing ? "shop-payment-update" : "shop-payment-create";
    const payload = {
      ...key,
      requestId: operationRequestId(scope, editing ? { paymentId: payment.PaymentID, ...key } : key),
    };
    try {
      const result = await onSave(payload, { editing, paymentId: payment?.PaymentID });
      if (result && result.status === "SUCCESS") {
        releaseOperationRequestId(scope, editing ? { paymentId: payment.PaymentID, ...key } : key);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-2">
        <div className="stat">
          <div className="stat-label">বর্তমান বাকি</div>
          <div className={`stat-value tnum mt-1 ${outstanding > 0 ? "text-warning" : "text-success"}`}>
            {money(outstanding, currency)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">সর্বোচ্চ পেমেন্ট</div>
          <div className="stat-value tnum mt-1 text-brand">{money(maxPayment, currency)}</div>
        </div>
      </div>

      <Field label="পেমেন্টের তারিখ">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
      </Field>

      {activeOptions.length === 0 ? (
        <div className="card-warning p-2.5 text-[11px] text-[var(--ah-warning)]">
          <i className="fa-solid fa-triangle-exclamation me-1" />
          এই Wallet-এ কোনো সক্রিয় Account নেই। পেমেন্ট যোগ করার আগে Account সক্রিয় করুন।
        </div>
      ) : null}

      <div>
        <span className="label">কোন কোন Account থেকে</span>
        <ShopLedgerAllocationEditor
          accounts={options}
          allocations={allocations}
          onChange={setAllocations}
          currency={currency}
          maxAmount={maxPayment}
          disabled={submitting}
        />
      </div>

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
