"use strict";

// Money + date rules that every financial path in the backend depends on.
// These are pure functions, so they need no sheet fakes - but they must be
// loaded through the harness so the test exercises the real .gs source.

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");

const ctx = loadBackend();

test("accepts plain decimals and plain decimal strings", () => {
  assert.equal(ctx.isValidAmount_(1500), true);
  assert.equal(ctx.isValidAmount_("1500"), true);
  assert.equal(ctx.isValidAmount_("1500.5"), true);
  assert.equal(ctx.isValidAmount_("1500.50"), true);
  assert.equal(ctx.isValidAmount_(0.01), true);
  assert.equal(ctx.toCents_("12.5"), 1250);
  assert.equal(ctx.toCents_("12.50"), 1250);
});

test("rejects amounts that are not a plain base-10 number", () => {
  // Each of these was silently accepted by an earlier Number()-based check and
  // is the reason strict validation must run on the raw value.
  assert.equal(ctx.isValidAmount_("1e3"), false, "exponent literal");
  assert.equal(ctx.isValidAmount_("0x10"), false, "hex literal");
  assert.equal(ctx.isValidAmount_("0b101"), false, "binary literal");
  assert.equal(ctx.isValidAmount_("1,000"), false, "thousands separator");
  assert.equal(ctx.isValidAmount_("৳50"), false, "currency symbol");
  assert.equal(ctx.isValidAmount_(" 1 . 5 "), false, "spaced decimal");
  assert.equal(ctx.isValidAmount_("1."), false, "trailing dot");
  assert.equal(ctx.isValidAmount_(true), false, "boolean");
  assert.equal(ctx.isValidAmount_(false), false, "boolean");
  assert.equal(ctx.isValidAmount_([5]), false, "array");
  assert.equal(ctx.isValidAmount_({}), false, "object");
  assert.equal(ctx.isValidAmount_(null), false, "null");
  assert.equal(ctx.isValidAmount_(""), false, "empty string");
  assert.equal(ctx.isValidAmount_(undefined), false, "undefined");
});

test("rejects sub-cent values but keeps a large 2-decimal double exact", () => {
  assert.equal(ctx.isValidAmount_(1.005), false, "sub-cent");
  assert.equal(ctx.isValidAmount_(0.001), false, "sub-cent");
  assert.equal(ctx.isValidAmount_(-5), false, "negative");
  assert.equal(ctx.isValidAmount_(0), false, "zero");
  // 0.1 + 0.2 is 0.30000000000000004; this must still read as 30 cents, and a
  // valid large amount must not be rejected (or silently zeroed) by centsOf_.
  assert.equal(ctx.toCents_(0.1 + 0.2), 30);
  assert.equal(ctx.centsOf_(658693073.2), 65869307320);
  assert.equal(ctx.isValidAmount_(658693073.2), true);
});

test("amountOf_ / toCents_ round-trip at 2 decimals", () => {
  assert.equal(ctx.amountOf_(1234), 12.34);
  assert.equal(ctx.toCents_(12.34), 1234);
  assert.equal(ctx.toCents_(ctx.amountOf_(1234)), 1234);
});

test("sameAmount_ compares in exact cents, not with a float tolerance", () => {
  assert.equal(ctx.sameAmount_(10, "10.00"), true);
  assert.equal(ctx.sameAmount_(10, 10.01), false);
  assert.equal(ctx.sameAmount_("abc", "abc"), false, "invalid values never match");
});

test("sumAmounts_ accumulates in cents so long ledgers do not drift", () => {
  // 0.1 + 0.2 === 0.30000000000000004 in floats; in cents it is exactly 30.
  assert.equal(ctx.sumAmounts_([0.1, 0.2]), 30);
  // 333 one-cent rows must total 3.33 regardless of summation order.
  const pennies = new Array(333).fill(0.01);
  assert.equal(ctx.sumAmounts_(pennies), 333);
  assert.equal(ctx.amountOf_(ctx.sumAmounts_(pennies)), 3.33);
  // A value the money rules reject contributes 0 rather than poisoning the sum.
  assert.equal(ctx.sumAmounts_([1 / 3, 0.5]), 50);
});

test("transaction dates must be real calendar dates in yyyy-MM-dd", () => {
  assert.equal(ctx.isValidTransactionDate_("2026-02-28"), true);
  assert.equal(ctx.isValidTransactionDate_("2024-02-29"), true, "leap year");
  assert.equal(ctx.isValidTransactionDate_("2026-02-30"), false, "Feb 30");
  assert.equal(ctx.isValidTransactionDate_("2026-13-01"), false, "month 13");
  assert.equal(ctx.isValidTransactionDate_("2026-00-10"), false, "month 0");
  assert.equal(ctx.isValidTransactionDate_("2026-1-1"), false, "not zero-padded");
  assert.equal(ctx.isValidTransactionDate_("01-01-2026"), false, "wrong order");
  assert.equal(ctx.isValidTransactionDate_(""), false);
  assert.equal(ctx.isValidTransactionDate_(null), false);
});

test("normDateStr_ normalizes Date cells and dd-mm-yyyy text to yyyy-MM-dd", () => {
  assert.equal(ctx.normDateStr_(new Date(2026, 8, 22)), "2026-09-22");
  assert.equal(ctx.normDateStr_("2026-09-22"), "2026-09-22");
  assert.equal(ctx.normDateStr_("22/09/2026"), "2026-09-22");
  assert.equal(ctx.normDateStr_("22-09-2026"), "2026-09-22");
  assert.equal(ctx.normDateStr_(""), "");
  assert.equal(ctx.normDateStr_(null), "");
});
