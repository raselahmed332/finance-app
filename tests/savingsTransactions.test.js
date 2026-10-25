import test from "node:test";
import assert from "node:assert/strict";
import { compareSavingsTransactionsNewestFirst } from "../src/utils/savingsTransactions.js";

test("orders flexible savings transactions by date, newest first", () => {
  const older = { Date: "2026-10-24", _id: "2" };
  const newer = { Date: "2026-10-25", _id: "1" };

  assert.deepEqual([older, newer].sort(compareSavingsTransactionsNewestFirst), [
    newer,
    older,
  ]);
});

test("uses parsed creation timestamps for transactions on the same date", () => {
  const older = {
    Date: "2026-10-25",
    CreatedAt: "25-Oct-2026 08:00",
    _id: "2",
  };
  const newer = {
    Date: "2026-10-25",
    CreatedAt: "02-Nov-2026 08:00",
    _id: "1",
  };

  assert.deepEqual([older, newer].sort(compareSavingsTransactionsNewestFirst), [
    newer,
    older,
  ]);
});

test("places transactions with invalid dates after valid dated transactions", () => {
  const valid = { Date: "2026-10-25", _id: "1" };
  const invalid = { Date: "not-a-date", _id: "2" };

  assert.deepEqual([invalid, valid].sort(compareSavingsTransactionsNewestFirst), [
    valid,
    invalid,
  ]);
});
