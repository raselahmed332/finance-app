import { useMemo, useState } from "react";
import Select from "./Select.jsx";
import { isValidPhone, knownPeople, loanTypeMeta, todayStr } from "../utils/loan.js";

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

export default function LoanForm({ wallets, loans, loan, onSave, onCancel, onDone, onGoHome, onShow }) {
  const isEdit = !!loan;
  const [step, setStep] = useState(1);
  const [type, setType] = useState(loan?.type || "given");
  const [personName, setPersonName] = useState(loan?.personName || "");
  const [phone, setPhone] = useState(loan?.phone || "");
  const [amount, setAmount] = useState(loan ? String(loan.amount) : "");
  const [loanDate, setLoanDate] = useState(loan?.loanDate || todayStr());
  const [dueDate, setDueDate] = useState(loan?.dueDate || "");
  const [reminderDate, setReminderDate] = useState(loan?.reminderDate || "");
  const [walletId, setWalletId] = useState(loan?.walletId || wallets[0]?.WalletID || "");
  const [account, setAccount] = useState(loan?.account || "Cash");
  const [note, setNote] = useState(loan?.note || "");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdLoan, setCreatedLoan] = useState(null);
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

  const changeWallet = (id) => {
    setWalletId(id);
    setAccount("Cash");
  };

  const validateStep1 = () => {
    const e = { ...errors };
    if (!personName.trim()) e.personName = "ব্যক্তির নাম লিখুন।";
    else delete e.personName;
    if (!phone.trim()) e.phone = "ফোন নম্বর আবশ্যক।";
    else if (!isValidPhone(phone)) e.phone = "সঠিক ফোন নম্বর দিন।";
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

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (submitting) return;
    if (step !== 3) { goNext(); return; }
    const payload = {
      type, personName: personName.trim(), phone: phone.trim(),
      amount, currency, walletId, walletName: selectedWallet?.WalletName,
      account, loanDate, dueDate, reminderDate, note: note.trim(),
      clientId,
    };
    if (isEdit) payload.id = loan.id;
    setSubmitting(true);
    onSave(payload).then((res) => {
      if (res && res.status === "SUCCESS") {
        if (isEdit) onDone();
        else { setSuccess(true); setCreatedLoan(res.loan || payload); }
      }
      setSubmitting(false);
    }).catch(() => setSubmitting(false));
  };

  const resetForMore = () => {
    setPersonName(""); setPhone(""); setAmount(""); setDueDate(""); setReminderDate("");
    setNote(""); setErrors({}); setSuccess(false); setCreatedLoan(null); setStep(1);
    setLoanDate(todayStr());
    setClientId(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "l" + Date.now() + Math.random().toString(36).slice(2));
  };

  if (success) {
    const l = createdLoan;
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-3xl">
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base mt-3">হাওলাত সফলভাবে যোগ হয়েছে!</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">আপনার হিসাব আপডেট করা হয়েছে।</p>
        </div>

        <div className="bg-slate-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-xs">
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

        <div className="space-y-2">
          <button onClick={() => onDone && onShow(l)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow-md">লোন দেখুন</button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onGoHome} className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 font-bold py-2.5 rounded-xl text-xs">হোমে যান</button>
            <button onClick={resetForMore} className="bg-slate-800 text-white font-bold py-2.5 rounded-xl text-xs"><i className="fa-solid fa-plus me-1"></i>আরো হাওলাত দিন</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <button onClick={onCancel} className="text-gray-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base text-center flex-1 text-emerald-600">
          {isEdit ? "হাওলাত এডিট করুন" : "নতুন হাওলাত"}
        </h3>
        <div className="w-5"></div>
      </div>

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
              <input type="text" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="যেমন: রাহিম ভাই" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
            </Field>

            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((p, i) => (
                  <button key={i} type="button" onClick={() => { setPersonName(p.personName); setPhone(p.phone || ""); }}
                    className="text-[10px] font-semibold bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 px-2 py-1 rounded-full">
                    {p.personName} {p.phone && <span className="text-gray-400">• {p.phone}</span>}
                  </button>
                ))}
              </div>
            )}

            <Field label="ফোন নম্বর (আবশ্যক)" error={errors.phone}>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="যেমন: 01712345678" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
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
          <div className="bg-slate-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3.5 text-xs space-y-2">
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
            <button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2">
              <i className="fa-solid fa-floppy-disk"></i> {submitting ? "সাবমিট হচ্ছে..." : (isEdit ? "আপডেট করুন" : "হাওলাত যোগ করুন")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function formatMoneyText(amount, currency) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}