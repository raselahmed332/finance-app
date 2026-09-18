import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  formatMoney, fmtDate, statusOf, STATUS_META, dateInRange,
  STATUS_CHOICES, DATE_CHOICES, avatarClass, initialOf, loanTypeMeta, remainingOf,
} from "../utils/loan.js";

function SumRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <span className={`text-xs font-bold ${accent}`}>{value}</span>
    </div>
  );
}

function SummaryCard({ meta, total, remaining }) {
  const isGiven = meta.short === "দিয়েছি";
  const accent = isGiven
    ? { tint: "bg-rose-50 dark:bg-rose-900/20", border: "border-rose-200 dark:border-rose-800", icon: "bg-rose-600", value: "text-rose-600 dark:text-rose-400", remain: "text-slate-800 dark:text-gray-100" }
    : { tint: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", icon: "bg-emerald-600", value: "text-emerald-600 dark:text-emerald-400", remain: "text-slate-800 dark:text-gray-100" };
  const curList = Object.keys(remaining);

  return (
    <div className={`${accent.tint} ${accent.border} border rounded-2xl p-3.5 shadow-sm`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-8 h-8 rounded-lg ${accent.icon} text-white flex items-center justify-center text-xs shadow-sm`}>
          <i className={`fa-solid ${isGiven ? "fa-hand-holding-dollar" : "fa-sack-dollar"}`}></i>
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-gray-100">{meta.label}</span>
      </div>

      {curList.length === 0 ? (
        <div className="text-[11px] text-gray-400 dark:text-gray-500 py-2">কোনো হিসাব নেই</div>
      ) : (
        <>
          <div className="border-t border-gray-200/60 dark:border-gray-700 mt-1.5 pt-1">
            {curList.map((cur) => (
              <SumRow key={cur} label={`মোট (${cur})`} value={formatMoney(total[cur], cur)} accent={accent.value} />
            ))}
          </div>
          <div className="border-t border-gray-200/60 dark:border-gray-700 mt-1 pt-1">
            {curList.map((cur) => (
              <SumRow key={cur} label={meta.outstandingLabel} value={formatMoney(remaining[cur], cur)} accent={accent.remain} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LoanCard({ loan, onSelect }) {
  const meta = loanTypeMeta(loan.type);
  const status = statusOf(loan);
  const statusMeta = STATUS_META[status];
  const remaining = remainingOf(loan);

  return (
    <button onClick={() => onSelect(loan.id)} className="w-full text-left bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-3.5 shadow-2xs hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-full ${avatarClass(loan.personName)} text-white flex items-center justify-center text-lg font-bold flex-shrink-0 shadow-sm`}>
          {initialOf(loan.personName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-slate-800 dark:text-gray-100 truncate">{loan.personName}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
            <i className="fa-solid fa-phone text-[9px]"></i>
            {loan.phone || "নাম্বার নেই"}
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ml-1 ${meta.short === "দিয়েছি" ? "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"}`}>
              {meta.short}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusMeta.bg} ${statusMeta.text}`}>{statusMeta.label}</span>
          <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500">{loan.currency}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-slate-50 dark:bg-gray-950 rounded-xl p-2 text-center border border-gray-100 dark:border-gray-800">
          <div className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">{meta.totalLabel}</div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-gray-100 mt-0.5">{formatMoney(loan.amount, loan.currency)}</div>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2 text-center border border-emerald-100 dark:border-emerald-800">
          <div className="text-[9px] text-emerald-700 dark:text-emerald-400 font-medium">{meta.repaidLabel}</div>
          <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatMoney(loan.repaid, loan.currency)}</div>
        </div>
        <div className={`rounded-xl p-2 text-center border ${remaining > 0 ? "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800" : "bg-slate-50 dark:bg-gray-950 border-gray-100 dark:border-gray-800"}`}>
          <div className="text-[9px] text-amber-700 dark:text-amber-400 font-medium">{meta.remainingLabel}</div>
          <div className={`text-[11px] font-bold mt-0.5 ${remaining > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-gray-400"}`}>{formatMoney(remaining, loan.currency)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-2">
          <span><i className="fa-solid fa-calendar-day me-1"></i>{fmtDate(loan.loanDate)}</span>
          {loan.dueDate && <span><i className="fa-solid fa-hourglass-half me-1"></i>{fmtDate(loan.dueDate)}</span>}
        </div>
        <span className="text-gray-300 dark:text-gray-600">
          <i className="fa-solid fa-chevron-right text-xs"></i>
        </span>
      </div>
    </button>
  );
}

function FilterSheet({ open, onClose, onApply, onReset, currencies }) {
  const [status, setStatus] = useState("all");
  const [dateOption, setDateOption] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [currency, setCurrency] = useState("all");
  const [remaining, setRemaining] = useState("all");

  useEffect(() => {
    if (open) {
      setStatus("all"); setDateOption("all"); setFrom(""); setTo("");
      setCurrency("all"); setRemaining("all");
    }
  }, [open]);

  if (!open) return null;

  const chip = (active, onClick, label) => (
    <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${active ? "bg-emerald-600 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-gray-900 w-full max-w-[480px] rounded-t-2xl p-4 pb-6 shadow-2xl max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-sm text-slate-800 dark:text-gray-100">ফিল্টার</h4>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5">STATUS</div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {STATUS_CHOICES.map((s) => (
            <span key={s.value}>{chip(status === s.value, () => setStatus(s.value), s.label)}</span>
          ))}
        </div>

        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5">DATE</div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {DATE_CHOICES.map((d) => (
            <span key={d.value}>{chip(dateOption === d.value, () => setDateOption(d.value), d.label)}</span>
          ))}
        </div>
        {dateOption === "custom" && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <label className="block">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">তারিখ (থেকে)</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
            </label>
            <label className="block">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 block">তারিখ (পর্যন্ত)</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-gray-900 dark:text-gray-100" />
            </label>
          </div>
        )}

        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5">CURRENCY</div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span>{chip(currency === "all", () => setCurrency("all"), "সব")}</span>
          {currencies.map((c) => (
            <span key={c}>{chip(currency === c, () => setCurrency(c), c)}</span>
          ))}
        </div>

        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5">REMAINING</div>
        <div className="flex flex-wrap gap-1.5 mb-5">
          <span>{chip(remaining === "all", () => setRemaining("all"), "সব")}</span>
          <span>{chip(remaining === "due", () => setRemaining("due"), "টাকা বাকি আছে")}</span>
          <span>{chip(remaining === "done", () => setRemaining("done"), "সম্পূর্ণ ফেরত হয়েছে")}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { onReset(); onClose(); }} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold py-2.5 rounded-xl text-xs">রিসেট</button>
          <button onClick={() => { onApply({ status, dateOption, from, to, currency, remaining }); onClose(); }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs">ফিল্টার করুন</button>
        </div>
      </div>
    </div>
  );
}

export default function LoanDashboardView({ currentUser, loans, onLoansChange, can, onAdd, onSelect }) {
  const [tab, setTab] = useState("given");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api.getLoans(currentUser.username, "given", {}),
      api.getLoans(currentUser.username, "taken", {}),
    ]).then(([givenRes, takenRes]) => {
      if (!active) return;
      const givenOk = givenRes && (givenRes.status === "SUCCESS" || Array.isArray(givenRes.loans));
      const takenOk = takenRes && (takenRes.status === "SUCCESS" || Array.isArray(takenRes.loans));
      if (givenOk && takenOk) {
        onLoansChange([...(givenRes.loans || []), ...(takenRes.loans || [])]);
        setLoading(false);
      } else {
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.username]);

  const allLoans = useMemo(() => Array.isArray(loans) ? loans : [], [loans]);

  const totalBy = (list, keyOrFn) => list.reduce((acc, l) => {
    const value = typeof keyOrFn === "function" ? Number(keyOrFn(l)) || 0 : Number(l[keyOrFn]) || 0;
    acc[l.currency] = (acc[l.currency] || 0) + value;
    return acc;
  }, {});

  const given = useMemo(() => allLoans.filter(l => l.type === "given"), [allLoans]);
  const taken = useMemo(() => allLoans.filter(l => l.type === "taken"), [allLoans]);
  const givenTotal = useMemo(() => totalBy(given, "amount"), [given]);
  const givenRemain = useMemo(() => totalBy(given, remainingOf) || {}, [given]);
  const takenTotal = useMemo(() => totalBy(taken, "amount"), [taken]);
  const takenRemain = useMemo(() => totalBy(taken, remainingOf) || {}, [taken]);

  const currencies = useMemo(() => [...new Set(allLoans.map(l => l.currency).filter(Boolean))], [allLoans]);

  const list = tab === "given" ? given : taken;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((l) => {
      if (q) {
        const nameHit = String(l.personName || "").toLowerCase().includes(q);
        const phoneHit = String(l.phone || "").toLowerCase().includes(q);
        if (!nameHit && !phoneHit) return false;
      }
      if (!filters) return true;
      const status = statusOf(l);
      if (filters.status !== "all" && status !== filters.status) return false;
      if (!dateInRange(l.loanDate, filters.dateOption ? { option: filters.dateOption, from: filters.from, to: filters.to } : null)) return false;
      if (filters.currency !== "all" && l.currency !== filters.currency) return false;
      const remaining = remainingOf(l);
      if (filters.remaining === "due" && remaining <= 0.005) return false;
      if (filters.remaining === "done" && remaining > 0.005) return false;
      return true;
    });
  }, [list, search, filters]);

  const activeFilterCount = useMemo(() => {
    if (!filters) return 0;
    let n = 0;
    if (filters.status !== "all") n++;
    if (filters.dateOption && filters.dateOption !== "all") n++;
    if (filters.currency !== "all") n++;
    if (filters.remaining !== "all") n++;
    return n;
  }, [filters]);

  const hasAnyLoan = allLoans.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base flex items-center gap-2">
          <i className="fa-solid fa-hand-holding-dollar text-emerald-600"></i> হাওলাত (Loan)
        </h3>
        <button onClick={onAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform">
          <i className="fa-solid fa-plus"></i> হাওলাত যোগ করুন
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <SummaryCard meta={loanTypeMeta("given")} total={givenTotal} remaining={givenRemain} />
        <SummaryCard meta={loanTypeMeta("taken")} total={takenTotal} remaining={takenRemain} />
      </div>

      <div className="grid grid-cols-2 gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-bold">
        {["given", "taken"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`py-2 rounded-lg transition-all ${tab === t ? "bg-emerald-600 text-white shadow-sm" : "text-gray-600 dark:text-gray-400"}`}>
            {loanTypeMeta(t).label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-gray-400 dark:text-gray-500 text-xs"></i>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ব্যক্তির নাম দিয়ে খুঁজুন..."
            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>
        <button onClick={() => setShowFilter(true)} className="relative bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-1.5 active:scale-95 transition-transform">
          <i className="fa-solid fa-arrow-up-wide-short text-emerald-600"></i>
          Filter
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {loading && (
        <div className="text-center py-10">
          <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">লোড হচ্ছে...</div>
        </div>
      )}

      {!loading && !hasAnyLoan && (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="text-5xl mb-3">📒</div>
          <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">এখনো কোনো হাওলাতের হিসাব নেই</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-4">প্রথম হাওলাত যোগ করে শুরু করুন।</div>
          <button onClick={onAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 mx-auto shadow-sm">
            <i className="fa-solid fa-plus"></i> হাওলাত যোগ করুন
          </button>
        </div>
      )}

      {!loading && hasAnyLoan && filtered.length === 0 && (
        <div className="text-center py-10 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="text-4xl mb-2">🔍</div>
          <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">কোনো হাওলাত পাওয়া যায়নি</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">সার্চ বা ফিল্টার পরিবর্তন করুন।</div>
          {(search || activeFilterCount > 0) && (
            <button onClick={() => { setSearch(""); setFilters(null); }} className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-1.5">
              সার্চ ও ফিল্টার রিসেট করুন
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((l) => (
            <LoanCard key={l.id} loan={l} onSelect={onSelect} />
          ))}
        </div>
      )}

      {!loading && !hasAnyLoan && !can('MANAGE_LOANS') && (
        <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">
          নতুন হাওলাত যোগ করতে প্রশাসকের সাথে যোগাযোগ করুন।
        </div>
      )}

      <FilterSheet
        open={showFilter}
        onClose={() => setShowFilter(false)}
        onApply={setFilters}
        onReset={() => setFilters(null)}
        currencies={currencies}
      />
    </div>
  );
}