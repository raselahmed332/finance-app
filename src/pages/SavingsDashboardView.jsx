import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { formatMoney, fmtDate, fmtUpdated } from "../utils/loan.js";
import { accountName } from "../utils/accounts.js";
import { compareSavingsPlansNewestFirst } from "../utils/savingsPlans.js";
import { Badge, Button, Chip, EmptyState, ErrorState, LoadingState, PageHeader, Segmented } from "../ui/index.jsx";

const TYPE_META = {
  GROUP: { label: "গ্রুপ সঞ্চয়", short: "গ্রুপ", icon: "fa-people-group" },
  FIXED: { label: "মেয়াদি সঞ্চয়", short: "মেয়াদি", icon: "fa-calendar-check" },
  FLEXIBLE: { label: "নমনীয় সঞ্চয়", short: "নমনীয়", icon: "fa-wallet" },
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
    <Badge tone={closed ? "neutral" : "success"} icon={closed ? "fa-lock" : "fa-circle-check"}>
      {closed ? "বন্ধ" : "সক্রিয়"}
    </Badge>
  );
}

// A compact label/value pair for the three-column summary inside a plan card.
function MiniStat({ label, value, strong }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`text-[11px] mt-0.5 truncate ${strong ? "font-bold text-ink" : "font-semibold text-ink-2"}`}>
        {value}
      </div>
    </div>
  );
}

function PlanCard({ plan, onOpen, creatorName }) {
  const type = String(plan.Type).toUpperCase();
  const meta = TYPE_META[type] || { label: type, icon: "fa-piggy-bank" };
  const summary = plan.Summary || {};
  const currency = plan.Currency || "";

  return (
    <button
      type="button"
      onClick={() => onOpen && onOpen(plan.PlanID)}
      className="card w-full text-left p-3.5 hover:border-[var(--ah-brand)] hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-[var(--ah-success-soft)] text-[var(--ah-success)] flex items-center justify-center">
            <i className={`fa-solid ${meta.icon}`} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink truncate">{plan.Name}</div>
            <div className="text-[10px] text-ink-3 truncate">
              {plan.WalletName || plan.WalletID} • {accountName(plan.WalletID, plan.Account)} • {currency}
            </div>
          </div>
        </div>
        <StatusBadge status={plan.Status} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[var(--ah-border)]">
        {type === "GROUP" && (
          <>
            <MiniStat label="জমা" value={formatMoney(summary.Collected || 0, currency)} />
            <MiniStat label="গ্রহণ" value={formatMoney(summary.PaidOut || 0, currency)} />
            <MiniStat label="সদস্য" value={`${plan.Group?.MemberCount || 0} জন`} />
          </>
        )}
        {type === "FIXED" && (
          <>
            <MiniStat label="পরিশোধিত" value={formatMoney(summary.Paid || 0, currency)} />
            <MiniStat label="বাকি" value={formatMoney(summary.Balance || 0, currency)} strong />
            <MiniStat label="কিস্তি" value={`${summary.InstallmentCount || 0} টি`} />
          </>
        )}
        {type === "FLEXIBLE" && (
          <>
            <MiniStat label="জমা" value={formatMoney(summary.Deposited || 0, currency)} />
            <MiniStat label="উত্তোলন" value={formatMoney(summary.Withdrawn || 0, currency)} />
            <MiniStat label="ব্যালেন্স" value={formatMoney(summary.Balance || 0, currency)} strong />
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--ah-border)]">
        <div className="text-[10px] text-ink-3 flex items-center gap-2 min-w-0">
          {plan.StartDate && (
            <span className="shrink-0">
              <i className="fa-solid fa-calendar-day me-1" />
              {fmtUpdated(plan.StartDate)}
            </span>
          )}
          {type === "FIXED" && plan.Fixed?.ClosedDate && (
            <span className="truncate">
              <i className="fa-solid fa-lock me-1" />
              {fmtDate(plan.Fixed.ClosedDate)}
            </span>
          )}
        </div>
        <div className="text-right ml-2 flex items-center justify-end gap-x-2 flex-wrap">
          {creatorName && (
            <span className="text-[9px] text-ink-3 flex items-center gap-1">
              <i className="fa-solid fa-user-pen" />
              <span className="font-semibold">{creatorName}</span>
            </span>
          )}
          {plan.UpdatedAt && (
            <span className="text-[9px] text-ink-3 flex items-center gap-1">
              <i className="fa-solid fa-clock-rotate-left" />
              <span className="font-semibold">{fmtUpdated(plan.UpdatedAt)}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function SavingsDashboardView({ currentUser, onOpenDetails, canCreate, onAdd, users }) {
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

  const userMap = useMemo(() => {
    const map = {};
    (Array.isArray(users) ? users : []).forEach((u) => {
      map[u.Username] = u.FullName || u.Username;
    });
    return map;
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans
      .filter((p) => {
        const closed = String(p.Status).toUpperCase() === "CLOSED";
        if (filter === "active" && closed) return false;
        if (filter === "closed" && !closed) return false;
        if (q && !String(p.Name || "").toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(compareSavingsPlansNewestFirst);
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

  const tabOptions = TABS.map((t) => ({
    value: t.value,
    label: `${t.label} (${counts[t.value]})`,
    icon: t.icon,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="সঞ্চয়"
        subtitle="গ্রুপ, মেয়াদি ও নমনীয় সঞ্চয়"
        icon="fa-piggy-bank"
        right={
          canCreate ? (
            <Button size="sm" icon="fa-plus" onClick={() => onAdd && onAdd()}>
              নতুন সঞ্চয়
            </Button>
          ) : null
        }
      />

      <Segmented options={tabOptions} value={tab} onChange={setTab} />

      <div className="space-y-2">
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 text-xs" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="সঞ্চয় খুঁজুন..."
            className="input pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState label="সঞ্চয় লোড হচ্ছে..." />
      ) : error ? (
        <ErrorState text={error} />
      ) : counts[tab] === 0 ? (
        <EmptyState
          icon="fa-piggy-bank"
          title="কোনো সঞ্চয় পাওয়া যায়নি"
          text="নতুন সঞ্চয় তৈরি করে শুরু করুন।"
        />
      ) : (
        sections.map((s) =>
          s.items.length === 0 ? null : (
            <section key={s.key} className="space-y-2">
              <h2 className="section-title flex items-center gap-1.5">
                <i className={`fa-solid ${s.icon} text-[var(--ah-success)]`} /> {s.title}
                <span className="text-ink-3 font-medium">({s.items.length})</span>
              </h2>
              <div className="space-y-2">
                {s.items.map((p) => (
                  <PlanCard key={p.PlanID} plan={p} onOpen={onOpenDetails} creatorName={userMap[p.CreatedBy]} />
                ))}
              </div>
            </section>
          ),
        )
      )}
    </div>
  );
}
