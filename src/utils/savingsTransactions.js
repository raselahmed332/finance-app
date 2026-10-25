import { parseServerTimestamp } from "./timestamps.js";

export function compareSavingsTransactionsNewestFirst(a, b) {
  const aDate = parseServerTimestamp(a?.Date);
  const bDate = parseServerTimestamp(b?.Date);
  const aDateInvalid = Number.isNaN(aDate);
  const bDateInvalid = Number.isNaN(bDate);

  if (aDateInvalid !== bDateInvalid) return aDateInvalid ? 1 : -1;
  if (!aDateInvalid && aDate !== bDate) return bDate - aDate;

  const aCreatedAt = parseServerTimestamp(a?.CreatedAt);
  const bCreatedAt = parseServerTimestamp(b?.CreatedAt);
  const aCreatedAtInvalid = Number.isNaN(aCreatedAt);
  const bCreatedAtInvalid = Number.isNaN(bCreatedAt);

  if (aCreatedAtInvalid !== bCreatedAtInvalid)
    return aCreatedAtInvalid ? 1 : -1;
  if (!aCreatedAtInvalid && aCreatedAt !== bCreatedAt)
    return bCreatedAt - aCreatedAt;

  return String(b?._id ?? "").localeCompare(String(a?._id ?? ""));
}
