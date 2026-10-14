import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function SavingsDetailsView({ planId, currentUser, onBack }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!planId || !currentUser) return;
    setLoading(true);
    setError("");
    api
      .getSavingsPlanDetails(planId, currentUser.username)
      .then((res) => {
        if (res.status === "ERROR") {
          setError(res.message || "Failed to load savings details");
          setDetails(null);
        } else {
          setDetails(res);
        }
      })
      .catch((err) => {
        setError(String(err));
        setDetails(null);
      })
      .finally(() => setLoading(false));
  }, [planId, currentUser]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800 dark:text-gray-100">Savings Details</h1>
        <button className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-slate-600" onClick={onBack}>
          Back
        </button>
      </div>
      {loading && <div className="text-sm text-gray-500">Loading...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {details && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
          <pre className="text-xs overflow-auto">{JSON.stringify(details, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
