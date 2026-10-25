import { useMemo, useState } from "react";
import Select from "./Select.jsx";
import AccountSelect from "./AccountSelect.jsx";
import Popup from "./Popup.jsx";
import { Field } from "./FormField.jsx";
import { formatMoney, todayStr } from "../utils/loan.js";
import { accountName } from "../utils/accounts.js";

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
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${done ? "bg-[var(--ah-brand)] border-[var(--ah-brand)] text-white" : active ? "bg-[var(--ah-brand)] border-[var(--ah-brand)] text-white shadow-md" : "bg-[var(--ah-surface)] border-[var(--ah-border-strong)] text-ink-3"}`}>
                {done ? <i className="fa-solid fa-check"></i> : n}
              </div>
              <span className={`mt-1 text-[9px] font-semibold whitespace-nowrap ${active ? "text-[var(--ah-success)]" : "text-ink-3"}`}>{label}</span>
            </div>
            {n < 3 && <div className={`flex-1 h-0.5 mx-1.5 -mt-4 rounded ${done ? "bg-[var(--ah-success)]" : "bg-[var(--ah-surface-3)]"}`}></div>}
          </div>
        );
      })}
    </div>
  );
}

export const SAVINGS_TYPE_META = {
  GROUP: { label: "গ্রুপ সঞ্চয় (কমিটি)", short: "গ্রুপ", icon: "fa-people-group", desc: "কয়েকজন মিলে পালাক্রমে জমা ও গ্রহণ", perm: "SAVINGS_GROUP" },
  FIXED: { label: "মেয়াদি সঞ্চয়", short: "মেয়াদি", icon: "fa-calendar-check", desc: "নির্দিষ্ট মেয়াদের জন্য নিয়মিত জমা", perm: "SAVINGS_FIXED" },
  FLEXIBLE: { label: "নমনীয় সঞ্চয়", short: "নমনীয়", icon: "fa-wallet", desc: "ইচ্ছেমতো জমা ও উত্তোলন", perm: "SAVINGS_FLEXIBLE" },
};

const FREQUENCIES = [
  { value: "WEEKLY", label: "সাপ্তাহিক" },
  { value: "MONTHLY", label: "মাসিক" },
  { value: "YEARLY", label: "বার্ষিক" },
];

function nextClientId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "s" + Date.now() + Math.random().toString(36).slice(2);
}

function moneyText(amount, currency) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SavingsForm({ can, wallets, currentUser, onSave, onCancel, onDone, onGoHome, onShow }) {
  const allowedTypes = useMemo(
    () => ["GROUP", "FIXED", "FLEXIBLE"].filter((t) => (can ? can(SAVINGS_TYPE_META[t].perm) : false)),
    [can],
  );

  const [type, setType] = useState(allowedTypes.length === 1 ? allowedTypes[0] : (allowedTypes[0] || "GROUP"));
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [walletId, setWalletId] = useState("");
  const [account, setAccount] = useState("");
  const [startDate, setStartDate] = useState(todayStr());

  // Group
  const [contribution, setContribution] = useState("");
  const [rounds, setRounds] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [members, setMembers] = useState([]);
  const [memberDraft, setMemberDraft] = useState("");
  const [groupNote, setGroupNote] = useState("");

  // Fixed
  const [amount, setAmount] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [fixedNote, setFixedNote] = useState("");

  // Flexible
  const [flexNote, setFlexNote] = useState("");

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdPlan, setCreatedPlan] = useState(null);
  const [clientId, setClientId] = useState(nextClientId);

  const selectedWallet = (wallets || []).find((w) => String(w.WalletID) === String(walletId));
  const currency = selectedWallet?.Currency || "";
  const meta = SAVINGS_TYPE_META[type];
  // Rounds are derived from the member count when members exist (one round per member).
  const derivedRounds = type === "GROUP" && members.length > 0 ? members.length : null;
  const effectiveRounds = derivedRounds || rounds;

  const changeWallet = (id) => {
    setWalletId(id);
    setAccount("");
  };

  const addMember = () => {
    const n = memberDraft.trim();
    if (!n) return;
    setMembers((prev) => [...prev, n]);
    setMemberDraft("");
  };

  const removeMember = (idx) => setMembers((prev) => prev.filter((_, i) => i !== idx));

  const validateStep1 = () => {
    const e = { ...errors };
    if (!allowedTypes.length) e.type = "সঞ্চয় তৈরির অনুমতি আপনার নেই।";
    else delete e.type;
    if (!SAVINGS_TYPE_META[type] || !allowedTypes.includes(type)) e.type = "সঞ্চয়ের ধরন নির্বাচন করুন।";
    if (!name.trim()) e.name = "সঞ্চয় পরিকল্পনার একটি নাম দিন।";
    else if (name.trim().length > 80) e.name = "নাম ৮০ অক্ষরের বেশি হতে পারবে না।";
    else delete e.name;
    setErrors(e);
    return !e.type && !e.name;
  };

  const validateStep2 = () => {
    const e = { ...errors };
    if (!walletId) e.wallet = "Wallet নির্বাচন করুন।";
    else delete e.wallet;
    if (!account) e.account = "Wallet Account নির্বাচন করুন।";
    else delete e.account;
    if (!startDate) e.startDate = "শুরুর তারিখ নির্বাচন করুন।";
    else delete e.startDate;

    if (type === "GROUP") {
      const c = Number(contribution);
      if (!contribution || contribution === "") e.contribution = "কিস্তির পরিমাণ লিখুন।";
      else if (!Number.isFinite(c) || c <= 0) e.contribution = "পরিমাণ ০-এর বেশি হতে হবে।";
      else delete e.contribution;
      const r = parseInt(rounds, 10);
      if (derivedRounds) delete e.rounds;
      else if (!rounds || rounds === "") e.rounds = "রাউন্ড সংখ্যা লিখুন।";
      else if (!Number.isFinite(r) || r < 1 || r > 1000) e.rounds = "রাউন্ড ১ থেকে ১০০০ এর মধ্যে দিন।";
      else delete e.rounds;
    } else if (type === "FIXED") {
      const a = Number(amount);
      if (!amount || amount === "") e.amount = "টাকার পরিমাণ লিখুন।";
      else if (!Number.isFinite(a) || a <= 0) e.amount = "পরিমাণ ০-এর বেশি হতে হবে।";
      else delete e.amount;
      const m = parseInt(durationMonths, 10);
      if (!durationMonths || durationMonths === "") e.durationMonths = "মেয়াদ (মাস) লিখুন।";
      else if (!Number.isFinite(m) || m < 1 || m > 600) e.durationMonths = "মেয়াদ ১ থেকে ৬০০ মাসের মধ্যে দিন।";
      else delete e.durationMonths;
      if (dueDay !== "") {
        const d = parseInt(dueDay, 10);
        if (!Number.isFinite(d) || d < 1 || d > 31) e.dueDay = "কিস্তির দিন ১ থেকে ৩১ এর মধ্যে দিন।";
        else delete e.dueDay;
      } else delete e.dueDay;
    }
    setErrors(e);
    return Object.keys(e).filter((k) => k === "wallet" || k === "account" || k === "startDate" || k === "contribution" || k === "rounds" || k === "amount" || k === "durationMonths" || k === "dueDay").length === 0;
  };

  const goNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (submitting) return;
    if (step !== 3) goNext();
  };

  const doCreate = () => {
    const payload = {
      type, name: name.trim(), walletId, account, currency, startDate, clientId,
    };
    if (type === "GROUP") {
      payload.contribution = contribution;
      payload.rounds = effectiveRounds;
      payload.frequency = frequency;
      payload.groupNote = groupNote.trim();
      payload.members = members.map((m) => ({ name: m }));
      payload.memberCount = members.length;
    } else if (type === "FIXED") {
      payload.amount = amount;
      payload.durationMonths = durationMonths;
      payload.dueDay = dueDay === "" ? 0 : dueDay;
      payload.fixedNote = fixedNote.trim();
    } else {
      payload.flexNote = flexNote.trim();
    }
    setSubmitting(true);
    onSave(payload)
      .then((res) => {
        if (res && res.status === "SUCCESS") {
          setSuccess(true);
          setCreatedPlan(res.plan || payload);
        }
        setSubmitting(false);
      })
      .catch(() => setSubmitting(false));
  };

  const resetForMore = () => {
    setName("");
    setStep(1);
    setContribution(""); setRounds(""); setFrequency("MONTHLY"); setMembers([]); setMemberDraft(""); setGroupNote("");
    setAmount(""); setDurationMonths(""); setDueDay(""); setFixedNote("");
    setFlexNote("");
    setErrors({}); setSuccess(false); setCreatedPlan(null);
    setStartDate(todayStr());
    setClientId(nextClientId());
  };

  if (success) {
    const p = createdPlan || {};
    const cur = p.Currency || currency;
    return (
      <Popup open title="নতুন সঞ্চয়" onClose={onCancel}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--ah-success-soft)] flex items-center justify-center text-[var(--ah-success)] text-3xl">
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <h3 className="font-bold text-ink text-base mt-3">সঞ্চয় পরিকল্পনা তৈরি হয়েছে!</h3>
          <p className="text-xs text-ink-3 mt-1">এখন জমা/কিস্তির লেনদেন রেকর্ড করতে পারবেন।</p>
        </div>

        <div className="bg-[var(--ah-surface-inset)] border border-[var(--ah-border)] rounded-xl p-3 text-xs text-ink space-y-1.5">
          <div className="flex justify-between"><span className="text-ink-3">ধরন</span><span className="font-bold">{meta.label}</span></div>
          <div className="flex justify-between"><span className="text-ink-3">নাম</span><span className="font-bold text-right">{p.Name || name}</span></div>
          {type === "GROUP" && <div className="flex justify-between"><span className="text-ink-3">কিস্তি</span><span className="font-bold">{cur} {moneyText(contribution)} × {effectiveRounds}</span></div>}
          {type === "FIXED" && <div className="flex justify-between"><span className="text-ink-3">পরিমাণ</span><span className="font-bold">{cur} {moneyText(amount)} / {durationMonths} মাস</span></div>}
          <div className="flex justify-between"><span className="text-ink-3">Wallet</span><span className="font-bold">{p.WalletName || selectedWallet?.WalletName || "—"}</span></div>
          <div className="flex justify-between"><span className="text-ink-3">Wallet Account</span><span className="font-bold">{accountName(p.WalletID, p.Account || account)}</span></div>
          <div className="flex justify-between"><span className="text-ink-3">কারেন্সি</span><span className="font-bold">{cur}</span></div>
        </div>

        <div className="space-y-2 pt-1">
          <button onClick={() => onDone && onShow(p)} className="w-full bg-[var(--ah-brand)] hover:bg-[var(--ah-brand-strong)] text-white font-bold py-3 rounded-xl text-sm shadow-md">সঞ্চয় দেখুন</button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onGoHome} className="bg-[var(--ah-surface)] border border-[var(--ah-border-strong)] text-ink font-bold py-2.5 rounded-xl text-xs">হোমে যান</button>
            <button onClick={resetForMore} className="bg-[var(--ah-header)] text-white font-bold py-2.5 rounded-xl text-xs"><i className="fa-solid fa-plus me-1"></i>আরো সঞ্চয়</button>
          </div>
        </div>
      </Popup>
    );
  }

  return (
    <Popup open title="নতুন সঞ্চয়" onClose={submitting ? undefined : onCancel}>
      <div className="space-y-4">
        <StepIndicator step={step} />

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {step === 1 && (
            <>
              <div>
                <label className="label.5">সঞ্চয়ের ধরন</label>
                {allowedTypes.length === 0 ? (
                  <div className="text-xs text-[var(--ah-danger)]">সঞ্চয় তৈরির অনুমতি আপনার নেই।</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {allowedTypes.map((t) => {
                      const m = SAVINGS_TYPE_META[t];
                      const active = type === t;
                      return (
                        <button key={t} type="button" onClick={() => setType(t)} className={`rounded-xl border p-3 text-left transition-all flex items-center gap-3 ${active ? "border-emerald-500 bg-[var(--ah-success-soft)] ring-2 ring-emerald-500/30" : "border-[var(--ah-border)] bg-[var(--ah-surface)]"}`}>
                          <div className="w-9 h-9 shrink-0 rounded-lg bg-[var(--ah-success-soft)] text-[var(--ah-success)] flex items-center justify-center"><i className={`fa-solid ${m.icon}`}></i></div>
                          <div>
                            <div className="text-xs font-bold text-ink">{m.label}</div>
                            <div className="text-[10px] text-ink-3 mt-0.5">{m.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.type && <div className="text-[10px] text-[var(--ah-danger)] mt-1">{errors.type}</div>}
              </div>

              <Field label="পরিকল্পনার নাম" error={errors.name}>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: পারিবারিক সঞ্চয়" className="input" />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Wallet" error={errors.wallet}>
                  <Select value={walletId} onChange={changeWallet}>
                    <option value="">Select wallet</option>
                    {(wallets || []).map((w) => <option key={w.WalletID} value={w.WalletID}>{w.WalletName} ({w.Currency})</option>)}
                  </Select>
                </Field>
                <Field label="Wallet Account" error={errors.account}>
                  <AccountSelect walletId={walletId} value={account} onChange={setAccount} />
                </Field>
              </div>

              <div className="bg-[var(--ah-surface-2)] border border-[var(--ah-border)] rounded-xl px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-3">Currency</span>
                <span className="text-xs font-bold text-ink">{currency || "—"} <span className="text-[10px] font-medium text-ink-3">(Auto)</span></span>
              </div>

              <Field label="শুরুর তারিখ" error={errors.startDate}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
              </Field>

              {type === "GROUP" && (
                <>
              <div className="grid grid-cols-2 gap-2">
                <Field label={`কিস্তির পরিমাণ (${currency || "..."})`} error={errors.contribution}>
                  <input type="number" step="any" min="0.01" value={contribution} onChange={(e) => setContribution(e.target.value)} placeholder="0.00" className="w-full border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-sm font-semibold focus:ring-[var(--ah-brand-ring)] bg-[var(--ah-surface)] text-ink" />
                </Field>
                {derivedRounds ? (
                  <Field label="রাউন্ড">
                    <div className="w-full border border-[var(--ah-border)] border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-sm bg-[var(--ah-surface-2)] dark:bg-[var(--ah-header-2)] text-ink-3">
                      {derivedRounds} <span className="text-[10px]">(সদস্য সংখ্যা)</span>
                    </div>
                  </Field>
                ) : (
                  <Field label="রাউন্ড সংখ্যা" error={errors.rounds}>
                    <input type="number" min="1" value={rounds} onChange={(e) => setRounds(e.target.value)} placeholder="0" className="input" />
                  </Field>
                )}
              </div>
              {members.length === 0 && (
                <div className="text-[10px] text-ink-3 -mt-1">সদস্য যোগ করলে রাউন্ড স্বয়ংক্রিয়ভাবে সদস্য সংখ্যার সমান হয়ে যাবে।</div>
              )}

                  <Field label="ফ্রিকোয়েন্সি">
                    <Select value={frequency} onChange={setFrequency}>
                      {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </Select>
                  </Field>

                  <Field label="সদস্য (ঐচ্ছিক)">
                    <div className="flex gap-2">
                      <input type="text" value={memberDraft} onChange={(e) => setMemberDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMember(); } }} placeholder="সদস্যের নাম" className="flex-1 border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-sm focus:ring-[var(--ah-brand-ring)] bg-[var(--ah-surface)] text-ink" />
                      <button type="button" onClick={addMember} className="bg-[var(--ah-header)] text-white font-bold px-4 rounded-xl text-sm"><i className="fa-solid fa-plus"></i></button>
                    </div>
                  </Field>
                  {members.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-[var(--ah-surface-3)] text-ink-2 px-2.5 py-1 rounded-full">
                          {i + 1}. {m}
                          <button type="button" onClick={() => removeMember(i)} className="text-ink-3 hover:text-[var(--ah-danger)]"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                        </span>
                      ))}
                    </div>
                  )}

                  <Field label="নোট (ঐচ্ছিক)">
                    <textarea value={groupNote} onChange={(e) => setGroupNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="textarea"></textarea>
                  </Field>
                </>
              )}

              {type === "FIXED" && (
                <>
                  <Field label={`কিস্তির পরিমাণ (${currency || "..."})`} error={errors.amount}>
                    <input type="number" step="any" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-[var(--ah-border-strong)] rounded-xl px-3 py-2 text-sm font-semibold focus:ring-[var(--ah-brand-ring)] bg-[var(--ah-surface)] text-ink" />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="মেয়াদ (মাস)" error={errors.durationMonths}>
                      <input type="number" step="1" min="1" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} placeholder="যেমন: ১২" className="input" />
                    </Field>
                    <Field label="কিস্তির দিন (ঐচ্ছিক)" error={errors.dueDay}>
                      <input type="number" step="1" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="১-৩১" className="input" />
                    </Field>
                  </div>

                  <Field label="নোট (ঐচ্ছিক)">
                    <textarea value={fixedNote} onChange={(e) => setFixedNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="textarea"></textarea>
                  </Field>
                </>
              )}

              {type === "FLEXIBLE" && (
                <Field label="নোট (ঐচ্ছিক)">
                  <textarea value={flexNote} onChange={(e) => setFlexNote(e.target.value)} placeholder="নোট লিখুন..." rows="2" className="textarea"></textarea>
                </Field>
              )}
            </>
          )}

          {step === 3 && (
            <div className="bg-[var(--ah-surface-inset)] border border-[var(--ah-border)] rounded-xl p-3.5 text-xs space-y-2 text-ink">
              <div className="font-bold text-sm text-ink mb-1">বিস্তারিত নিশ্চিত করুন</div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[var(--ah-brand)] text-white flex items-center justify-center text-sm"><i className={`fa-solid ${meta.icon}`}></i></div>
                <div>
                  <div className="font-bold text-ink">{name}</div>
                  <div className="text-[10px] text-ink-3">{meta.label}</div>
                </div>
              </div>
              <div className="border-t border-[var(--ah-border)] pt-2 space-y-1.5">
                {type === "GROUP" && (
                  <>
                    <div className="flex justify-between"><span className="text-ink-3">কিস্তি</span><span className="font-bold">{currency} {moneyText(contribution)}</span></div>
                    <div className="flex justify-between"><span className="text-ink-3">রাউন্ড</span><span className="font-bold">{effectiveRounds}</span></div>
                    <div className="flex justify-between"><span className="text-ink-3">ফ্রিকোয়েন্সি</span><span className="font-bold">{(FREQUENCIES.find((f) => f.value === frequency) || {}).label || frequency}</span></div>
                    <div className="flex justify-between"><span className="text-ink-3">সদস্য</span><span className="font-bold">{members.length}</span></div>
                  </>
                )}
                {type === "FIXED" && (
                  <>
                    <div className="flex justify-between"><span className="text-ink-3">কিস্তি</span><span className="font-bold">{currency} {moneyText(amount)}</span></div>
                    <div className="flex justify-between"><span className="text-ink-3">মেয়াদ</span><span className="font-bold">{durationMonths} মাস</span></div>
                    {dueDay !== "" && <div className="flex justify-between"><span className="text-ink-3">কিস্তির দিন</span><span className="font-bold">{dueDay}</span></div>}
                  </>
                )}
                <div className="flex justify-between"><span className="text-ink-3">Wallet</span><span className="font-bold">{selectedWallet?.WalletName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-ink-3">Wallet Account</span><span className="font-bold">{accountName(walletId, account)}</span></div>
                <div className="flex justify-between"><span className="text-ink-3">কারেন্সি</span><span className="font-bold">{currency}</span></div>
                <div className="flex justify-between"><span className="text-ink-3">শুরুর তারিখ</span><span className="font-bold">{startDate}</span></div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} disabled={submitting} className="bg-[var(--ah-surface)] border border-[var(--ah-border-strong)] text-ink font-bold py-3 rounded-xl text-sm px-5">পিছনে</button>
            )}
            {step < 3 ? (
              <button type="button" onClick={goNext} disabled={allowedTypes.length === 0} className="flex-1 bg-[var(--ah-brand)] hover:bg-[var(--ah-brand-strong)] disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm"><i className="fa-solid fa-arrow-right me-1"></i>পরবর্তী</button>
            ) : (
              <button type="button" onClick={doCreate} disabled={submitting} className="flex-1 bg-[var(--ah-brand)] hover:bg-[var(--ah-brand-strong)] disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2">
                <i className={submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}></i> {submitting ? "সাবমিট হচ্ছে..." : "সঞ্চয় তৈরি করুন"}
              </button>
            )}
          </div>
        </form>
      </div>
    </Popup>
  );
}
