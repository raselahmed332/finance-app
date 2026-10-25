import { useState, useEffect } from "react";
import { api } from "../api.js";
import Popup from "./Popup.jsx";
import { useToast } from "./Toast.jsx";
import { accountName } from "../utils/accounts.js";

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
        <div className="w-5 h-5 border-2 border-[var(--ah-brand)] border-t-transparent rounded-full animate-spin mx-auto"></div>
        <div className="text-xs text-ink-3 mt-2">লোড হচ্ছে...</div>
      </div>
    </Popup>
  );
  if (loadError || !pair) return (
    <Popup open title="Edit Transfer" onClose={onCancel}>
      <div className="text-sm text-[var(--ah-danger)] py-4 text-center">
        <i className="fa-solid fa-circle-exclamation me-1"></i>
        {loadError || 'ট্রান্সফার পাওয়া যায়নি।'}
      </div>
      <div className="text-xs text-ink-3 text-center mb-4">
        কোনো পরিবর্তন করা হয়নি।
      </div>
      <div className="flex gap-2">
        <button onClick={() => load()} className="flex-1 bg-[var(--ah-info)] hover:brightness-110 text-white font-bold py-2.5 rounded-xl text-xs">
          আবার চেষ্টা করুন
        </button>
        <button onClick={onCancel} className="flex-1 bg-[var(--ah-surface-3)] text-ink font-bold py-2.5 rounded-xl text-xs">বন্ধ করুন</button>
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
        <div className="card-inset p-3 space-y-2">
          <div className="text-xs font-bold text-ink uppercase tracking-wider">From (কোথা থেকে)</div>
          <div className="text-xs text-ink-2">{pair.out.walletName} — {accountName(pair.out.walletId, pair.out.account)}</div>
          <div>
            <label className="label">Amount</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={fromAmount} onChange={(e) => { setFromAmount(e.target.value); if (sameCurrency) setToAmount(e.target.value); }} className="input pr-12 py-1.5 text-xs font-semibold" required />
              <span className="absolute right-2 text-[10px] font-bold text-ink-3">{pair.out.currency}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-2 relative z-10">
          <div className="w-8 h-8 rounded-full bg-[var(--ah-info)] text-white flex items-center justify-center text-xs shadow-md border-2 border-white dark:border-gray-900">
            <i className="fa-solid fa-arrows-up-down"></i>
          </div>
        </div>

        <div className="card-inset p-3 space-y-2">
          <div className="text-xs font-bold text-ink uppercase tracking-wider">To (কোথায়)</div>
          <div className="text-xs text-ink-2">{pair.in.walletName} — {accountName(pair.in.walletId, pair.in.account)}</div>
          <div>
            <label className="label">Amount Received</label>
            <div className="relative flex items-center">
              <input type="number" step="any" value={toAmount} onChange={(e) => setToAmount(e.target.value)} className="input pr-12 py-1.5 text-xs font-semibold" required />
              <span className="absolute right-2 text-[10px] font-bold text-ink-3">{pair.in.currency}</span>
            </div>
          </div>
        </div>

        {!sameCurrency && (
          <div className="card-warning p-2.5 text-[11px] text-[var(--ah-warning)]">
            <i className="fa-solid fa-triangle-exclamation me-1"></i>
            ভিন্ন কারেন্সি — উভয় পরিমাণ আলাদাভাবে সঠিকভাবে দিন।
          </div>
        )}

        <div className="text-[10px] text-ink-3 px-1">
          Wallet ও Account পরিবর্তন করা যাবে না — শুধু তারিখ, পরিমাণ, বিবরণ ও নোট এডিট করা যায়।
        </div>

        <div>
          <label className="label">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
        </div>

        <div>
          <label className="label">Description (বিবরণ)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
        </div>

        <div>
          <label className="label">Note (নোট)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows="2" className="textarea"></textarea>
        </div>

        <button type="submit" disabled={submitting} className="btn btn-primary btn-block">
          <i className={`${submitting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-floppy-disk"}`}></i> {submitting ? 'Saving...' : 'Update Transfer (উভয় পাশ)'}
        </button>
      </form>
    </Popup>
  );
}
