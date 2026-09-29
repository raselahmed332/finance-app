// Newest first, with deterministic tie-breakers.
//
// Sorting by Date alone is not enough. Sheet order is the write order, and
// writes arrive in batches: loan rows are appended in one block, income in
// another, expenses in another. When every visible transaction carries the
// same Date, a date-only comparator returns 0 for all of them, the sort is
// stable, and that append order survives all the way to the screen - the list
// reads as "all loans, then all income, then all expenses" instead of a
// reverse-chronological feed.
//
// Timestamp is the per-row entry time, so it breaks those ties by when the
// entry was actually recorded. ID is the last resort: it carries no time
// meaning, but it makes the order total, so two rows that are identical in
// both date and timestamp can never swap places between renders.

function timeValue(v) {
  if (v === null || v === undefined || v === "") return NaN;
  // Date is always a plain YYYY-MM-DD string; Timestamp is an ISO string.
  // String dates must not go through Date.parse alone, because parse of a
  // bare date is treated as UTC midnight and can shift by a day.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? NaN : t;
}

export function compareNewestFirst(a, b) {
  const ad = timeValue(a?.Date);
  const bd = timeValue(b?.Date);

  // Rows with an unparseable date sink to the bottom instead of poisoning the
  // comparator with NaN, which would make every comparison return NaN and
  // leave the whole array in its original order.
  const aBad = Number.isNaN(ad);
  const bBad = Number.isNaN(bd);
  if (aBad !== bBad) return aBad ? 1 : -1;
  if (!aBad && bd !== ad) return bd - ad;

  const at = timeValue(a?.Timestamp);
  const bt = timeValue(b?.Timestamp);
  const aNoT = Number.isNaN(at);
  const bNoT = Number.isNaN(bt);
  if (aNoT !== bNoT) return aNoT ? 1 : -1;
  if (!aNoT && bt !== at) return bt - at;

  return String(b?.ID ?? "").localeCompare(String(a?.ID ?? ""));
}

export function sortTransactionsNewestFirst(list) {
  return [...(list || [])].sort(compareNewestFirst);
}
