import { useState, useEffect } from "react";
import { api } from "../api.js";
import { Badge, Button, EmptyState, ErrorState, LoadingState, PageHeader, SectionCard } from "../ui/index.jsx";

export default function AuditLogView({ currentUser, onCancel }) {
  const [entries, setEntries] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  // Retention window reported by the server (months + cutoff + last cleanup).
  const [retention, setRetention] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  // A failed load must not read as an empty log. Showing "কোনো এন্ট্রি নেই।"
  // and a 0 count after an error tells the reader the ledger is untouched when
  // its audit trail was simply never fetched.
  const [loadError, setLoadError] = useState(null);
  // Pair-integrity check is Admin-only on the backend — don't offer it as an
  // affordance that can only ever error for Sub-Admins with VIEW_AUDIT_LOG.
  const isAdmin = String(currentUser?.role) === 'Admin';

  const load = (p) => {
    setLoadError(null);
    api.getAuditLog(currentUser.username, { page: p, pageSize: 20 }).then((res) => {
      if (res.status === 'SUCCESS') {
        setEntries(res.entries);
        setPage(res.page);
        setTotalPages(res.totalPages);
        setTotal(res.total);
        setRetention(res.retention || null);
      } else {
        setLoadError((res && res.message) || 'অডিট লগ লোড করা যায়নি।');
        setEntries([]);
        // Collapse the pager too, otherwise a failure on page 3 of 5 leaves a
        // stale page count rendered next to an error box.
        setTotalPages(1);
        setTotal(0);
      }
    }).catch((err) => {
      setLoadError(String((err && err.message) || err || 'অডিট লগ লোড করা যায়নি।'));
      setEntries([]);
      setTotalPages(1);
      setTotal(0);
    });
  };

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleCheckIntegrity = () => {
    setChecking(true);
    setCheckResult(null);
    api.findBrokenTransferPairs(currentUser.username).then((res) => {
      setChecking(false);
      if (res.status === 'SUCCESS') {
        setCheckResult(res);
      } else {
        setCheckResult({ error: res.message || 'পরীক্ষা ব্যর্থ হয়েছে।' });
      }
    }).catch((err) => {
      setChecking(false);
      setCheckResult({ error: String(err) });
    });
  };

  const handleCleanup = () => {
    setCleaning(true);
    setCleanResult(null);
    api.runAuditCleanup(currentUser.username).then((res) => {
      setCleaning(false);
      if (res.status === 'SUCCESS') {
        setCleanResult({ ok: true, deleted: res.deleted, skipped: res.skipped, cutoff: res.cutoff });
        // Re-read so the list reflects the deletions; reset to page 1 if needed.
        if (page === 1) load(1); else setPage(1);
      } else {
        setCleanResult({ error: res.message || 'Cleanup ব্যর্থ হয়েছে।' });
      }
    }).catch((err) => {
      setCleaning(false);
      setCleanResult({ error: String(err) });
    });
  };

  // A short window around the current page keeps the pager usable when the
  // log is long, instead of rendering one button per entry.
  const pageWindow = [];
  if (totalPages > 1) {
    const from = Math.max(1, Math.min(page - 2, totalPages - 4));
    const to = Math.min(totalPages, from + 4);
    for (let n = from; n <= to; n++) pageWindow.push(n);
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Audit Log"
        subtitle="হিসাবের কার্যক্রলের রেকর্ড"
        icon="fa-clipboard-list"
        onBack={onCancel}
        right={
          <Badge tone={loadError ? "danger" : "brand"}>
            {loadError ? '—' : `${total} টি`}
          </Badge>
        }
      />

      <div className="card card-warning p-3 flex items-start gap-2">
        <i className="fa-solid fa-clock-rotate-left mt-0.5 text-warning" />
        <span className="text-[11px] text-ink-2">
          Audit Log সর্বশেষ {retention ? retention.months : 2} মাসের রেকর্ড সংরক্ষণ করে
          {retention && retention.cutoff ? <> — {retention.cutoff} এর আগের রেকর্ড স্বয়ংক্রিয়ভাবে মুছে যায়।</> : '।'}
        </span>
      </div>

      {isAdmin && retention && retention.lastCleanup && (
        <div className="text-[10px] text-ink-3 -mt-1.5 px-1">
          সর্বশেষ ক্লিনআপ: {retention.lastCleanup.runAt || '—'} ({retention.lastCleanup.deleted || 0} টি মুছেছে)
        </div>
      )}

      {isAdmin && (
        <SectionCard title="Admin Tools" icon="fa-shield-halved" bodyClassName="p-3.5 space-y-2">
          <Button
            variant="secondary"
            block
            icon="fa-shield-halved"
            onClick={handleCheckIntegrity}
            disabled={checking}
          >
            {checking ? 'পরীক্ষা করা হচ্ছে...' : 'Check Transfer Pair Integrity'}
          </Button>
          <Button
            variant="danger"
            block
            icon="fa-broom"
            onClick={handleCleanup}
            disabled={cleaning}
          >
            {cleaning ? 'পরিষ্কার করা হচ্ছে...' : 'Cleanup now'}
          </Button>

          {cleanResult && (
            cleanResult.error ? (
              <div className="card card-danger p-2.5 flex items-start gap-1.5">
                <i className="fa-solid fa-triangle-exclamation mt-0.5 text-danger" />
                <span className="text-xs text-ink-2">{cleanResult.error}</span>
              </div>
            ) : (
              <div className="card card-success p-2.5 flex items-start gap-1.5">
                <i className="fa-solid fa-circle-check mt-0.5 text-success" />
                <span className="text-xs text-ink-2">
                  {cleanResult.skipped
                    ? 'আরেকটি ক্লিনআপ চলছে — পরে আবার চেষ্টা করুন।'
                    : `Cleanup সম্পন্ন — ${cleanResult.deleted} টি পুরনো এন্ট্রি মুছে ফেলা হয়েছে।`}
                </span>
              </div>
            )
          )}

          {checkResult && (
            checkResult.error ? (
              <div className="card card-danger p-2.5 flex items-start gap-1.5">
                <i className="fa-solid fa-triangle-exclamation mt-0.5 text-danger" />
                <span className="text-xs text-ink-2">{checkResult.error}</span>
              </div>
            ) : checkResult.count === 0 ? (
              <div className="card card-success p-2.5 flex items-start gap-1.5">
                <i className="fa-solid fa-circle-check mt-0.5 text-success" />
                <span className="text-xs text-ink-2">
                  কোনো Broken Transfer Pair পাওয়া যায়নি — সব ঠিক আছে।
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="card card-danger p-2.5 flex items-start gap-1.5">
                  <i className="fa-solid fa-triangle-exclamation mt-0.5 text-danger" />
                  <span className="text-xs text-ink-2">
                    {checkResult.count} টি Broken Pair পাওয়া গেছে।
                  </span>
                </div>
                {checkResult.brokenPairs.map((b, i) => (
                  <div key={i} className="card card-inset px-2.5 py-1.5 text-[11px] text-ink-2">
                    <span className="font-semibold text-ink">{b.WalletName}</span> — {b.Type} (ID: {b.ID}) — {b.Issue}
                  </div>
                ))}
              </div>
            )
          )}
        </SectionCard>
      )}

      <div className="card">
        {entries === null ? (
          <LoadingState label="অডিট লগ লোড হচ্ছে..." />
        ) : loadError ? (
          <ErrorState text={loadError} onRetry={() => load(page)} />
        ) : entries.length === 0 ? (
          <EmptyState icon="fa-inbox" title="কোনো এন্ট্রি নেই।" />
        ) : (
          entries.map((e, i) => (
            <div
              key={i}
              className={`px-4 py-2.5 ${
                i !== entries.length - 1 ? 'border-b border-[var(--ah-border)]' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-ink truncate">{e.Action}</span>
                <span className="text-[10px] text-ink-3 shrink-0">{e.Date}</span>
              </div>
              <div className="text-[11px] text-ink-3 mt-0.5">
                <i className="fa-solid fa-user me-1" />{e.User}
                {e.Target ? <span> • {e.Target}</span> : null}
              </div>
              {e.Details && <div className="text-[10px] text-ink-3 mt-0.5">{e.Details}</div>}
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1.5 pt-2 flex-wrap">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="icon-btn"
            aria-label="আগের পাতা"
          >
            <i className="fa-solid fa-chevron-left text-xs" />
          </button>
          {pageWindow.map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                page === n
                  ? "bg-[var(--ah-brand)] text-[var(--ah-brand-contrast)]"
                  : "bg-[var(--ah-surface-3)] text-ink-2"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="icon-btn"
            aria-label="পরের পাতা"
          >
            <i className="fa-solid fa-chevron-right text-xs" />
          </button>
        </div>
      )}
    </div>
  );
}
