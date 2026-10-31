import { Icon } from "../ui/Icon.jsx";
import { useState } from "react";
import AccountSelect from "./AccountSelect.jsx";
import Popup from "./Popup.jsx";
import { useToast } from "./Toast.jsx";
import { formatMoney, loanTypeMeta, remainingOf, todayStr, totalAmountOf } from "../utils/loan.js";
import { ErrorText } from "./FormField.jsx";

export default function LoanRepaymentForm({ loan, payment, wallets, currentUser, onSave, onCancel }) {
  const meta = loanTypeMeta(loan?.type);
  const isEdit = !!(payment && payment.id);
  const remaining = remainingOf(loan);
  // While editing, this payment is already counted in `repaid`, so the ceiling
  // for the new amount is the remaining owed PLUS this payment's own amount —
  // otherwise re-saving an unchanged amount would fail as "exceeds remaining".
  const maxAmount = remaining + (isEdit ? Number(payment.amount) || 0 : 0);
  // The repayment wallet is LOCKED to the loan's own wallet — it is shown
  // read-only and never selectable. Only the Wallet Account may be chosen.
  const walletId = String(loan?.walletId || "");
  const selectedWallet = (wallets || []).find((w) => String(w.WalletID) === walletId);
  const currency = selectedWallet?.Currency || loan?.currency || "";
  const [account, setAccount] = useState((isEdit && payment.account) || "");
  const [amount, setAmount] = useState(isEdit ? String(payment.amount ?? "") : "");
  const [date, setDate] = useState(isEdit ? (payment.paymentDate || payment.date || todayStr()) : todayStr());
  const [note, setNote] = useState(isEdit ? (payment.note || "") : "");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [clientId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "p" + Date.now() + Math.random().toString(36).slice(2)));
  const toast = useToast();

  const validate = () => {
    const e = {};
    const num = Number(amount);
    if (!amount || amount === "") e.amount = "টাকার পরিমাণ লিখুন।";
    else if (!Number.isFinite(num) || num <= 0) e.amount = "টাকার পরিমাণ ০-এর বেশি হতে হবে।";
    else if (num > maxAmount) e.amount = "ফেরতের পরিমাণ বাকি টাকার চেয়ে বেশি হতে পারবে না।";
    if (!date) e.date = "তারিখ নির্বাচন করুন।";
    else if (loan?.loanDate && date < String(loan.loanDate)) e.date = "ফেরতের তারিখ হাওলাতের তারিখের আগে হতে পারবে না।";
    if (!walletId) e.wallet = "Wallet নির্বাচন করুন।";
    if (!account) e.account = "Wallet Account নির্বাচন করুন।";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    // On edit the server matches the existing row by `id` (clientId would create a
    // duplicate); on add it is the idempotency key.
    const payload = {
      amount: String(Number(amount)), paymentDate: date, walletId, account, currency, note, user: currentUser.username,
    };
    if (isEdit) payload.id = payment.id;
    else payload.clientId = clientId;
    onSave(payload)
      .then((res) => {
        if (res && res.status === "ERROR") {
          toast.error(res.message || (isEdit ? "ফেরত আপডেট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" : "ফেরত যোগ করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।"));
        }
        return res;
      })
      .catch((err) => {
        toast.error(String((err && err.message) || err || (isEdit ? "ফেরত আপডেট করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" : "ফেরত যোগ করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।")));
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Popup open title={isEdit ? "ফেরত এডিট করুন" : meta.repaymentTitle} onClose={submitting ? undefined : onCancel}>
      <div className="bg-[var(--ah-surface-inset)] border border-[var(--ah-border)] rounded-xl p-3 mb-4">
          <div className="text-center text-sm font-bold text-ink mb-2">{loan?.personName}</div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="text-[9px] text-ink-3 font-medium">মোট হাওলাত</div>
              <div className="text-[11px] font-bold text-ink mt-0.5">{formatMoney(totalAmountOf(loan), currency)}</div>
            </div>
            <div>
              <div className="text-[9px] text-[var(--ah-success)] font-medium">ফেরত হয়েছে</div>
              <div className="text-[11px] font-bold text-[var(--ah-success)] mt-0.5">{formatMoney(loan?.repaid, currency)}</div>
            </div>
            <div>
              <div className="text-[9px] text-[var(--ah-warning)] font-medium">বাকি</div>
              <div className="text-[11px] font-bold text-[var(--ah-warning)] mt-0.5">{formatMoney(remaining, currency)}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Wallet</label>
              <div className="w-full flex items-center justify-between border border-[var(--ah-border)] rounded-xl px-3 py-2 text-xs bg-[var(--ah-surface-2)] text-ink-3">
                <span className="truncate">{selectedWallet ? `${selectedWallet.WalletName} (${selectedWallet.Currency})` : (loan?.walletName || walletId || "—")}</span>
                <span className="ml-2 shrink-0 text-[9px] font-semibold uppercase tracking-wide">লক করা আছে</span>
              </div>
              <ErrorText msg={errors.wallet} />
            </div>

            <div>
              <label className="label">Wallet Account</label>
              <AccountSelect walletId={walletId} value={account} onChange={setAccount} />
              <ErrorText msg={errors.account} />
            </div>
          </div>

          <div>
            <label className="label">ফেরতের পরিমাণ ({currency})</label>
            <input type="number" step="any" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-sm font-semibold focus:ring-[var(--ah-brand-ring)] bg-[var(--ah-surface)] text-ink" />
            <ErrorText msg={errors.amount} />
            {Number(amount) > 0 && Number(amount) <= maxAmount && (
              <div className={`mt-1.5 flex justify-between text-[10px] font-semibold ${maxAmount - Number(amount) > 0 ? "text-ink-3" : "text-[var(--ah-success)]"}`}>
                <span>পরিশোধের পর বাকি: {formatMoney(Math.max(0, maxAmount - Number(amount)), currency)}</span>
                {maxAmount - Number(amount) <= 0 && <span><Icon name="circle-check" className="me-0.5" />সম্পূর্ণ পরিশোধ হবে</span>}
              </div>
            )}
          </div>

          <div>
            <label className="label">তারিখ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            <ErrorText msg={errors.date} />
          </div>

          <div className="bg-[var(--ah-surface-2)] border border-[var(--ah-border)] rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-3">Currency</span>
            <span className="text-xs font-bold text-ink">{currency} <span className="text-[10px] font-medium text-ink-3">(Auto)</span></span>
          </div>

          <div>
            <label className="label">নোট (ঐচ্ছিক)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." className="input" />
          </div>

          <button type="submit" disabled={submitting || (amount && Number(amount) > maxAmount)}
            className="btn btn-primary btn-block mt-1">
            <Icon name={submitting ? "loader-circle" : "save"} /> {submitting ? "সাবমিট হচ্ছে..." : isEdit ? "পরিবর্তন সংরক্ষণ করুন" : "ফেরত যোগ করুন"}
          </button>
        </form>
    </Popup>
  );
}