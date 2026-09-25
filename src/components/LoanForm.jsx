import { useMemo, useState } from "react";
import Select from "./Select.jsx";
import Popup from "./Popup.jsx";
import {
  formatMoney, isValidPhone, knownPeople, loanTypeMeta, normalizePhone, remainingOf,
  totalAmountOf, todayStr, pickDefaultWalletId,
} from "../utils/loan.js";
import LoanAddForm from "./LoanAddForm.jsx";

function ErrorText({ msg }) {
  return msg ? <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1"><i className="fa-solid fa-circle-exclamation"></i>{msg}</div> : null;
}

function Field({ label, children, error }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {children}
      <ErrorText msg={error} />
    </div>
  );
}

function StepIndicator({ step }) {
  const steps = ["তথ্য দিন", "বিস্তারিত দিন", "নিশ্চিত করুন"];
  return (
    <div className="flex items-center mb-5">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none last:flex-grow-0">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${done ? "bg-emerald-600 border-emerald-600 text-white" : active ? "bg-emerald-600 border-emerald-600 text-white shadow-md" : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500"}`}>
                {done ? <i className="fa-solid fa-check"></i> : n}
              </div>
              <span className={`mt-1 text-[9px] font-semibold whitespace-nowrap ${active ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>{label}</span>
            </div>
            {n < 3 && <div className={`flex-1 h-0.5 mx-1.5 -mt-4 rounded ${done ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"}`}></div>}
          </div>
        );
      })}
    </div>
  );
}

export default function LoanForm({ can, wallets, loans, loan, currentUser, onSave, onCancel, onDone, onGoHome, onShow, onAddToLoan, onCheckActive }) {
  const isEdit = !!loan;
  const [step, setStep] = useState(1);
  const [type, setType] = useState(loan?.type || (can && !can('LOAN_GIVE') && can('LOAN_TAKE') ? "taken" : "given"));
  const [personName, setPersonName] = useState(loan?.personName || "");
  const [phone, setPhone] = useState(loan?.phone || "");
  const [amount, setAmount] = useState(loan ? String(loan.amount) : "");
  const [loanDate, setLoanDate] = useState(loan?.loanDate || todayStr());
  const [dueDate, setDueDate] = useState(loan?.dueDate || "");
  const [reminderDate, setReminderDate] = useState(loan?.reminderDate || "");
  const [walletId, setWalletId] = useState((loan?.walletId && (wallets || []).some((w) => String(w.WalletID) === String(loan.walletId))) ? loan.walletId : pickDefaultWalletId(currentUser?.username, wallets));
  const [account, setAccount] = useState(loan?.account || "Cash");
  const [note, setNote] = useState(loan?.note || "");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdLoan, setCreatedLoan] = useState(null);
  const [showActiveWarning, setShowActiveWarning] = useState(false);
  const [showLoanPicker, setShowLoanPicker] = useState(false);
  const [addTarget, setAddTarget] = useState(null);
  const [addResult, setAddResult] = useState(null);
  // Server-authoritative active-loan check (only for NEW loans). "failed" means
  // the backend could not be reached/validated — we NEVER treat that as "no active
  // loan", we only offer Retry, so a false "separate loan" is impossible.
  const [activeCheck, setActiveCheck] = useState("idle");
  const [serverActive, setServerActive] = useState([]);
  const [resolvedPersonId, setResolvedPersonId] = useState("");
  const [activeCheckError, setActiveCheckError] = useState("");
  // Known-person id sent to EXACTLY identify the person during the active-loan
  // check (§3). It is only kept while it matches the typed name/phone — any
  // manual edit clears it so a stale id can never check a different person.
  const [personId, setPersonId] = useState(loan?.personId || "");
  const [clientId, setClientId] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "l" + Date.now() + Math.random().toString(36).slice(2)));

  const selectedWallet = wallets.find(w => w.WalletID === walletId);
  const currency = selectedWallet?.Currency || loan?.currency || "";

  const people = useMemo(() => knownPeople(loans), [loans]);
  const suggestions = useMemo(() => {
    const q = personName.trim().toLowerCase();
    if (!q) return [];
    return people.filter(p => String(p.personName).toLowerCase().includes(q)).slice(0, 4);
  }, [people, personName]);

  const meta = loanTypeMeta(type);

  // Loans returned by the backend check. When creating a NEW loan the server —
  // not the stale local list — decides whether the person truly has outstanding
  // loans (any type/currency). "Add to existing" is only offered for loans that
  // are compatible (same type + currency), matching how an addition behaves.
  const compatibleActiveLoans = useMemo(() => {
    if (isEdit) return [];
    return (serverActive || []).filter(l =>
      String(l.type) === type &&
      String(l.currency || "") === String(currency),
    );
  }, [serverActive, type, currency, isEdit]);

  const changeWallet = (id) => {
    setWalletId(id);
    setAccount("Cash");
  };

  const validateStep1 = () => {
    const e = { ...errors };
    if (!personName.trim()) e.personName = "ব্যক্তির নাম লিখুন।";
    else delete e.personName;
    const phoneDigits = String(phone || "").replace(/\D/g, "");
    if (!phone) e.phone = "ফোন নম্বর আবশ্যক।";
    else if (!isValidPhone(phone)) e.phone = "সঠিক ফোন নম্বর দিন। (দেশের কোড সহ "+" ব্যবহার করা যাবে)";
    else if (phoneDigits.length < 6) e.phone = "সঠিক ফোন নম্বর দিন।";
    else delete e.phone;
    setErrors(e);
    return !e.personName && !e.phone;
  };

  const validateStep2 = () => {
    const e = { ...errors };
    const num = Number(amount);
    if (!amount || amount === "") e.amount = "টাকার পরিমাণ লিখুন।";
    else if (!Number.isFinite(num) || num <= 0) e.amount = "টাকার পরিমাণ ০-এর বেশি হতে হবে।";
    else delete e.amount;
    if (!loanDate) e.loanDate = "তারিখ নির্বাচন করুন।";
    else delete e.loanDate;
    if (!walletId) e.wallet = "Wallet নির্বাচন করুন।";
    else delete e.wallet;
    if (!account) e.account = "Wallet Account নির্বাচন করুন।";
    else delete e.account;
    if (dueDate && dueDate < loanDate) e.dueDate = "ডিউ তারিখ হাওলাতের তারিখের আগে হতে পারবে না।";
    else delete e.dueDate;
    if (reminderDate && reminderDate < loanDate) e.reminderDate = "রিমাইন্ডার তারিখ হাওলাতের তারিখের আগে হতে পারবে না।";
    else delete e.reminderDate;
    setErrors(e);
    return !e.amount && !e.loanDate && !e.wallet && !e.account && !e.dueDate && !e.reminderDate;
  };

  const goNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  // Form-native submits (Enter/Go key) only advance to the next step — they
  // must NEVER start the active-loan check. The check and the loan creation
  // are started exclusively by a real tap on the final submit button.
  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (submitting || activeCheck === "checking") return;
    if (step !== 3) { goNext(); return; }
  };

  const handleFinalSubmit = () => {
    if (submitting || activeCheck === "checking") return;
    // Creating is NEVER blocked by existing active loans — we only ask how to
    // proceed. But whether the person HAS an active loan is a SERVER decision.
    if (isEdit) { doCreate(); return; }
    runActiveCheck();
  };

  // Backend-driven active-loan check. Any failure (network, permission) shows a
  // "CHECK FAILED" state with Retry — it is never treated as "no active loan".
  const runActiveCheck = () => {
    const qName = personName.trim();
    const qPhone = normalizePhone(phone);
    if (!qName || !qPhone) { setStep(1); return; }
    // The active-loan check is REQUIRED before creating a new loan. If it
    // cannot run we fail closed (NO loan is created) and only offer Retry —
    // we never treat an unavailable check as "no active loan".
    if (typeof onCheckActive !== "function") { setActiveCheck("failed"); return; }
    setActiveCheck("checking");
    const run = () => {
      setActiveCheck("checking");
      onCheckActive({ personName: qName, phone: qPhone, personId: personId || "" }).then((res) => {
        if (res && res.status === "SUCCESS") {
          const list = res.loans || [];
          setServerActive(list);
          setResolvedPersonId(res.personId || "");
          setActiveCheckError("");
          setActiveCheck("done");
          if (list.length > 0) setShowActiveWarning(true);
          else doCreate();
        } else {
          setActiveCheckError((res && res.message) || "");
          setActiveCheck("failed");
        }
      }).catch((err) => {
        setActiveCheckError(String((err && err.message) || err || ""));
        setActiveCheck("failed");
      });
    };
    run();
  };

  const doCreate = (separateConfirmed) => {
    const payload = {
      type, personName: personName.trim(), phone: normalizePhone(phone),
      amount, currency, walletId, walletName: selectedWallet?.WalletName,
      account, loanDate, dueDate, reminderDate, note: note.trim(),
      clientId,
    };
    if (isEdit) payload.id = loan.id;
    else {
      payload.mode = "NEW_SEPARATE_LOAN";
      payload.personId = resolvedPersonId || "";
      // Only set AFTER the user saw the active-loan warning and consciously
      // chose "নতুন আলাদা লোন তৈরি করুন". The backend refuses a blind,
      // unconfirmed separate creation when the person is genuinely outstanding.
      if (separateConfirmed) payload.separateLoanConfirmed = true;
    }
    setSubmitting(true);
    onSave(payload).then((res) => {
      if (res && res.code === "ACTIVE_LOAN_DECISION_REQUIRED") {
        // The person gained/still has an outstanding loan that this submission
        // did NOT confirm (data may have changed between check and submit).
        // Re-run the check so the warning with BOTH options is shown again —
        // never auto-create.
        setSubmitting(false);
        runActiveCheck();
        return;
      }
      if (res && res.status === "SUCCESS") {
        if (isEdit) onDone();
        else { setSuccess(true); setCreatedLoan(res.loan || payload); }
      }
      setSubmitting(false);
    }).catch(() => setSubmitting(false));
  };

  const openAddFlow = (targetLoan) => {
    setAddTarget({ loan: targetLoan, amount, date: loanDate, walletId, account, note: note.trim() });
  };

  const chooseAddToExisting = () => {
    setShowActiveWarning(false);
    if (compatibleActiveLoans.length === 1) openAddFlow(compatibleActiveLoans[0]);
    else setShowLoanPicker(true);
  };

  const handleAddToLoanSaved = (res) => {
    if (res && res.status === "SUCCESS") {
      setAddResult(res);
      setAddTarget(null);
    }
    return res;
  };

  const resetForMore = () => {
    setPersonName(""); setPhone(""); setAmount(""); setDueDate(""); setReminderDate("");
    setNote(""); setErrors({}); setSuccess(false); setCreatedLoan(null); setAddResult(null);
    setShowActiveWarning(false); setShowLoanPicker(false); setAddTarget(null);
    setActiveCheck("idle"); setServerActive([]); setResolvedPersonId(""); setPersonId(""); setActiveCheckError("");
    setStep(1); setLoanDate(todayStr());
    setClientId(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "l" + Date.now() + Math.random().toString(36).slice(2));
  };

  if (addResult) {
    const l = addResult.loan;
    const added = addResult.addition || {};
    const cur = l?.currency || currency;
    return (
      <Popup open title="আরও টাকা যোগ" onClose={onCancel}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-3xl">
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base mt-3">হাওলাতে টাকা যোগ হয়েছে!</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">সক্রিয় লোনের হিসাব আপডেট হয়েছে।</p>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-xs text-slate-800 dark:text-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-base font-bold">{String(l?.personName || "?").charAt(0).toUpperCase()}</div>
            <div>
              <div className="font-bold text-slate-800 dark:text-gray-100">{l?.personName}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400"><i className="fa-solid fa-phone me-1"></i>{l?.phone}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">হাওলাতের ধরন</span><span className="font-bold">{loanTypeMeta(l?.type).action}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">যোগ হয়েছে</span><span className="font-bold text-amber-600">+{formatMoney(Number(added.amount || 0), cur)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">মোট হাওলাত</span><span className="font-bold text-emerald-600">{formatMoney(totalAmountOf(l), cur)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">বাকি</span><span className="font-bold text-amber-600">{formatMoney(remainingOf(l), cur)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">তারিখ</span><span className="font-bold">{added.date || l?.loanDate}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">ওয়ালেট</span><span className="font-bold">{added.walletName || l?.walletName || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Wallet Account</span><span className="font-bold">{added.account || l?.account}</span></div>
            {added.note && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">নোট</span><span className="font-bold text-right">{added.note}</span></div>}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <button onClick={() => onDone && onShow(l)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow-md">লোন দেখুন</button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onGoHome} className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 font-bold py-2.5 rounded-xl text-xs">হোমে যান</button>
            <button onClick={resetForMore} className="bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs"><i className="fa-solid fa-plus me-1"></i>আরো হাওলাত দিন</button>
          </div>
        </div>
      </Popup>
    );
  }

  if (success) {
    const l = createdLoan;
    return (
      <Popup open title="নতুন হাওলাত" onClose={onCancel}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-3xl">
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base mt-3">হাওলাত সফলভাবে যোগ হয়েছে!</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">আপনার হিসাব আপডেট করা হয়েছে।</p>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-xs text-slate-800 dark:text-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center text-base font-bold">{String(l?.personName || "?").charAt(0).toUpperCase()}</div>
            <div>
              <div className="font-bold text-slate-800 dark:text-gray-100">{l?.personName}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400"><i className="fa-solid fa-phone me-1"></i>{l?.phone}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">হাওলাতের ধরন</span><span className="font-bold">{loanTypeMeta(l?.type).action}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">পরিমাণ</span><span className="font-bold text-emerald-600">{l?.currency} {formatMoneyText(l?.amount, l?.currency)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">কারেন্সি</span><span className="font-bold">{l?.currency}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">তারিখ</span><span className="font-bold">{l?.loanDate}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">ওয়ালেট</span><span className="font-bold">{l?.walletName || selectedWallet?.WalletName || "—"}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Wallet Account</span><span className="font-bold">{l?.account}</span></div>
            {l?.dueDate && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">ডিউ তারিখ</span><span className="font-bold">{l.dueDate}</span></div>}
            {l?.note && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">নোট</span><span className="font-bold text-right">{l.note}</span></div>}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <button onClick={() => onDone && onShow(l)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow-md">লোন দেখুন</button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onGoHome} className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 font-bold py-2.5 rounded-xl text-xs">হোমে যান</button>
            <button onClick={resetForMore} className="bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs"><i className="fa-solid fa-plus me-1"></i>আরো হাওলাত দিন</button>
          </div>
        </div>
      </Popup>
    );
  }

  return (
    <Popup open title={isEdit ? "হাওলাত এডিট করুন" : "নতুন হাওলাত"} onClose={submitting || activeCheck === "checking" ? undefined : onCancel}>
      <div className="space-y-4">
      <StepIndicator step={step} />

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {step === 1 && (
          <>
            {isEdit ? (
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">হাওলাতের ধরন</label>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-3 py-2.5 text-xs text-slate-700 dark:text-gray-200">
                  <i className={`fa-solid ${type === "given" ? "fa-hand-holding-dollar text-rose-500" : "fa-sack-dollar text-emerald-500"} me-2`}></i>
                  {meta.action} <span className="text-[10px] text-gray-400 dark:text-gray-500">(এডিটে পরিবর্তন করা যাবে না)</span>
                </div>
              </div>
            ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">হাওলাতের ধরন</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setType("given")} className={`rounded-xl border p-3 text-left transition-all ${type === "given" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/30" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"}`}>
                  <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-sm"><i className="fa-solid fa-hand-holding-dollar"></i></div>
                  <div className="text-xs font-bold text-slate-800 dark:text-gray-100 mt-2">হাওলাত দিলাম</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">অন্যকে টাকা দিয়েছি</div>
                </button>
                <button type="button" onClick={() => setType("taken")} className={`rounded-xl border p-3 text-left transition-all ${type === "taken" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-500/30" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"}`}>
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm"><i className="fa-solid fa-sack-dollar"></i></div>
                  <div className="text-xs font-bold text-slate-800 dark:text-gray-100 mt-2">হাওলাত নিলাম</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">অন্য কাছ থেকে টাকা নিয়েছি</div>
                </button>
              </div>
            </div>
            )}

            <Field label="ব্যক্তির নাম" error={errors.personName}>
              <input type="text" value={personName} onChange={(e) => { setPersonName(e.target.value); setPersonId(""); }} placeholder="যেমন: রাহিম ভাই" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>

            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((p, i) => (
                  <button key={i} type="button" onClick={() => { setPersonName(p.personName); setPhone(p.phone || ""); setPersonId(p.personId || ""); }}
                    className="text-[10px] font-semibold bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 px-2 py-1 rounded-full">
                    {p.personName} {p.phone && <span className="text-gray-400">• {p.phone}</span>}
                  </button>
                ))}
              </div>
            )}

            <Field label="ফোন নম্বর (আবশ্যক)" error={errors.phone}>
              <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setPersonId(""); }} placeholder="যেমন: 01712345678" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label={`পরিমাণ (${currency || "..."})`} error={errors.amount}>
              <input type="number" step="any" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>

            <Field label="তারিখ" error={errors.loanDate}>
              <input type="date" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>

            <Field label="Wallet" error={errors.wallet}>
              <Select value={walletId} onChange={changeWallet}>
                {wallets.length === 0 && <option value="">কোনো Wallet এক্সেস নেই</option>}
                {wallets.map(w => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
              </Select>
            </Field>

            <Field label="Wallet Account" error={errors.account}>
              <Select value={account} onChange={setAccount}>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
              </Select>
            </Field>

            <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Currency</span>
              <span className="text-xs font-bold text-slate-800 dark:text-gray-100">{currency || "—"} <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">(Auto)</span></span>
            </div>

            <Field label="ডিউ তারিখ (ঐচ্ছিক)" error={errors.dueDate}>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>

            <Field label="রিমাইন্ডার তারিখ (ঐচ্ছিক)" error={errors.reminderDate}>
              <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>

            <Field label="নোট (ঐচ্ছিক)">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 resize-none bg-white dark:bg-gray-900 dark:text-gray-100"></textarea>
            </Field>
          </>
        )}

        {step === 3 && (
          <div className="bg-slate-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3.5 text-xs space-y-2 text-slate-800 dark:text-gray-100">
            <div className="font-bold text-sm text-slate-800 dark:text-gray-100 mb-1">বিস্তারিত নিশ্চিত করুন</div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">{String(personName || "?").charAt(0).toUpperCase()}</div>
              <div>
                <div className="font-bold text-slate-800 dark:text-gray-100">{personName}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400"><i className="fa-solid fa-phone me-1"></i>{phone}</div>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1.5">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">হাওলাতের ধরন</span><span className="font-bold">{meta.action}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">পরিমাণ</span><span className="font-bold text-emerald-600">{currency} {formatMoneyText(amount, currency)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">কারেন্সি</span><span className="font-bold">{currency}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Wallet</span><span className="font-bold">{selectedWallet?.WalletName || "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Wallet Account</span><span className="font-bold">{account}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">তারিখ</span><span className="font-bold">{loanDate}</span></div>
              {dueDate && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">ডিউ তারিখ</span><span className="font-bold">{dueDate}</span></div>}
              {note && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">নোট</span><span className="font-bold text-right">{note}</span></div>}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {step > 1 && (
            <button type="button" onClick={() => setStep(step - 1)} disabled={submitting} className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 font-bold py-3 rounded-xl text-sm px-5">পিছনে</button>
          )}
          {step < 3 ? (
            <button type="button" onClick={goNext} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-md text-sm"><i className="fa-solid fa-arrow-right me-1"></i>পরবর্তী</button>
          ) : (
            <button type="button" onClick={handleFinalSubmit} disabled={submitting || activeCheck === "checking"} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2">
              <i className={`${activeCheck === "checking" ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}`}></i> {activeCheck === "checking" ? "রেকর্ড যাচাই হচ্ছে..." : (submitting ? "সাবমিট হচ্ছে..." : (isEdit ? "আপডেট করুন" : "হাওলাত যোগ করুন"))}
            </button>
          )}
        </div>
      </form>

      {showActiveWarning && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50"></div>
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-[480px] rounded-t-2xl p-4 pb-8 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 text-2xl">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-gray-100 mt-3">সক্রিয় হাওলাত পাওয়া গেছে</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span className="font-semibold text-slate-700 dark:text-gray-200">{personName}</span>{" "}
                এর{" "}{serverActive.length}টি সক্রিয় হাওলাত আছে। আপনি কী করতে চান?
              </p>
            </div>

            <div className="space-y-2">
              <button type="button" onClick={() => { setShowActiveWarning(false); doCreate(true); }} className="w-full text-left bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl p-3 active:scale-95 transition-transform">
                <div className="text-sm font-bold text-slate-800 dark:text-gray-100"><i className="fa-solid fa-file-circle-plus text-emerald-600 me-2"></i>নতুন আলাদা লোন তৈরি করুন</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">নতুন হাওলাত হিসাবে আলাদাভাবে সংরক্ষণ হবে।</div>
              </button>
              <button type="button" onClick={chooseAddToExisting} disabled={compatibleActiveLoans.length === 0}
                className={`w-full text-left rounded-xl p-3 active:scale-95 transition-transform ${compatibleActiveLoans.length === 0 ? "bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 opacity-60" : "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800"}`}>
                <div className="text-sm font-bold text-slate-800 dark:text-gray-100"><i className={`fa-solid fa-circle-plus ${compatibleActiveLoans.length === 0 ? "text-gray-400" : "text-emerald-600"} me-2`}></i>সক্রিয় লোনের সাথে যোগ করুন</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {compatibleActiveLoans.length === 0
                    ? "এই ধরন/কারেন্সির সাথে মেলে এমন সক্রিয় লোন নেই — শুধু নতুন লোন তৈরি করা যাবে।"
                    : "নতুন টাকা ওই লোনের হিসাবের সাথে যোগ হবে।"}
                </div>
              </button>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 mt-4 pt-3 space-y-2">
              <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">সক্রিয় হাওলাত</div>
              {serverActive.map((al, i) => (
                <div key={al.id} className="flex items-center justify-between bg-slate-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${String(al.type) === "given" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{i + 1}</span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-gray-100">{loanTypeMeta(al.type).action} <span className="text-[10px] font-medium text-gray-400">{al.currency}</span></span>
                  </div>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{formatMoney(remainingOf(al), al.currency)} বাকি</span>
                </div>
              ))}
            </div>

            <button type="button" onClick={() => setShowActiveWarning(false)} className="mt-4 w-full bg-gray-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 font-bold py-2.5 rounded-xl text-xs">বাতিল</button>
          </div>
        </div>
      )}

      {activeCheck === "failed" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50"></div>
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-[480px] rounded-t-2xl p-4 pb-8 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="text-center mb-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 text-2xl">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-gray-100 mt-3">রেকর্ড যাচাই করা যায়নি</h4>
<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
  {activeCheckError ? activeCheckError : "লোনের আগের রেকর্ড যাচাই করা যায়নি। আবার চেষ্টা করুন।"}
</p>
            </div>
            <div className="space-y-2">
              <button type="button" onClick={() => { setShowActiveWarning(false); runActiveCheck(); }} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow-md">
                <i className="fa-solid fa-rotate-right me-2"></i>আবার চেষ্টা করুন
              </button>
              <button type="button" onClick={() => setActiveCheck("idle")} className="w-full bg-gray-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 font-bold py-2.5 rounded-xl text-xs">বাতিল</button>
            </div>
          </div>
        </div>
      )}

      {showLoanPicker && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLoanPicker(false)}></div>
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-[480px] rounded-t-2xl p-4 pb-8 shadow-2xl max-h-[75vh] overflow-y-auto">
            <div className="text-xs font-bold text-slate-700 dark:text-gray-200 mb-1">কোন লোনে যোগ করবেন?</div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">নিচের যেকোনো একটি সক্রিয় লোন নির্বাচন করুন।</p>
            <div className="space-y-2">
              {compatibleActiveLoans.map((al) => (
                <button key={al.id} type="button" onClick={() => { setShowLoanPicker(false); openAddFlow(al); }} className="w-full text-left bg-slate-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl p-3 active:scale-95 transition-transform">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-gray-100">{loanTypeMeta(al.type).action}</span>
                    <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{formatMoney(remainingOf(al), al.currency)} বাকি</span>
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                    মোট: {formatMoney(totalAmountOf(al), al.currency)} • ফেরত: {formatMoney(al.repaid, al.currency)}
                  </div>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowLoanPicker(false)} className="mt-3 w-full bg-gray-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 font-bold py-2.5 rounded-xl text-xs">বাতিল</button>
          </div>
        </div>
      )}

      {addTarget && !addResult && (
        <LoanAddForm
          loan={addTarget.loan}
          prefill={addTarget}
          wallets={wallets}
          currentUser={currentUser}
          person={{ personName: personName.trim(), phone: normalizePhone(phone), personId: resolvedPersonId }}
          onCancel={() => setAddTarget(null)}
          onSave={(formData) => {
            // Goes through createLoan (mode=ADD_TO_EXISTING_LOAN) so the backend
            // re-validates the person/type/paid state authoritatively.
            return onSave(formData).then(handleAddToLoanSaved).catch(() => {});
          }}
        />
      )}
      </div>
    </Popup>
  );
}

function formatMoneyText(amount, currency) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}