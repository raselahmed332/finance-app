import { useCallback, useEffect, useState } from "react";

// How long a revealed balance stays on screen before it masks itself again.
export const BALANCE_REVEAL_SECONDS = 6;

export const MASK = "••••••";

// Balances are masked until the user explicitly asks for them, and re-mask
// themselves a few seconds later so an unattended screen never keeps showing
// real money. `resetKey` re-hides immediately when the underlying record
// changes (a new wallet is selected, the popup is closed, the list refreshes).
export function useBalanceReveal(resetKey) {
  const [revealed, setRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!revealed) return undefined;
    if (secondsLeft <= 0) { setRevealed(false); return undefined; }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [revealed, secondsLeft]);

  useEffect(() => {
    setRevealed(false);
    setSecondsLeft(0);
  }, [resetKey]);

  const show = useCallback(() => {
    setRevealed(true);
    setSecondsLeft(BALANCE_REVEAL_SECONDS);
  }, []);

  const hide = useCallback(() => {
    setRevealed(false);
    setSecondsLeft(0);
  }, []);

  const toggle = useCallback(() => {
    if (revealed) hide();
    else show();
  }, [revealed, hide, show]);

  return { revealed, secondsLeft, show, hide, toggle };
}

// The shared button. Kept here so the dashboard card and the wallet popup
// cannot drift apart visually or behaviourally.
export function BalanceRevealToggle({ revealed, secondsLeft, onToggle, tone = "light" }) {
  const label = revealed ? `Hide (${secondsLeft}s)` : "Show";
  const title = revealed
    ? `মেলে যাবে (${secondsLeft}s)`
    : `${BALANCE_REVEAL_SECONDS} সেকেন্ড দেখান`;
  const cls = tone === "onDark"
    ? "bg-white/20 hover:bg-white/30 text-white"
    : revealed
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={title}
      className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${cls}`}
    >
      <i className={`fa-solid ${revealed ? "fa-eye-slash" : "fa-eye"} text-[10px]`}></i>
      {label}
    </button>
  );
}
