import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const {
  formatShopDate,
  monthLabel,
  operationRequestId,
  productSummary,
  releaseOperationRequestId,
  shiftMonth,
  sortShopRecordsNewestFirst,
  totalOfAllocations,
  unitLabel,
} = await import("../src/utils/shopLedger.js");

test("formats shop dates without time", () => {
  assert.equal(formatShopDate("27-Oct-2026 14:30"), "27 Oct 2026");
  assert.equal(formatShopDate("2026-10-27"), "27 Oct 2026");
  assert.equal(formatShopDate(""), "—");
});

test("sorts shop records by date, then creation time and id", () => {
  const records = [
    { Date: "2026-10-01", CreatedAt: "01-Oct-2026 09:00", MarketID: "m1" },
    { Date: "2026-10-02", CreatedAt: "02-Oct-2026 09:00", MarketID: "m2" },
    { Date: "2026-10-02", CreatedAt: "02-Oct-2026 10:00", MarketID: "m3" },
    { Date: "2026-10-02", CreatedAt: "02-Oct-2026 10:00", MarketID: "m4" },
  ];

  assert.deepEqual(
    sortShopRecordsNewestFirst(records).map((record) => record.MarketID),
    ["m4", "m3", "m2", "m1"],
  );
});

test("does not mutate the records it sorts", () => {
  const records = [
    { Date: "2026-10-01", PaymentID: "p1" },
    { Date: "2026-10-02", PaymentID: "p2" },
  ];

  sortShopRecordsNewestFirst(records);

  assert.deepEqual(records.map((record) => record.PaymentID), ["p1", "p2"]);
});

test("shifts months across year boundaries", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-10", 2), "2026-12");
});

test("labels known units and falls back to the raw value", () => {
  assert.equal(unitLabel("kg"), "কেজি");
  assert.equal(unitLabel("piece"), "পিস");
  assert.equal(unitLabel("custom"), "custom");
  assert.equal(unitLabel(""), "—");
});

test("labels months in Bengali", () => {
  assert.equal(monthLabel("2026-10"), "অক্টোবর 2026");
  assert.equal(monthLabel("invalid"), "invalid");
});

test("summarises products and truncates after three items", () => {
  const products = [
    { Name: "চাল", Quantity: "2", Unit: "kg" },
    { Name: "ডাল", Quantity: "1", Unit: "kg" },
    { Name: "তেল", Quantity: "1", Unit: "liter" },
    { Name: "চিনি", Quantity: "3", Unit: "kg" },
  ];

  assert.match(productSummary(products), /চাল 2 কেজি/);
  assert.match(productSummary(products), /\+1 আরও/);
  assert.equal(productSummary([]), "পণ্যের বিবরণ নেই");
});

test("totals payment allocations", () => {
  assert.equal(totalOfAllocations([
    { Amount: "125.50" },
    { Amount: 24.5 },
    { Amount: "bad" },
  ]), 150);
});

test("keeps a request id stable until the operation is released", () => {
  const scope = "test-operation";
  const payload = { shopId: "SHOP-1", date: "2026-10-27" };
  const first = operationRequestId(scope, payload);

  assert.equal(operationRequestId(scope, payload), first);
  assert.notEqual(
    operationRequestId(scope, { shopId: "SHOP-2", date: "2026-10-27" }),
    first,
  );

  releaseOperationRequestId(scope, payload);
  assert.notEqual(operationRequestId(scope, payload), first);
  releaseOperationRequestId(scope, payload);
});
