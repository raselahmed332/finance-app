import { useState, useEffect } from "react";
import { api } from "../api.js";
import Popup from "./Popup.jsx";
import { useToast } from "./Toast.jsx";

export default function EditTransferForm({ transaction, currentUser, onSave, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [pair, setPair] = useState(null);
  const toast = useToast();

  const [date, setDate] = useState('');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // A failed load must never leave the popup spinning on data that never
  // arrived: the amounts/date below would silently be the ones we could not
  // read, and submitting them would write a guess over a real transfer.
  const load = (isActive) => {
    // Retrying from the error screen passes nothing; the mount effect passes a
    // guard so a resolved promise can never setState on an unmounted popup.
    const alive = typeof isActive === 'function' ? isActive : () => true;
    setLoading(true);
    setLoadError(null);
    api.getTransferPair(transaction.ID, transaction.WalletID, currentUser.username).then((res) => {
      if (!alive()) return;
      if (res.status === 'ERROR') {
        setLoadError(res.message || 'ট্রান্সফার লোড করতে ব্যর্থ হয়েছে।');
        setLoading(false);
        return;
      }
      setPair(res);
      setDate(res.date);
      setFromAmount(res.out.amount);
      setToAmount(res.in.amount);
      setNote(res.note || '');
      setDescription(res.description || '');
      setLoading(false);
    }).catch((err) => {
      if (!alive()) return;
      const message = String((err && err.message) || err || 'ট্রান্সফার লোড করতে ব্যর্থ হয়েছে।');
      setLoadError(message);
      toast.error(message);
      setLoading(false);
    });
  };

  useEffect(() => {
    let active = true;
    load(() => active);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <Popup open title="Edit Transfer" onClose={onCancel}>
      <div className="text-center py-6">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">লোড হচ্ছে...</div>
      </div>
    </Popup>
  );
  if (loadError || !pair) return (
    <Popup open title="Edit Transfer" onClose={onCancel}>
      <div className="text-sm text-rose-600 dark:text-rose-400 py-4 text-center">
        <i className="fa-solid fa-circle-exclamation me-1"></i>
        {loadError || 'ট্রান্সফার পাওয়া যায়নি।'}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
        কোনো পরিবর্তন করা হয়নি।
      </div>
      <div className="flex gap-2">
        <button onClick={() => load()} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs">
          আবার চেষ্টা করুন
        </button>
        <button onClick={onCancel} className="flex-1 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200 font-bold py-2.5 rounded-xl text-xs">বন্ধ করুন</button>
      </div>
    </Popup>
  );

  const sameCurrency = pair.out.currency === pair.in.currency;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!fromAmount || Number(fromAmount) <= 0) return toast.error('সঠিক পরিমাণ লিখুন!');
    if (!toAmount || Number(toAmount) <= 0) return toast.error('সঠিক পরিমাণ লিখুন!');
    setSubmitting(true);
    onSave({ id: transaction.ID, walletId: transaction.WalletID, date, fromAmount, toAmount, note, description }).catch(() => {}).finally(() => setSubmitting(false));
  };

  return (
    <Popup open title="Edit Transfer" onClose={submitting ? undefined : onCancel}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">From (কোথা থেকে)</div>
          <div className="text-xs text-slate-600 dark:text-gray-300">{pair.out.walletName} — {pair.out.account}</div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Amount</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={fromAmount} onChange={(e) => { setFromAmount(e.target.value); if (sameCurrency) setToAmount(e.target.value); }} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg pl-2 pr-12 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" required />
              <span className="absolute right-2 text-[10px] font-bold text-gray-400 dark:text-gray-500">{pair.out.currency}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-2 relative z-10">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow-md border-2 border-white dark:border-gray-900">
            <i className="fa-solid fa-arrows-up-down"></i>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wider">To (কোথায়)</div>
          <div className="text-xs text-slate-600 dark:text-gray-300">{pair.in.walletName} — {pair.in.account}</div>
          <div>
            <label className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Amount Received</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={toAmount} onChange={(e) => setToAmount(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg pl-2 pr-12 py-1.5 text-xs font-semibold bg-white dark:bg-gray-900 dark:text-gray-100" required />
              <span className="absolute right-2 text-[10px] font-bold text-gray-400 dark:text-gray-500">{pair.in.currency}</span>
            </div>
          </div>
        </div>

        {!sameCurrency && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
            <i className="fa-solid fa-triangle-exclamation me-1"></i>
            ভিন্ন কারেন্সি — উভয় পরিমাণ আলাদাভাবে সঠিকভাবে দিন।
          </div>
        )}

        <div className="text-[10px] text-gray-400 dark:text-gray-500 px-1">
          Wallet ও Account পরিবর্তন করা যাবে না — শুধু তারিখ, পরিমাণ, বিবরণ ও নোট এডিট করা যায়।
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Description (বিবরণ)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-sm resize-none bg-white dark:bg-gray-900 dark:text-gray-100"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md text-sm flex items-center justify-center gap-2">
          <i className={`${submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}`}></i> {submitting ? 'Saving...' : 'Update Transfer (উভয় পাশ)'}
        </button>
      </form>
    </Popup>
  );
}
