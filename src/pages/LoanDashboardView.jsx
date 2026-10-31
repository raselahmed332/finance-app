import { Icon } from "../ui/Icon.jsx";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  formatMoney, fmtDate, fmtUpdated, statusOf, STATUS_META, dateInRange,
  STATUS_CHOICES, DATE_CHOICES, avatarClass, initialOf, loanTypeMeta, remainingOf, totalAmountOf,
} from "../utils/loan.js";
import { parseServerTimestamp } from "../utils/timestamps.js";
import Popup from "../components/Popup.jsx";
import {
  Badge, Button, Card, Chip, EmptyState, ErrorState, Input, LoadingState, PageHeader, Segmented, toneStyle,
} from "../ui/index.jsx";

// Newest activity first. updatedAt is a "dd-MMM-yyyy HH:mm" string, so it must
// be parsed before comparing (string order breaks across months/years). Loans
// without a usable timestamp sort last.
function byUpdatedDesc(a, b) {
  const av = parseServerTimestamp(a.updatedAt);
  const bv = parseServerTimestamp(b.updatedAt);
  const aOk = !Number.isNaN(av);
  const bOk = !Number.isNaN(bv);
  if (aOk && bOk) return bv - av;
  if (aOk) return -1;
  if (bOk) return 1;
  return 0;
}

// The status badge colour is derived from the status, not hard-coded per call
// site, so every screen shows the same colour for the same loan state.
const STATUS_TONE = { active: "info", partial: "warning", paid: "success", overdue: "danger" };

function SummaryCard({ meta, total, remaining }) {
  const isGiven = meta.short === "দিয়েছি";
  const style = toneStyle(isGiven ? "danger" : "success");
  const curList = Object.keys(remaining);

  return (
    <Card
      className="p-3.5"
      style={{
        background: style.background,
        borderColor: isGiven ? "var(--ah-danger-border)" : "var(--ah-success-border)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg text-white flex items-center justify-center text-xs shrink-0"
          style={{ background: style.color }}
        >
          <Icon name={isGiven ? "hand-coins" : "badge-dollar-sign"} />
        </div>
        <span className="text-sm font-bold text-ink truncate">{meta.label}</span>
      </div>

      {curList.length === 0 ? (
        <div className="text-[11px] text-ink-3 py-1">কোনো হিসাব নেই</div>
      ) : (
        <div className="space-y-2">
          {curList.map((cur) => (
            <div key={cur} className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-ink-2">মোট ({cur})</span>
              <span className="text-xs font-bold tnum text-ink">{formatMoney(total[cur], cur)}</span>
            </div>
          ))}
          <div className="border-t border-[var(--ah-border)] pt-2 space-y-2">
            {curList.map((cur) => (
              <div key={cur} className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-ink-2">{meta.outstandingLabel}</span>
                <span className="text-xs font-bold tnum" style={{ color: style.color }}>
                  {formatMoney(remaining[cur], cur)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div
      className="rounded-xl p-2 text-center border"
      style={
        tone
          ? {
              background: toneStyle(tone).background,
              borderColor: `var(--ah-${tone}-border)`,
            }
          : { background: "var(--ah-surface-inset)", borderColor: "var(--ah-border)" }
      }
    >
      <div className="text-[9px] font-medium text-ink-2">{label}</div>
      <div
        className="text-[11px] font-bold tnum mt-0.5"
        style={tone ? { color: toneStyle(tone).color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function LoanCard({ loan, onSelect, creatorName }) {
  const meta = loanTypeMeta(loan.type);
  const status = statusOf(loan);
  const statusMeta = STATUS_META[status];
  const remaining = remainingOf(loan);
  const isGiven = meta.short === "দিয়েছি";

  return (
    <button
      type="button"
      onClick={() => onSelect(loan.id)}
      className="w-full text-left card p-3.5 hover:border-[var(--ah-brand)] transition-colors"
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-11 h-11 rounded-full ${avatarClass(loan.personName)} text-white flex items-center justify-center text-lg font-bold flex-shrink-0`}
        >
          {initialOf(loan.personName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-ink truncate">{loan.personName}</div>
          <div className="text-[11px] text-ink-3 mt-0.5 flex items-center gap-1 min-w-0">
            <Icon name="phone" className="text-[9px]" />
            <span className="truncate">{loan.phone || "নাম্বার নেই"}</span>
            <Badge className="shrink-0" tone={isGiven ? "danger" : "success"}>{meta.short}</Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Badge tone={STATUS_TONE[status] || "neutral"}>{statusMeta.label}</Badge>
          <span className="text-[9px] font-bold text-ink-3">{loan.currency}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <MiniStat label={meta.totalLabel} value={formatMoney(totalAmountOf(loan), loan.currency)} />
        <MiniStat label={meta.repaidLabel} value={formatMoney(loan.repaid, loan.currency)} tone="success" />
        <MiniStat
          label={meta.remainingLabel}
          value={formatMoney(remaining, loan.currency)}
          tone={remaining > 0 ? "warning" : null}
        />
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-[var(--ah-border)]">
        <div className="text-[10px] text-ink-3 flex items-center gap-2 min-w-0">
          <span className="truncate max-w-[45%]">
            <Icon name="wallet" className="me-1" />
            {loan.walletName || "—"}
          </span>
          <span className="shrink-0">
            <Icon name="calendar-1" className="me-1" />
            {fmtDate(loan.loanDate)}
          </span>
          {loan.dueDate ? (
            <span className="shrink-0">
              <Icon name="hourglass" className="me-1" />
              {fmtDate(loan.dueDate)}
            </span>
          ) : null}
        </div>
        <div className="text-right ml-2 flex items-center justify-end gap-x-2 flex-wrap">
          {creatorName ? (
            <span className="text-[9px] text-ink-3 flex items-center gap-1">
              <Icon name="user-pen" />
              <span className="font-semibold">{creatorName}</span>
            </span>
          ) : null}
          {loan.updatedAt ? (
            <span className="text-[9px] text-ink-3 flex items-center gap-1">
              <Icon name="history" />
              <span className="font-semibold">{fmtUpdated(loan.updatedAt)}</span>
            </span>
          ) : null}
        </div>
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

  return (
    <Popup open={open} title="ফিল্টার" onClose={onClose} maxWidth="max-w-[480px]">
      <div>
        <div className="section-title mb-2">STATUS</div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_CHOICES.map((s) => (
            <Chip key={s.value} active={status === s.value} onClick={() => setStatus(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="section-title mb-2">DATE</div>
        <div className="flex flex-wrap gap-1.5">
          {DATE_CHOICES.map((d) => (
            <Chip key={d.value} active={dateOption === d.value} onClick={() => setDateOption(d.value)}>
              {d.label}
            </Chip>
          ))}
        </div>
      </div>

      {dateOption === "custom" ? (
        <div className="grid grid-cols-1 gap-2">
          <label className="block">
            <span className="label">তারিখ (থেকে)</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">তারিখ (পর্যন্ত)</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      ) : null}

      <div>
        <div className="section-title mb-2">CURRENCY</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={currency === "all"} onClick={() => setCurrency("all")}>সব</Chip>
          {currencies.map((c) => (
            <Chip key={c} active={currency === c} onClick={() => setCurrency(c)}>{c}</Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="section-title mb-2">REMAINING</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={remaining === "all"} onClick={() => setRemaining("all")}>সব</Chip>
          <Chip active={remaining === "due"} onClick={() => setRemaining("due")}>টাকা বাকি আছে</Chip>
          <Chip active={remaining === "done"} onClick={() => setRemaining("done")}>সম্পূর্ণ ফেরত হয়েছে</Chip>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button variant="secondary" onClick={() => { onReset(); onClose(); }}>রিসেট</Button>
        <Button
          onClick={() => {
            onApply({ status, dateOption, from, to, currency, remaining });
            onClose();
          }}
        >
          ফিল্টার করুন
        </Button>
      </div>
    </Popup>
  );
}

export default function LoanDashboardView({ currentUser, loans, onLoansChange, can, onAdd, onSelect, users }) {
  const [tab, setTab] = useState("given");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  // A failed load must never be rendered as "no loans". getLoans answers a
  // permission/session failure with status:"ERROR", and swallowing that here
  // reported outstanding commitments as zero on every summary card.
  const [loadError, setLoadError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.getLoans(currentUser.username, "given", {}),
      api.getLoans(currentUser.username, "taken", {}),
    ]).then(([givenRes, takenRes]) => {
      if (!active) return;
      const givenOk = givenRes && (givenRes.status === "SUCCESS" || Array.isArray(givenRes.loans));
      const takenOk = takenRes && (takenRes.status === "SUCCESS" || Array.isArray(takenRes.loans));
      if (givenOk && takenOk) {
        onLoansChange([...(givenRes.loans || []), ...(takenRes.loans || [])]);
      } else {
        const msg = (givenRes && givenRes.status === "ERROR" && givenRes.message)
          || (takenRes && takenRes.status === "ERROR" && takenRes.message)
          || "";
        setLoadError(msg || "হাওলাত লোড করা যায়নি।");
      }
      setLoading(false);
    }).catch((err) => {
      if (!active) return;
      setLoadError(String((err && err.message) || err || "হাওলাত লোড করা যায়নি।"));
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.username, refreshKey]);

  const allLoans = useMemo(() => Array.isArray(loans) ? loans : [], [loans]);

  const userMap = useMemo(() => {
    const map = {};
    (Array.isArray(users) ? users : []).forEach((u) => {
      map[u.Username] = u.FullName || u.Username;
    });
    return map;
  }, [users]);

  const totalBy = (list, keyOrFn) => list.reduce((acc, l) => {
    const value = typeof keyOrFn === "function" ? Number(keyOrFn(l)) || 0 : Number(l[keyOrFn]) || 0;
    acc[l.currency] = (acc[l.currency] || 0) + value;
    return acc;
  }, {});

  const given = useMemo(() => allLoans.filter(l => l.type === "given"), [allLoans]);
  const taken = useMemo(() => allLoans.filter(l => l.type === "taken"), [allLoans]);
  // Summary totals only count loans that are still outstanding — fully-paid
  // (পরিশোধিত) loans are excluded so the dashboard reflects active commitments.
  const givenActive = useMemo(() => given.filter(l => statusOf(l) !== "paid"), [given]);
  const takenActive = useMemo(() => taken.filter(l => statusOf(l) !== "paid"), [taken]);
  const givenTotal = useMemo(() => totalBy(givenActive, totalAmountOf), [givenActive]);
  const givenRemain = useMemo(() => totalBy(givenActive, remainingOf) || {}, [givenActive]);
  const takenTotal = useMemo(() => totalBy(takenActive, totalAmountOf), [takenActive]);
  const takenRemain = useMemo(() => totalBy(takenActive, remainingOf) || {}, [takenActive]);

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
      if (filters.remaining === "due" && remaining <= 0) return false;
      if (filters.remaining === "done" && remaining > 0) return false;
      return true;
    }).sort(byUpdatedDesc);
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
  // Creating a loan requires LOAN_GIVE/LOAN_TAKE (admins have them via their
  // effective permission set) — the "+ Add" button must not be shown to users
  // who only have VIEW_LOANS.
  const canAddLoan = can("LOAN_GIVE") || can("LOAN_TAKE") || can("MANAGE_LOANS");

  return (
    <div className="space-y-4">
      <PageHeader
        title="হাওলাত (Loan)"
        icon="hand-coins"
        subtitle="দেওয়া ও নেওয়া হাওলাতের হিসাব"
        right={
          canAddLoan ? (
            <Button size="sm" icon="plus" onClick={onAdd}>হাওলাত যোগ করুন</Button>
          ) : (
            <span className="text-[10px] text-ink-3">যোগ করতে অনুমতি নেই</span>
          )
        }
      />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <SummaryCard meta={loanTypeMeta("given")} total={givenTotal} remaining={givenRemain} />
        <SummaryCard meta={loanTypeMeta("taken")} total={takenTotal} remaining={takenRemain} />
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "given", label: `${loanTypeMeta("given").label} (${given.length})` },
          { value: "taken", label: `${loanTypeMeta("taken").label} (${taken.length})` },
        ]}
      />

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-2.5 text-ink-3 text-xs" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ব্যক্তির নাম দিয়ে খুঁজুন..."
            className="pl-8"
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilter(true)}
          className="relative"
          icon="arrow-up-wide-narrow"
        >
          Filter
          {activeFilterCount > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--ah-brand)] text-white text-[9px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </div>

      {loading ? <LoadingState label="লোড হচ্ছে..." /> : null}

      {!loading && loadError ? (
        <ErrorState
          title="হাওলাত লোড করা যায়নি"
          text={`${loadError} দেখানো তথ্য পুরোনো হতে পারে — অনুগ্রহ করে আবার চেষ্টা করুন।`}
          onRetry={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}

      {!loading && !loadError && !hasAnyLoan ? (
        <EmptyState
          icon="hand-coins"
          title="এখনো কোনো হাওলাতের হিসাব নেই"
          text="প্রথম হাওলাত যোগ করে শুরু করুন।"
          action={
            canAddLoan ? (
              <Button icon="plus" onClick={onAdd}>হাওলাত যোগ করুন</Button>
            ) : null
          }
        />
      ) : null}

      {!loading && !loadError && hasAnyLoan && filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title="কোনো হাওলাত পাওয়া যায়নি"
          text="সার্চ বা ফিল্টার পরিবর্তন করুন।"
          action={
            search || activeFilterCount > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setSearch(""); setFilters(null); }}
              >
                সার্চ ও ফিল্টার রিসেট করুন
              </Button>
            ) : null
          }
        />
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="space-y-2.5">
          {filtered.map((l) => (
            <LoanCard key={l.id} loan={l} onSelect={onSelect} creatorName={userMap[l.createdBy] || l.createdBy} />
          ))}
        </div>
      ) : null}

      {!loading && !loadError && !hasAnyLoan && !can("MANAGE_LOANS") ? (
        <div className="text-center py-6 text-xs text-ink-3">
          নতুন হাওলাত যোগ করতে প্রশাসকের সাথে যোগাযোগ করুন।
        </div>
      ) : null}

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
