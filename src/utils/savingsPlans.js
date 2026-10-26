import { parseServerTimestamp } from "./timestamps.js";

export function compareSavingsPlansNewestFirst(a, b) {
  const aCreatedAt = parseServerTimestamp(a?.CreatedAt);
  const bCreatedAt = parseServerTimestamp(b?.CreatedAt);
  const aInvalid = Number.isNaN(aCreatedAt);
  const bInvalid = Number.isNaN(bCreatedAt);

  if (aInvalid !== bInvalid) return aInvalid ? 1 : -1;
  if (!aInvalid && aCreatedAt !== bCreatedAt) return bCreatedAt - aCreatedAt;

  return 0;
}
