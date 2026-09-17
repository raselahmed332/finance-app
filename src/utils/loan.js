export const CURRENCY_SYMBOLS = {
  BDT: "৳", SAR: "SAR", USD: "$", EUR: "€", GBP: "£", KWD: "KD", AED: "AED",
};

export function currencyLabel(cur) {
  return CURRENCY_SYMBOLS[cur] || cur || "";
}

export function formatMoney(amount, currency) {
  const n = Number(amount) || 0;
  const num = n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = CURRENCY_SYMBOLS[currency] || currency || "";
  if (!sym) return num;
  return currency === "BDT" ? `${sym}${num}` : `${sym} ${num}`;
}

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function fmtDate(str) {
  if (!str) return "—";
  const parts = String(str).split("-");
  if (parts.length !== 3) return str;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function startOfWeekStr(today) {
  const t = today ? new Date(today + "T00:00:00") : new Date();
  const day = t.getDay();
  const diff = day === 0 ? 6 : day - 1;
  t.setDate(t.getDate() - diff);
  return toDateStr(t);
}

export function isValidPhone(p) {
  const digits = String(p || "").replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

export function remainingOf(loan) {
  const amount = Number(loan.amount) || 0;
  const repaid = Number(loan.repaid) || 0;
  const n = Number(loan.remaining);
  return Number.isFinite(n) && loan.remaining !== undefined && loan.remaining !== null ? n : Math.max(0, amount - repaid);
}

export const STATUS_META = {
  active: { label: "Active", bg: "bg-sky-100 dark:bg-sky-900/40", text: "text-sky-700 dark:text-sky-400", dot: "bg-sky-500" },
  partial: { label: "Partial", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  paid: { label: "পরিশোধিত", bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  overdue: { label: "Overdue", bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-400", dot: "bg-rose-500" },
};

export function statusOf(loan, today) {
  if (loan && loan.status && STATUS_META[loan.status]) return loan.status;
  const t = today || todayStr();
  const remaining = remainingOf(loan);
  if (remaining <= 0.005) return "paid";
  if (loan.dueDate && String(loan.dueDate) < t) return "overdue";
  if (Number(loan.repaid) > 0) return "partial";
  return "active";
}

export const STATUS_CHOICES = [
  { value: "all", label: "সব" },
  { value: "active", label: "Active" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

export const DATE_CHOICES = [
  { value: "all", label: "সব সময়" },
  { value: "today", label: "আজ" },
  { value: "week", label: "এই সপ্তাহ" },
  { value: "month", label: "এই মাস" },
  { value: "custom", label: "Custom Date Range" },
];

export function dateInRange(dateStr, range, today) {
  if (!range || range.option === "all" || !range.option) return true;
  const t = today || todayStr();
  if (range.option === "today") return dateStr === t;
  if (range.option === "week") return dateStr >= startOfWeekStr(t) && dateStr <= t;
  if (range.option === "month") return String(dateStr || "").slice(0, 7) === t.slice(0, 7);
  if (range.option === "custom") {
    if (range.from && dateStr < range.from) return false;
    if (range.to && dateStr > range.to) return false;
    return true;
  }
  return true;
}

export function avatarClass(name) {
  const palette = [
    "bg-emerald-600", "bg-indigo-600", "bg-blue-600", "bg-purple-600",
    "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-sky-600",
  ];
  const n = String(name || "?").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return palette[n % palette.length];
}

export function initialOf(name) {
  const s = String(name || "?").trim();
  return s.charAt(0).toUpperCase();
}

export function knownPeople(loans) {
  const map = new Map();
  (loans || []).forEach((l) => {
    const key = String(l.personName || "").trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, { personName: l.personName, phone: l.phone || "" });
  });
  return Array.from(map.values());
}

export function loanTypeMeta(type) {
  if (type === "given") return {
    label: "হাওলাত দিয়েছি", short: "দিয়েছি", action: "হাওলাত দিলাম",
    totalLabel: "মোট দিয়েছি", repaidLabel: "ফেরত পেয়েছি", remainingLabel: "বাকি",
    outstandingLabel: "এখনো ফেরত পাবো",
    repaymentTitle: "ফেরত পেয়েছি", ledgerLabel: "ফেরত পেয়েছি",
  };
  return {
    label: "হাওলাত নিয়েছি", short: "নিয়েছি", action: "হাওলাত নিলাম",
    totalLabel: "মোট নিয়েছি", repaidLabel: "ফেরত দিয়েছি", remainingLabel: "বাকি",
    outstandingLabel: "এখনো ফেরত দিতে হবে",
    repaymentTitle: "ফেরত দিয়েছি", ledgerLabel: "ফেরত দিয়েছি",
  };
}