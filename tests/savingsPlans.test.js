import test from "node:test";
import assert from "node:assert/strict";
import { compareSavingsPlansNewestFirst } from "../src/utils/savingsPlans.js";

test("orders savings plan cards by creation time, newest first", () => {
  const older = { PlanID: "old", CreatedAt: "24-Oct-2026 08:00" };
  const newer = { PlanID: "new", CreatedAt: "25-Oct-2026 08:00" };

  assert.deepEqual([older, newer].sort(compareSavingsPlansNewestFirst), [
    newer,
    older,
  ]);
});

test("places plans with invalid creation timestamps after dated plans", () => {
  const valid = { PlanID: "valid", CreatedAt: "25-Oct-2026 08:00" };
  const invalid = { PlanID: "invalid", CreatedAt: "" };

  assert.deepEqual([invalid, valid].sort(compareSavingsPlansNewestFirst), [
    valid,
    invalid,
  ]);
});
