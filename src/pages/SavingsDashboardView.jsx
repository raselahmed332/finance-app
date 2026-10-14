import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

export default function SavingsDashboardView({ currentUser, onOpenDetails, canCreate, onAdd }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    setError("");
    api
      .getSavingsPlans(currentUser.username)
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

  const groups = useMemo(() => plans.filter((p) => String(p.Type).toUpperCase() === "GROUP"), [plans]);
  const fixed = useMemo(() => plans.filter((p) => String(p.Type).toUpperCase() === "FIXED"), [plans]);
  const flexible = useMemo(() => plans.filter((p) => String(p.Type).toUpperCase() === "FLEXIBLE"), [plans]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800 dark:text-gray-100">Savings</h1>
        {canCreate && (
          <button className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white" onClick={() => onAdd && onAdd()}>
            Add Savings
          </button>
        )}
      </div>

      {loading && <div className="text-sm text-gray-500">Loading...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-200">Group Savings</h2>
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
          {groups.length === 0 ? (
            <div className="p-3 text-xs text-gray-500">No group savings</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {groups.map((p) => (
                <li key={p.PlanID} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-800 dark:text-gray-100">{p.Name}</div>
                    <div className="text-xs text-gray-500">{p.WalletID} • {p.Currency} • {p.Account}</div>
                  </div>
                  <button className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-slate-600" onClick={() => onOpenDetails && onOpenDetails(p.PlanID)}>
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-200">Fixed-Term Savings</h2>
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
          {fixed.length === 0 ? (
            <div className="p-3 text-xs text-gray-500">No fixed-term savings</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {fixed.map((p) => (
                <li key={p.PlanID} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-800 dark:text-gray-100">{p.Name}</div>
                    <div className="text-xs text-gray-500">{p.WalletID} • {p.Currency} • {p.Account}</div>
                  </div>
                  <button className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-slate-600" onClick={() => onOpenDetails && onOpenDetails(p.PlanID)}>
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-200">Flexible Savings</h2>
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl">
          {flexible.length === 0 ? (
            <div className="p-3 text-xs text-gray-500">No flexible savings</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {flexible.map((p) => (
                <li key={p.PlanID} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-800 dark:text-gray-100">{p.Name}</div>
                    <div className="text-xs text-gray-500">{p.WalletID} • {p.Currency} • {p.Account}</div>
                  </div>
                  <button className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-slate-600" onClick={() => onOpenDetails && onOpenDetails(p.PlanID)}>
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
