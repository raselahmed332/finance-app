import { useState } from "react";
import AccountSelect from "./AccountSelect.jsx";
import Popup from "./Popup.jsx";
import { useToast } from "./Toast.jsx";
import {
  formatMoney, loanTypeMeta, remainingOf, totalAmountOf,
  todayStr,
} from "../utils/loan.js";
import { ErrorText } from "./FormField.jsx";

export default function LoanAddForm({ loan, addition, wallets, onSave, onCancel, prefill, person }) {
  const isEdit = !!addition;
  const meta = loanTypeMeta(loan?.type);
  const total = totalAmountOf(loan);
  const repaid = Number(loan?.repaid) || 0;
  const remaining = remainingOf(loan);
  const oldAmount = isEdit ? Number(addition.amount) || 0 : 0;

  // The addition wallet is LOCKED to the loan's own wallet, exactly like a
  // repayment: an addition is part of the same loan ledger, so its money must
  // move through the loan's wallet (the backend rejects a mismatch and is the
  // authority). Shown read-only; only the Wallet Account stays selectable.
  const walletId = String(loan?.walletId || "");
  const selectedWallet = (wallets || []).find((w) => String(w.WalletID) === walletId);
  const currency = selectedWallet?.Currency || loan?.currency || "";

  const [account, setAccount] = useState(isEdit ? addition.account : "");
  const [amount, setAmount] = useState(isEdit ? String(addition.amount) : prefill?.amount ?? "");
  const [date, setDate] = useState(isEdit ? addition.date : prefill?.date || todayStr());
  const [note, setNote] = useState(isEdit ? addition.note || "" : prefill?.note || "");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [clientId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "a" + Date.now() + Math.random().toString(36).slice(2)));
  const toast = useToast();

  const validate = () => {
    const e = {};
    const num = Number(amount);
    if (!amount || amount === "") e.amount = "টাকার পরিমাণ লিখুন।";
    else if (!Number.isFinite(num) || num <= 0) e.amount = "টাকার পরিমাণ ০-এর বেশি হতে হবে।";
    if (!date) e.date = "তারিখ নির্বাচন করুন।";
    else if (loan?.loanDate && date < String(loan.loanDate)) e.date = "তারিখ হাওলাতের তারিখের আগে হতে পারবে না।";
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
    const payload = {
      amount: String(Number(amount)), date, walletId, account, currency,
      note: note.trim(), clientId,
    };
    if (isEdit) payload.id = addition.id;
    if (!isEdit && person) {
      // "Add to existing" goes through createLoan (mode=ADD_TO_EXISTING_LOAN):
      // carry the identity the backend already validated for this person, plus
      // the target loan, so the server re-checks type/person/paid state.
      payload.mode = "ADD_TO_EXISTING_LOAN";
      payload.targetLoanId = loan?.id;
      payload.type = loan?.type;
      payload.loanDate = date;
      payload.personName = String(person.personName || "").trim();
      payload.phone = String(person.phone || "").trim();
      payload.personId = String(person.personId || "").trim();
    }
    onSave(payload)
      .then((res) => {
        if (res && res.status === "ERROR") {
          toast.error(res.message || "সাবমিট ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
          setSubmitting(false);
        } else {
          setSubmitting(false);
        }
        return res;
      })
      .catch((err) => {
        toast.error(String((err && err.message) || err || "সাবমিট ব্যর্থ হয়েছে। আবার চেষ্টা করুন।"));
        setSubmitting(false);
      });
  };

  const entered = Number(amount) || 0;
  const previewNewTotal = entered > 0 ? Math.max(0, total - (isEdit ? oldAmount : 0) + entered) : total;
  const previewRemaining = entered > 0 ? Math.max(0, remaining - (isEdit ? oldAmount : 0) + entered) : remaining;

  return (
    <Popup open title={isEdit ? "অ্যাডিশন এডিট করুন" : "আরও টাকা যোগ করুন"} onClose={submitting ? undefined : onCancel}>
        <div className="bg-[var(--ah-surface-inset)] border border-[var(--ah-border)] rounded-xl p-3 mb-4">
          <div className="text-center text-sm font-bold text-ink mb-2">
            {loan?.personName} <span className="text-[10px] font-semibold text-ink-3">({meta.action})</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="text-[9px] text-ink-3 font-medium">মোট হাওলাত</div>
              <div className="text-[11px] font-bold text-ink mt-0.5">{formatMoney(total, currency)}</div>
            </div>
            <div>
              <div className="text-[9px] text-[var(--ah-success)] font-medium">ফেরত হয়েছে</div>
              <div className="text-[11px] font-bold text-[var(--ah-success)] mt-0.5">{formatMoney(repaid, currency)}</div>
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
            <label className="label">যোগ করার পরিমাণ ({currency})</label>
            <input type="number" step="any" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-sm font-semibold focus:ring-[var(--ah-brand-ring)] bg-[var(--ah-surface)] text-ink" />
            <ErrorText msg={errors.amount} />
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

          {entered > 0 && (
            <div className="bg-[var(--ah-success-soft)] border border-[var(--ah-success-soft)] dark:border-[var(--ah-success-soft)] rounded-xl px-3 py-2.5 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--ah-success)] font-medium">{isEdit ? "নতুন অ্যাডিশন পরিমাণ" : "নতুন যোগ হচ্ছে"}</span>
                <span className="font-bold text-[var(--ah-success)]">{formatMoney(entered, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ah-success)] font-medium">{isEdit ? "নতুন মোট হাওলাত" : "নতুন মোট হাওলাত"}</span>
                <span className="font-bold text-[var(--ah-success)]">{formatMoney(previewNewTotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ah-warning)] font-medium">নতুন বাকি</span>
                <span className="font-bold text-[var(--ah-warning)]">{formatMoney(previewRemaining, currency)}</span>
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="btn btn-primary btn-block mt-1">
            <i className={submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}></i> {submitting ? "সাবমিট হচ্ছে..." : (isEdit ? "আপডেট করুন" : "টাকা যোগ করুন")}
          </button>
        </form>
    </Popup>
  );
}