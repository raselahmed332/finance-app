// Shared date helpers for server timestamps.
//
// The backend stores "now" values as "dd-MMM-yyyy HH:mm" (see nowStr() in
// backend/Database.gs) and dates as "yyyy-MM-dd" (normDateStr_). Neither can be
// compared lexicographically across months/years, so both the loan-card
// ordering and the audit-log retention window parse them here.
//
// Everything in this module is a pure function so it can be unit tested with
// `node --test` without a DOM.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Parse a server value to epoch milliseconds, or NaN when it cannot be
// understood. Accepts:
//   - "dd-MMM-yyyy HH:mm" (time optional)
//   - "yyyy-MM-dd" (local midnight)
//   - a Date instance
//   - anything the native Date parser accepts
export function parseServerTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  const s = String(value == null ? "" : value).trim();
  if (!s) return NaN;

  const dmy = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (dmy) {
    const mi = MONTHS.indexOf(dmy[2].toLowerCase());
    if (mi === -1) return NaN;
    return new Date(Number(dmy[3]), mi, Number(dmy[1]), Number(dmy[4] || 0), Number(dmy[5] || 0)).getTime();
  }

  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])).getTime();

  const t = new Date(s).getTime();
  return Number.isNaN(t) ? NaN : t;
}

// Subtract whole calendar months, clamping the day to the last valid day of the
// target month. Plain Date maths would roll 31-Mar minus one month over to
// 2/3-Mar, which would widen the retention window.
export function subtractCalendarMonths(date, months) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDate();
  const target = new Date(
    d.getFullYear(),
    d.getMonth() - months,
    1,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

// The retention cutoff. Records strictly older than this instant are eligible
// for deletion. Two calendar months by default (current month + previous month
// are kept).
export function auditRetentionCutoff(now, months) {
  const n = months == null ? 2 : months;
  const base = now instanceof Date ? now : now ? new Date(now) : new Date();
  return subtractCalendarMonths(base, n);
}

// A record is considered retained when it is at/after the cutoff and when its
// timestamp cannot be parsed (an unknown age is never deleted).
export function isWithinAuditRetention(value, now, months) {
  const ts = parseServerTimestamp(value);
  if (Number.isNaN(ts)) return true;
  return ts >= auditRetentionCutoff(now, months).getTime();
}
