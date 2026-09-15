import { useState, useEffect } from "react";
import { api } from "../api.js";

export default function AuditLogView({ currentUser, onCancel }) {
  const [entries, setEntries] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);

  const load = (p) => {
    api.getAuditLog(currentUser.username, { page: p, pageSize: 20 }).then((res) => {
      if (res.status === 'SUCCESS') {
        setEntries(res.entries);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      } else {
        setEntries([]);
      }
    }).catch(() => setEntries([]));
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-gray-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200">
          <i className="fa-solid fa-arrow-left text-lg"></i>
        </button>
        <h3 className="font-bold text-slate-800 dark:text-gray-100 text-base">Audit Log</h3>
        <span className="text-xs bg-gray-200 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full font-semibold">{total} টি</span>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3.5 shadow-2xs space-y-2">
        <button onClick={handleCheckIntegrity} disabled={checking} className="w-full bg-slate-800 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5">
          <i className="fa-solid fa-shield-halved"></i> {checking ? 'পরীক্ষা করা হচ্ছে...' : 'Check Transfer Pair Integrity'}
        </button>
        {checkResult && (
          checkResult.error ? (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
              <i className="fa-solid fa-triangle-exclamation me-1"></i> {checkResult.error}
            </div>
          ) : checkResult.count === 0 ? (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
              <i className="fa-solid fa-circle-check me-1"></i> কোনো Broken Transfer Pair পাওয়া যায়নি — সব ঠিক আছে।
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
                <i className="fa-solid fa-triangle-exclamation me-1"></i> {checkResult.count} টি Broken Pair পাওয়া গেছে।
              </div>
              {checkResult.brokenPairs.map((b, i) => (
                <div key={i} className="text-[11px] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-2.5 py-1.5">
                  <span className="font-semibold">{b.WalletName}</span> — {b.Type} (ID: {b.ID}) — {b.Issue}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3.5 shadow-2xs">
        {entries === null && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-8">লোড হচ্ছে...</div>}
        {entries && entries.length === 0 && <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-8">কোনো এন্ট্রি নেই।</div>}
        {entries && entries.map((e, i) => (
          <div key={i} className={`py-2.5 ${i !== entries.length - 1 ? 'border-b border-gray-100' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-gray-100">{e.Action}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{e.Date}</span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              <i className="fa-solid fa-user me-1"></i>{e.User}
              {e.Target ? <span> • {e.Target}</span> : null}
            </div>
            {e.Details && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{e.Details}</div>}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1.5 pt-2 flex-wrap">
          <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-2.5 h-8 rounded-lg text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 disabled:opacity-30">
            <i className="fa-solid fa-chevron-left"></i>
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 rounded-lg text-xs font-semibold ${page === n ? 'bg-slate-800 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{n}</button>
          ))}
          <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="px-2.5 h-8 rounded-lg text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 disabled:opacity-30">
            <i className="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      )}
    </div>
  );
}
