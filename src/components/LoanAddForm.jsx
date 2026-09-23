import { useState } from "react";
import Select from "./Select.jsx";
import Popup from "./Popup.jsx";
import { useToast } from "./Toast.jsx";
import {
  formatMoney, loanTypeMeta, remainingOf, totalAmountOf,
  todayStr, pickDefaultWalletId,
} from "../utils/loan.js";

function ErrorText({ msg }) {
  return msg ? <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1"><i className="fa-solid fa-circle-exclamation"></i>{msg}</div> : null;
}

export default function LoanAddForm({ loan, addition, wallets, currentUser, onSave, onCancel, prefill, person }) {
  const isEdit = !!addition;
  const meta = loanTypeMeta(loan?.type);
  const total = totalAmountOf(loan);
  const repaid = Number(loan?.repaid) || 0;
  const remaining = remainingOf(loan);
  const oldAmount = isEdit ? Number(addition.amount) || 0 : 0;

  const [walletId, setWalletId] = useState(
    (isEdit && addition.walletId && (wallets || []).some((w) => String(w.WalletID) === String(addition.walletId)))
      ? addition.walletId
      : (prefill?.walletId && (wallets || []).some((w) => String(w.WalletID) === String(prefill.walletId)))
        ? prefill.walletId
        : (loan?.walletId && (wallets || []).some((w) => String(w.WalletID) === String(loan.walletId)))
          ? loan.walletId
          : pickDefaultWalletId(currentUser?.username, wallets),
  );
  const [account, setAccount] = useState(isEdit ? addition.account : prefill?.account || loan?.account || "Cash");
  const [amount, setAmount] = useState(isEdit ? String(addition.amount) : prefill?.amount ?? "");
  const [date, setDate] = useState(isEdit ? addition.date : prefill?.date || todayStr());
  const [note, setNote] = useState(isEdit ? addition.note || "" : prefill?.note || "");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [clientId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "a" + Date.now() + Math.random().toString(36).slice(2)));
  const toast = useToast();

  const selectedWallet = wallets.find(w => w.WalletID === walletId);
  const currency = selectedWallet?.Currency || loan?.currency || "";

  const changeWallet = (id) => {
    setWalletId(id);
    setAccount("Cash");
  };

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
        <div className="bg-slate-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 mb-4">
          <div className="text-center text-sm font-bold text-slate-800 dark:text-gray-100 mb-2">
            {loan?.personName} <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">({meta.action})</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">মোট হাওলাত</div>
              <div className="text-[11px] font-bold text-slate-800 dark:text-gray-100 mt-0.5">{formatMoney(total, currency)}</div>
            </div>
            <div>
              <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">ফেরত হয়েছে</div>
              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatMoney(repaid, currency)}</div>
            </div>
            <div>
              <div className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">বাকি</div>
              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">{formatMoney(remaining, currency)}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">যোগ করার পরিমাণ ({currency})</label>
            <input type="number" step="any" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            <ErrorText msg={errors.amount} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">তারিখ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            <ErrorText msg={errors.date} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Wallet</label>
            <Select value={walletId} onChange={changeWallet}>
              {wallets.length === 0 && <option value="">কোনো Wallet এক্সেস নেই</option>}
              {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
            </Select>
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

          {entered > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl px-3 py-2.5 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">{isEdit ? "নতুন অ্যাডিশন পরিমাণ" : "নতুন যোগ হচ্ছে"}</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatMoney(entered, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">{isEdit ? "নতুন মোট হাওলাত" : "নতুন মোট হাওলাত"}</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatMoney(previewNewTotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700 dark:text-amber-400 font-medium">নতুন বাকি</span>
                <span className="font-bold text-amber-700 dark:text-amber-400">{formatMoney(previewRemaining, currency)}</span>
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2 mt-1">
            <i className={submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}></i> {submitting ? "সাবমিট হচ্ছে..." : (isEdit ? "আপডেট করুন" : "টাকা যোগ করুন")}
          </button>
        </form>
    </Popup>
  );
}