import { useState } from "react";
import Select from "./Select.jsx";
import Popup from "./Popup.jsx";
import { useToast } from "./Toast.jsx";
import { formatMoney, loanTypeMeta, remainingOf, todayStr, totalAmountOf } from "../utils/loan.js";

function ErrorText({ msg }) {
  return msg ? <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1"><i className="fa-solid fa-circle-exclamation"></i>{msg}</div> : null;
}

export default function LoanRepaymentForm({ loan, wallets, currentUser, onSave, onCancel }) {
  const meta = loanTypeMeta(loan?.type);
  const remaining = remainingOf(loan);
  // The repayment wallet is LOCKED to the loan's own wallet — it is shown
  // read-only and never selectable. Only the Wallet Account may be chosen.
  const walletId = String(loan?.walletId || "");
  const selectedWallet = (wallets || []).find((w) => String(w.WalletID) === walletId);
  const currency = selectedWallet?.Currency || loan?.currency || "";
  const [account, setAccount] = useState(loan?.account || "Cash");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [clientId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "p" + Date.now() + Math.random().toString(36).slice(2)));
  const toast = useToast();

  const validate = () => {
    const e = {};
    const num = Number(amount);
    if (!amount || amount === "") e.amount = "টাকার পরিমাণ লিখুন।";
    else if (!Number.isFinite(num) || num <= 0) e.amount = "টাকার পরিমাণ ০-এর বেশি হতে হবে।";
    else if (num > remaining + 0.001) e.amount = "ফেরতের পরিমাণ বাকি টাকার চেয়ে বেশি হতে পারবে না।";
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
    onSave({
      amount: String(Number(amount)), paymentDate: date, walletId, account, currency, note, clientId, user: currentUser.username,
    })
      .then((res) => {
        if (res && res.status === "ERROR") {
          toast.error(res.message || "ফেরত যোগ করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
        }
        return res;
      })
      .catch((err) => {
        toast.error(String((err && err.message) || err || "ফেরত যোগ করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।"));
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Popup open title={meta.repaymentTitle} onClose={submitting ? undefined : onCancel}>
      <div className="bg-slate-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 mb-4">
          <div className="text-center text-sm font-bold text-slate-800 dark:text-gray-100 mb-2">{loan?.personName}</div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">মোট হাওলাত</div>
              <div className="text-[11px] font-bold text-slate-800 dark:text-gray-100 mt-0.5">{formatMoney(totalAmountOf(loan), currency)}</div>
            </div>
            <div>
              <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">ফেরত হয়েছে</div>
              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatMoney(loan?.repaid, currency)}</div>
            </div>
            <div>
              <div className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">বাকি</div>
              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">{formatMoney(remaining, currency)}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">ফেরতের পরিমাণ ({currency})</label>
            <input type="number" step="any" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            <ErrorText msg={errors.amount} />
            {Number(amount) > 0 && Number(amount) <= remaining + 0.001 && (
              <div className={`mt-1.5 flex justify-between text-[10px] font-semibold ${remaining - Number(amount) > 0 ? "text-gray-400 dark:text-gray-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                <span>পরিশোধের পর বাকি: {formatMoney(Math.max(0, remaining - Number(amount)), currency)}</span>
                {remaining - Number(amount) <= 0.005 && <span><i className="fa-solid fa-circle-check me-0.5"></i>সম্পূর্ণ পরিশোধ হবে</span>}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">তারিখ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            <ErrorText msg={errors.date} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Wallet</label>
            <div className="w-full flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400">
              <span className="truncate">{selectedWallet ? `${selectedWallet.WalletName} (${selectedWallet.Currency})` : (loan?.walletName || walletId || "—")}</span>
              <span className="ml-2 shrink-0 text-[9px] font-semibold uppercase tracking-wide">লক করা আছে</span>
            </div>
            <ErrorText msg={errors.wallet} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Wallet Account</label>
            <Select value={account} onChange={setAccount}>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
            </Select>
            <ErrorText msg={errors.account} />
          </div>

          <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Currency</span>
            <span className="text-xs font-bold text-slate-800 dark:text-gray-100">{currency} <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">(Auto)</span></span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">নোট (ঐচ্ছিক)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
          </div>

          <button type="submit" disabled={submitting || amount && Number(amount) > remaining + 0.001}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2 mt-1">
            <i className={submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}></i> {submitting ? "সাবমিট হচ্ছে..." : "ফেরত যোগ করুন"}
          </button>
        </form>
    </Popup>
  );
}