import { Icon } from "../ui/Icon.jsx";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  formatMoney, fmtDate, statusOf, STATUS_META, avatarClass, initialOf,
  loanTypeMeta, remainingOf, totalAmountOf, todayStr,
} from "../utils/loan.js";
import LoanRepaymentForm from "../components/LoanRepaymentForm.jsx";
import LoanAddForm from "../components/LoanAddForm.jsx";
import { useConfirm } from "../components/ConfirmDialog.jsx";
import { accountName } from "../utils/accounts.js";
import {
  Badge, Button, Card, EmptyState, ErrorState, IconButton, KV, LoadingState, PageHeader, SectionCard, toneStyle,
} from "../ui/index.jsx";

const STATUS_TONE = { active: "info", partial: "warning", paid: "success", overdue: "danger" };

function TotalTile({ label, value, tone }) {
  const style = tone ? toneStyle(tone) : null;
  return (
    <div
      className="rounded-xl p-2.5 text-center border"
      style={
        style
          ? {
              background: style.background,
              borderColor: `var(--ah-${tone}-border)`,
            }
          : { background: "var(--ah-surface-inset)", borderColor: "var(--ah-border)" }
      }
    >
      <div className="text-[9px] font-medium text-ink-2">{label}</div>
      <div className="text-sm font-bold tnum mt-0.5" style={style ? { color: style.color } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default function LoanDetailsView({ loan: initialLoan, wallets, currentUser, can, showAlert, onBack, onGoHome, onEdit, onRepayment, onAddAddition, onEditAddition, onDeleteAddition, onEditRepayment, onDeleteRepayment, onCancelLoan }) {
  const meta = loanTypeMeta(initialLoan?.type);

  const [loan, setLoan] = useState(initialLoan);
  const [payments, setPayments] = useState(initialLoan?.payments || []);
  const [additions, setAdditions] = useState(initialLoan?.additions || []);
  const [loading, setLoading] = useState(true);
  // A failed fetch must be visibly different from a loan that genuinely has no
  // payments — otherwise a network/server error reads as "কোনো লেনদেন নেই।"
  // and the user is shown a wrong (empty) financial history.
  const [loadError, setLoadError] = useState(null);
  const [showRepay, setShowRepay] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingAddition, setEditingAddition] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const confirm = useConfirm();

  // Derive status/remaining from the live fetched loan state (not the initial
  // prop) so they refresh immediately after a payment is saved.
  const status = statusOf(loan);
  const statusMeta = STATUS_META[status];
  const remaining = remainingOf(loan);
  const loanTotal = totalAmountOf(loan);
  // Editing needs MANAGE_LOANS (never auto-granted) — hide the affordance from
  // viewers so they don't hit a dead-end edit screen.
  const canEditLoan = can && can("MANAGE_LOANS");
  // Repayment add/edit/delete is a separate permission from loan editing
  // (MANAGE_LOAN_TRANSACTIONS) — the backend enforces it, so the affordances are
  // hidden for anyone who lacks it.
  const canManageLoanTxns = can && can("MANAGE_LOAN_TRANSACTIONS");
  // "টাকা যোগ করুন" uses the same issuing action the original loan used.
  const canAddExtra = can && can(String(loan?.type) === "given" ? "LOAN_GIVE" : "LOAN_TAKE");
  // A CANCELLED loan is already soft-deleted: its wallet effects are reversed and
  // the server refuses any further repayment/addition mutation, so hide the
  // mutating actions instead of offering buttons that can only fail.
  // Read the STORED status, not `status` — statusOf() is derived and has no
  // CANCELLED entry, so it would report "active"/"partial" for a cancelled loan.
  const isCancelled = String(loan?.status || "").toUpperCase() === "CANCELLED";
  // Count what is actually rendered, so the grid never leaves an empty cell.
  const showAddExtra = !!canAddExtra && !isCancelled;
  const showEditLoan = !!canEditLoan && !isCancelled;
  const showCancelLoan = !!canEditLoan;
  const actionCount = 1 + (showAddExtra ? 1 : 0) + (showEditLoan ? 1 : 0) + (showCancelLoan ? 1 : 0);

  useEffect(() => {
    let active = true;
    if (!initialLoan?.id) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    setLoadError(null);
    api.getLoanDetails(currentUser.username, initialLoan.id).then((res) => {
      if (!active) return;
      if (res && res.status === "SUCCESS" && res.loan) {
        setLoan(res.loan);
        setPayments(res.loan.payments || []);
        setAdditions(res.loan.additions || []);
      } else if (res && res.status === "ERROR") {
        setLoadError(res.message || "লোনের বিবরণ লোড করা যায়নি।");
        showAlert(res.message || "লোনের বিবরণ লোড করা যায়নি।", "error");
      } else {
        setLoadError("লোনের বিবরণ পাওয়া যায়নি।");
      }
      setLoading(false);
    }).catch((err) => {
      if (!active) return;
      const message = String((err && err.message) || err || "লোনের বিবরণ লোড করা যায়নি।");
      setLoadError(message);
      showAlert(message, "error");
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoan?.id, refreshKey]);

  const timeline = useMemo(() => {
    const items = [];
    if (loan) {
      items.push({ key: "initial", date: loan.loanDate, title: meta.ledgerLabel, amount: loan.amount, walletName: loan.walletName, walletId: loan.walletId, account: loan.account, currency: loan.currency, initial: true });
    }
    (additions || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((ad, i) => {
      items.push({ key: ad.id || "a" + i, date: ad.date, title: meta.additionLabel, amount: ad.amount, walletName: ad.walletName, walletId: ad.walletId, account: ad.account, currency: ad.currency || loan?.currency, initial: false, addition: true });
    });
    (payments || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((p, i) => {
      // `payment` lets the row render edit/delete for repayments. Additions keep
      // their own controls in the "হাওলাতের বিস্তারিত" card above, so this
      // timeline row stays read-only for them.
      items.push({ key: p.id || "p" + i, date: p.date, title: p.title || meta.repaymentTitle, amount: p.amount, walletName: p.walletName, walletId: p.walletId, account: p.account, currency: p.currency || loan?.currency, initial: false, payment: p });
    });
    return items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [loan, payments, additions, meta]);

  // After any addition add/edit/delete the derived totals change, so re-fetch
  // the full loan details (additions + payments + loan) for a consistent view.
  const handleAdditionSaved = (res) => {
    if (res && res.status === "SUCCESS") setRefreshKey((k) => k + 1);
    setShowAdd(false);
    setEditingAddition(null);
  };

  // A repayment edit changes the loan total/repaid/remaining, so the whole loan
  // is re-fetched exactly like the add flow.
  const handlePaymentSaved = (res) => {
    if (res && res.status === "SUCCESS") setRefreshKey((k) => k + 1);
    setShowRepay(false);
    setEditingPayment(null);
  };

  const handleDeletePayment = async (p) => {
    const ok = await confirm({
      message: "এই ফেরতের হিসাবটি মুছে ফেলবেন? (Wallet ব্যালেন্স থেকেও টাকার প্রভাব ফেরত নেওয়া হবে)",
      detail: `${formatMoney(Number(p.amount) || 0, p.currency || loan?.currency)} • ${fmtDate(p.date || p.paymentDate)}`,
    });
    if (!ok) return;
    onDeleteRepayment(p.id).then(handlePaymentSaved).catch(() => {});
  };

  // Cancelling keeps the loan row (status CANCELLED) and reverses every wallet
  // effect it created, so it is not reversible from this screen.
  const handleCancel = async () => {
    const ok = await confirm({
      message: "এই হাওলাট স্থায়ীভাবে বাতিল করবেন?",
      detail: "লোনটি CANCELLED হবে এবং Wallet ব্যালেন্স থেকে এই লোনের সব টাকার প্রভাব ফেরত নেওয়া হবে। এটি আর ফেরানো যাবে না।",
      confirmLabel: "বাতিল করুন",
      danger: true,
    });
    if (!ok) return;
    onCancelLoan(loan.id).then((res) => {
      if (res && res.status === "SUCCESS") {
        setRefreshKey((k) => k + 1);
        showAlert(res.message, "success");
      }
    }).catch(() => {});
  };

  const handleDeleteAddition = async (ad) => {
    const ok = await confirm({ message: "এই অ্যাডিশনটি মুছে ফেলবেন? (Wallet ব্যালেন্স থেকেও টাকার প্রভাব ফেরত নেওয়া হবে)" });
    if (!ok) return;
    onDeleteAddition(ad.id).then(handleAdditionSaved).catch(() => {});
  };

  if (!initialLoan) {
    return (
      <div className="space-y-4">
        <PageHeader title="লোন বিস্তারিত" icon="hand-coins" onBack={onBack} />
        <EmptyState
          icon="hand-coins"
          title="লোন পাওয়া যায়নি।"
          action={<Button onClick={onBack}>লিষ্টে ফিরে যান</Button>}
        />
      </div>
    );
  }

  const isGiven = meta.short === "দিয়েছি";

  return (
    <div className="space-y-4">
      <PageHeader
        title="লোন বিস্তারিত"
        icon="hand-coins"
        subtitle={loan?.personName}
        onBack={onBack}
        right={
          <IconButton icon="house" label="হোমে যান" onClick={onGoHome} />
        }
      />

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-14 h-14 rounded-full ${avatarClass(loan.personName)} text-white flex items-center justify-center text-xl font-bold flex-shrink-0`}>
            {initialOf(loan.personName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base text-ink truncate">{loan.personName}</div>
            <div className="text-xs text-ink-3 mt-0.5 flex items-center gap-1.5 min-w-0">
              <Icon name="phone" className="text-[10px] me-1" />
              <span className="truncate">{loan.phone || "নাম্বার নেই"}</span>
              <Badge className="shrink-0" tone={isGiven ? "danger" : "success"}>{meta.short}</Badge>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge tone={STATUS_TONE[status] || "neutral"}>{statusMeta.label}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <TotalTile label="মোট হাওলাত" value={formatMoney(loanTotal, loan.currency)} />
          <TotalTile label={meta.repaidLabel} value={formatMoney(loan.repaid, loan.currency)} tone="success" />
          <TotalTile label="বাকি" value={formatMoney(remaining, loan.currency)} tone={remaining > 0 ? "warning" : null} />
        </div>
      </Card>

      <SectionCard title="বিস্তারিত">
        {/* statusMeta is the derived status, which reports a cancelled loan as
            Active/Partial. Say so explicitly instead. */}
        <KV label="স্ট্যাটাস" value={isCancelled ? "বাতিল (Cancelled)" : statusMeta.label} />
        <KV label="প্রথম হাওলাতের তারিখ" value={fmtDate(loan.loanDate)} />
        <KV label="ডিউ তারিখ" value={loan.dueDate ? fmtDate(loan.dueDate) : "—"} />
        <KV label="কারেন্সি" value={loan.currency} />
        <KV label="ওয়ালেট" value={loan.walletName || loan.walletId} />
        <KV label="ওয়ালেট অ্যাকাউন্ট" value={loan.account ? accountName(loan.walletId, loan.account) : "—"} />
        {loan.note ? <KV label="নোট" value={loan.note} /> : null}
      </SectionCard>

      <SectionCard
        title="হাওলাতের বিস্তারিত"
        action={
          showAddExtra ? (
            <Button size="sm" icon="plus" disabled={remaining <= 0} onClick={() => { setEditingAddition(null); setShowAdd(true); }}>
              টাকা যোগ করুন
            </Button>
          ) : null
        }
      >
        <div className="flex items-center justify-between py-1.5">
          <div>
            <div className="text-[11px] font-semibold text-ink">প্রথম হাওলাত</div>
            <div className="text-[10px] text-ink-3">{fmtDate(loan.loanDate)}</div>
          </div>
          <span className="text-xs font-bold tnum text-ink">{formatMoney(Number(loan.originalAmount || loan.amount) || 0, loan.currency)}</span>
        </div>

        {additions.length === 0 ? (
          <div className="py-2 text-[11px] text-ink-3">কোনো অতিরিক্ত টাকা যোগ হয়নি।</div>
        ) : (
          <div className="divide-y divide-[var(--ah-border)]">
            {additions.map((ad) => (
              <div key={ad.id} className="flex items-center justify-between gap-2 py-2">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="text-[11px] font-semibold text-ink">{meta.additionLabel}</div>
                  <div className="text-[10px] text-ink-3 truncate">
                    {fmtDate(ad.date)} • {ad.walletName || "—"} ({ad.account ? accountName(ad.walletId, ad.account) : "—"})
                  </div>
                  {ad.note ? <div className="text-[10px] text-ink-3 truncate">{ad.note}</div> : null}
                </div>
                <div className="text-right flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs font-bold tnum" style={{ color: "var(--ah-warning)" }}>
                    +{formatMoney(ad.amount, ad.currency || loan.currency)}
                  </span>
                  {canEditLoan && !isCancelled && remaining > 0 ? (
                    <>
                      <IconButton icon="pencil" label="এডিট" onClick={() => setEditingAddition(ad)} />
                      <IconButton icon="trash-2" label="মুছে ফেলুন" variant="danger" onClick={() => handleDeleteAddition(ad)} />
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-[var(--ah-border)] mt-2 pt-2 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-ink-3">মোট হাওলাত</span>
            <span className="font-bold tnum text-ink">{formatMoney(loanTotal, loan.currency)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="font-medium" style={{ color: "var(--ah-success)" }}>{meta.repaidLabel}</span>
            <span className="font-bold tnum" style={{ color: "var(--ah-success)" }}>{formatMoney(loan.repaid, loan.currency)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="font-medium" style={{ color: "var(--ah-warning)" }}>বাকি</span>
            <span className="font-bold tnum" style={{ color: "var(--ah-warning)" }}>{formatMoney(remaining, loan.currency)}</span>
          </div>
        </div>
      </SectionCard>

      <div className={`grid gap-2 ${actionCount === 4 ? "grid-cols-2" : actionCount === 3 ? "grid-cols-3" : actionCount === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        <Button icon="plus" disabled={remaining <= 0 || isCancelled} onClick={() => { setEditingPayment(null); setShowRepay(true); }}>
          ফেরত যোগ করুন
        </Button>
        {showAddExtra ? (
          <Button variant="secondary" icon="circle-plus" disabled={remaining <= 0} onClick={() => { setEditingAddition(null); setShowAdd(true); }}>
            টাকা যোগ করুন
          </Button>
        ) : null}
        {showEditLoan ? (
          <Button variant="secondary" icon="pencil" disabled={remaining <= 0} onClick={onEdit}>
            এডিট করুন
          </Button>
        ) : null}
        {showCancelLoan ? (
          <Button variant="danger" icon="ban" disabled={remaining <= 0 || isCancelled} onClick={handleCancel}>
            {isCancelled ? "বাতিল হয়েছে" : "হাওলাট বাতিল করুন"}
          </Button>
        ) : null}
      </div>

      {remaining <= 0 ? (
        <div className="text-center text-[11px] font-semibold rounded-xl p-2.5" style={{ background: "var(--ah-success-soft)", color: "var(--ah-success)" }}>
          <Icon name="circle-check" className="me-1" />
          এই হাওলাত সম্পূর্ণ ফেরত হয়েছে।
        </div>
      ) : null}

      {remaining > 0 && loan.dueDate && loan.dueDate < todayStr() ? (
        <div className="text-center text-[11px] font-semibold rounded-xl p-2.5" style={{ background: "var(--ah-danger-soft)", color: "var(--ah-danger)" }}>
          <Icon name="triangle-alert" className="me-1" />
          ডিউ তারিখ অতিক্রান্ত — হাওলাত ওভারডিউ।
        </div>
      ) : null}

      <SectionCard title="পেমেন্ট হিস্টোরি" bodyClassName="p-4 pt-0">
        {loading ? (
          <LoadingState label="লোড হচ্ছে..." />
        ) : loadError ? (
          <ErrorState
            title="লোনের বিবরণ লোড করা যায়নি"
            text={`${loadError} দেখানো তথ্য পুরোনো হতে পারে — অনুগ্রহ করে আবার চেষ্টা করুন।`}
            onRetry={() => setRefreshKey((k) => k + 1)}
          />
        ) : timeline.length === 0 ? (
          <EmptyState icon="receipt" title="কোনো লেনদেন নেই।" />
        ) : (
          <div className="relative">
            <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-[var(--ah-surface-3)]" />
            <div className="space-y-4">
              {timeline.map((item) => (
                <div key={item.key} className="relative pl-6">
                  <span
                    className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-4 ${
                      item.initial
                        ? "bg-[var(--ah-surface-3)] ring-slate-100 dark:ring-gray-800"
                        : item.addition
                          ? "bg-[var(--ah-warning)] ring-amber-100 dark:ring-amber-900/40"
                          : "bg-[var(--ah-success)] ring-emerald-100 dark:ring-emerald-900/40"
                    }`}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ink-3 font-medium">{fmtDate(item.date)}</span>
                    <Badge tone={item.initial ? "neutral" : item.addition ? "warning" : "success"}>{item.title}</Badge>
                  </div>
                  <div
                    className="text-sm font-bold tnum mt-0.5"
                    style={item.initial ? undefined : { color: item.addition ? "var(--ah-warning)" : "var(--ah-success)" }}
                  >
                    {formatMoney(item.amount, item.currency)}
                  </div>
                  <div className="text-[10px] text-ink-3 mt-0.5">
                    Wallet: <span className="font-semibold">{item.walletName || "—"}</span> • Account:{" "}
                    <span className="font-semibold">{item.account ? accountName(item.walletId, item.account) : "—"}</span>
                  </div>
                  {item.payment?.note ? (
                    <div className="text-[10px] text-ink-3 mt-0.5 truncate">{item.payment.note}</div>
                  ) : null}
                  {item.payment && canManageLoanTxns && !isCancelled ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Button size="sm" variant="ghost" icon="pencil" onClick={() => { setEditingPayment(item.payment); setShowRepay(false); }}>
                        এডিট
                      </Button>
                      <Button size="sm" variant="ghost" icon="trash-2" onClick={() => handleDeletePayment(item.payment)}>
                        মুছে ফেলুন
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {(showRepay || editingPayment) && (
        <LoanRepaymentForm
          loan={loan}
          payment={editingPayment || null}
          wallets={wallets || []}
          currentUser={currentUser}
          onCancel={() => { setShowRepay(false); setEditingPayment(null); }}
          onSave={(formData) => {
            const action = editingPayment
              ? onEditRepayment(formData)
              : onRepayment(loan.id, formData);
            // App.jsx already shows the failure via showAlert() for BOTH the
            // server-error and the network path, then rethrows. Letting the
            // rejection reach LoanRepaymentForm's own catch would show the same
            // error a second time, so it is absorbed here on purpose.
            return action.then(handlePaymentSaved).catch(() => {});
          }}
        />
      )}

      {(showAdd || editingAddition) && (
        <LoanAddForm
          loan={loan}
          addition={editingAddition || null}
          wallets={wallets || []}
          onCancel={() => { setShowAdd(false); setEditingAddition(null); }}
          onSave={(formData) => {
            const action = editingAddition ? onEditAddition(formData) : onAddAddition(loan.id, formData);
            // See the note above: App.jsx has already displayed the error, so
            // propagating it would only duplicate the message.
            return action.then(handleAdditionSaved).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
