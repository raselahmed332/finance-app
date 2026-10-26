"use strict";

// Transfer-pair editing must validate the RAW client amounts. The old code ran
// them through Number() first, which silently accepted "1e3" / "0x10" / true /
// [5] and rewrote a transfer side with a value the user never typed.

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");
const { createSheet } = require("./stubs");

// A minimal but well-formed Transfer Out / Transfer In pair.
function pair() {
  const outSheet = createSheet("Out", [["T1", "2026-01-05", "Transfer Out", "BDT", "Cash", "Transfer", "Wallet A", "Move", 100, ""]]);
  const inSheet = createSheet("In", [["T2", "2026-01-05", "Transfer In", "BDT", "Bank", "Transfer", "Wallet A", "Move", 100, ""]]);
  return {
    sideA: {
      walletId: "W_OUT", rowNum: 8, sheet: outSheet, wallet: { WalletName: "Out" },
      row: { ID: "T1", Date: "2026-01-05", Type: "Transfer Out", Currency: "BDT", Account: "Cash", SourceCategory: "Transfer", WhereVendor: "Wallet A", Description: "Move", Amount: 100, Note: "", User: "u" },
    },
    sideB: {
      walletId: "W_IN", rowNum: 8, sheet: inSheet, wallet: { WalletName: "In" },
      row: { ID: "T2", Date: "2026-01-05", Type: "Transfer In", Currency: "BDT", Account: "Bank", SourceCategory: "Transfer", WhereVendor: "Wallet A", Description: "Move", Amount: 100, Note: "", User: "u" },
    },
  };
}

function setup() {
  const ctx = loadBackend();
  const calls = { balance: 0 };
  ctx.setupDatabase = () => {};
  ctx.locateTransferPair_ = () => Object.assign({ isTransfer: true, broken: false, notFound: false }, pair());
  ctx.hasWalletAccess_ = () => true;
  ctx.logAudit = () => {};
  ctx.requireSufficientBalance_ = () => {
    calls.balance++;
    // Stop the flow right after validation so no sheet write is attempted.
    return { status: "ERROR", message: "STOP_AFTER_VALIDATION", code: "SENTINEL" };
  };
  return { ctx, calls };
}

const BASE = { id: "T1", walletId: "W_OUT", date: "2026-02-01" };

test("a 'to' amount expressed as an exponent literal is rejected", () => {
  const { ctx, calls } = setup();
  // Number("1e3") === 1000, so the old code accepted this and wrote 1000.
  const res = ctx.updateTransferPair_(Object.assign({}, BASE, { fromAmount: "500", toAmount: "1e3" }), "boss");
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "INVALID_AMOUNT");
  assert.equal(calls.balance, 0, "balance must not be consulted for a malformed amount");
});

test("non-numeric 'to' amounts are rejected before any cents conversion", () => {
  for (const bad of ["0x10", "0b101", "1,000", "৳50", true, [500], {}, "1."]) {
    const { ctx, calls } = setup();
    const res = ctx.updateTransferPair_(Object.assign({}, BASE, { fromAmount: "500", toAmount: bad }), "boss");
    assert.equal(res.status, "ERROR", `expected rejection for ${JSON.stringify(bad)}`);
    assert.equal(res.code, "INVALID_AMOUNT", `expected INVALID_AMOUNT for ${JSON.stringify(bad)}`);
    assert.equal(calls.balance, 0, `balance consulted for ${JSON.stringify(bad)}`);
  }
});

test("a malformed 'from' amount is rejected too", () => {
  const { ctx, calls } = setup();
  const res = ctx.updateTransferPair_(Object.assign({}, BASE, { fromAmount: "1e3", toAmount: "500" }), "boss");
  assert.equal(res.code, "INVALID_AMOUNT");
  assert.equal(calls.balance, 0);
});

test("a valid 'to' amount passes validation and reaches the balance check", () => {
  const { ctx, calls } = setup();
  const res = ctx.updateTransferPair_(Object.assign({}, BASE, { fromAmount: "500", toAmount: "750.25" }), "boss");
  // The sentinel proves validation was cleared and the flow advanced.
  assert.equal(res.code, "SENTINEL");
  assert.equal(calls.balance, 1);
});

test("an omitted 'to' amount falls back to the raw 'from' amount", () => {
  const { ctx, calls } = setup();
  const res = ctx.updateTransferPair_(Object.assign({}, BASE, { fromAmount: "500" }), "boss");
  assert.equal(res.code, "SENTINEL");
  assert.equal(calls.balance, 1);
});

test("an empty-string 'to' amount is treated as omitted, not as zero", () => {
  const { ctx, calls } = setup();
  const res = ctx.updateTransferPair_(Object.assign({}, BASE, { fromAmount: "500", toAmount: "" }), "boss");
  assert.equal(res.code, "SENTINEL", "an empty to-amount must not be validated as 0");
  assert.equal(calls.balance, 1);
});

test("a broken or unknown pair is refused before any amount is read", () => {
  const ctx = loadBackend();
  ctx.setupDatabase = () => {};
  ctx.locateTransferPair_ = () => ({ isTransfer: false, notFound: true });
  const res = ctx.updateTransferPair_(Object.assign({}, BASE, { fromAmount: "500", toAmount: "1e3" }), "boss");
  assert.equal(res.status, "ERROR");
  assert.match(res.message, /পাওয়া যায়নি/);
});
