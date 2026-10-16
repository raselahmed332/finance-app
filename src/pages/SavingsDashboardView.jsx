import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { formatMoney, fmtDate } from "../utils/loan.js";
import { accountName } from "../utils/accounts.js";

const TYPE_META = {
  GROUP: { label: "গ্রুপ সঞ্চয়", short: "গ্রুপ", icon: "fa-people-group", accent: "emerald" },
  FIXED: { label: "মেয়াদি সঞ্চয়", short: "মেয়াদি", icon: "fa-calendar-check", accent: "sky" },
  FLEXIBLE: { label: "নমনীয় সঞ্চয়", short: "নমনীয়", icon: "fa-wallet", accent: "violet" },
};

const FILTERS = [
  { value: "active", label: "সক্রিয়" },
  { value: "closed", label: "বন্ধ" },
  { value: "all", label: "সব" },
];

const TABS = [
  { value: "ALL", label: "সব", icon: "fa-layer-group" },
  { value: "GROUP", label: "গ্রুপ", icon: "fa-people-group" },
  { value: "FIXED", label: "মেয়াদি", icon: "fa-calendar-check" },
  { value: "FLEXIBLE", label: "নমনীয়", icon: "fa-wallet" },
];

function StatusBadge({ status }) {
  const closed = String(status).toUpperCase() === "CLOSED";
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${closed ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"}`}>
      {closed ? "বন্ধ" : "সক্রিয়"}
    </span>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</div>
      <div className={`text-[11px] mt-0.5 ${strong ? "font-bold text-slate-800 dark:text-gray-100" : "font-semibold text-slate-600 dark:text-gray-300"}`}>{value}</div>
    </div>
  );
}

function PlanCard({ plan, onOpen }) {
  const type = String(plan.Type).toUpperCase();
  const meta = TYPE_META[type] || { label: type, icon: "fa-piggy-bank", accent: "emerald" };
  const summary = plan.Summary || {};
  const currency = plan.Currency || "";

  return (
    <button
      type="button"
      onClick={() => onOpen && onOpen(plan.PlanID)}
      className="w-full text-left bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-3.5 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <i className={`fa-solid ${meta.icon}`}></i>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate">{plan.Name}</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
              {plan.WalletName || plan.WalletID} • {accountName(plan.WalletID, plan.Account)} • {currency}
            </div>
          </div>
        </div>
        <StatusBadge status={plan.Status} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
        {type === "GROUP" && (
          <>
            <Stat label="জমা" value={formatMoney(summary.Collected || 0, currency)} />
            <Stat label="গ্রহণ" value={formatMoney(summary.PaidOut || 0, currency)} />
            <Stat label="সদস্য" value={`${plan.Group?.MemberCount || 0} জন`} />
          </>
        )}
        {type === "FIXED" && (
          <>
            <Stat label="পরিশোধিত" value={formatMoney(summary.Paid || 0, currency)} />
            <Stat label="বাকি" value={formatMoney(summary.Balance || 0, currency)} strong />
            <Stat label="কিস্তি" value={`${summary.InstallmentCount || 0} টি`} />
          </>
        )}
        {type === "FLEXIBLE" && (
          <>
            <Stat label="জমা" value={formatMoney(summary.Deposited || 0, currency)} />
            <Stat label="উত্তোলন" value={formatMoney(summary.Withdrawn || 0, currency)} />
            <Stat label="ব্যালেন্স" value={formatMoney(summary.Balance || 0, currency)} strong />
          </>
        )}
      </div>

      {type === "FIXED" && plan.Fixed?.ClosedDate && (
        <div className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
          বন্ধ: {fmtDate(plan.Fixed.ClosedDate)}
        </div>
      )}
    </button>
  );
}

export default function SavingsDashboardView({ currentUser, onOpenDetails, canCreate, onAdd }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const [tab, setTab] = useState("ALL");

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    setError("");
    api
      .getSavingsPlans(currentUser.username, "ALL", { includeClosed: true })
      .then((res) => {
        if (res.status === "ERROR") {
          setError(res.message || "Failed to load savings");
          setPlans([]);
        } else {
          setPlans(res.plans || []);
        }
      })
      .catch((err) => {
        setError(String(err));
        setPlans([]);
      })
      .finally(() => setLoading(false));
  }, [currentUser]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((p) => {
      const closed = String(p.Status).toUpperCase() === "CLOSED";
      if (filter === "active" && closed) return false;
      if (filter === "closed" && !closed) return false;
      if (q && !String(p.Name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [plans, query, filter]);

  const groups = useMemo(() => filtered.filter((p) => String(p.Type).toUpperCase() === "GROUP"), [filtered]);
  const fixed = useMemo(() => filtered.filter((p) => String(p.Type).toUpperCase() === "FIXED"), [filtered]);
  const flexible = useMemo(() => filtered.filter((p) => String(p.Type).toUpperCase() === "FLEXIBLE"), [filtered]);

  const counts = {
    ALL: filtered.length,
    GROUP: groups.length,
    FIXED: fixed.length,
    FLEXIBLE: flexible.length,
  };

  const sections = [
    { key: "GROUP", title: "গ্রুপ সঞ্চয় (কমিটি)", icon: "fa-people-group", items: groups },
    { key: "FIXED", title: "মেয়াদি সঞ্চয়", icon: "fa-calendar-check", items: fixed },
    { key: "FLEXIBLE", title: "নমনীয় সঞ্চয়", icon: "fa-wallet", items: flexible },
  ].filter((s) => tab === "ALL" || s.key === tab);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800 dark:text-gray-100">সঞ্চয়</h1>
        {canCreate && (
          <button className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => onAdd && onAdd()}>
            <i className="fa-solid fa-plus me-1"></i> নতুন সঞ্চয়
          </button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${active ? "bg-emerald-600 text-white shadow-sm" : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-gray-300"}`}
            >
              <i className={`fa-solid ${t.icon} text-[10px]`}></i>
              <span>{t.label}</span>
              <span className={`text-[9px] font-bold px-1.5 rounded-full ${active ? "bg-white/25 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"}`}>
                {counts[t.value]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="সঞ্চয় খুঁজুন..."
            className="w-full border border-gray-300 dark:border-gray-700 rounded-xl pl-8 pr-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f.value ? "bg-slate-800 dark:bg-gray-700 text-white" : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-slate-600 dark:text-gray-300"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <i className="fa-solid fa-spinner fa-spin"></i> লোড হচ্ছে...
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && counts[tab] === 0 && (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500">
          <i className="fa-solid fa-piggy-bank text-3xl mb-2"></i>
          <div className="text-sm">কোনো সঞ্চয় পাওয়া যায়নি</div>
        </div>
      )}

      {!loading &&
        !error &&
        sections.map((s) =>
          s.items.length === 0 ? null : (
            <section key={s.key} className="space-y-2">
              <h2 className="text-xs font-bold text-slate-700 dark:text-gray-200 flex items-center gap-1.5">
                <i className={`fa-solid ${s.icon} text-emerald-500`}></i> {s.title}
                <span className="text-gray-400 dark:text-gray-500 font-medium">({s.items.length})</span>
              </h2>
              <div className="space-y-2">
                {s.items.map((p) => (
                  <PlanCard key={p.PlanID} plan={p} onOpen={onOpenDetails} />
                ))}
              </div>
            </section>
          ),
        )}
    </div>
  );
}
