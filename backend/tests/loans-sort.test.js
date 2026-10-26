"use strict";

// getLoans must order by the parsed updatedAt timestamp (newest first), not by
// the raw "dd-MMM-yyyy HH:mm" string - lexicographic order is wrong across
// months and years. Loans with no parseable updatedAt fall to the end and are
// tie-broken by loanDate.

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");

function loan(id, updatedAt, loanDate) {
  return {
    _row: 1, id, user: "admin", typeStr: "GIVEN", personId: "P1", personName: "P",
    phone: "", amount: 100, currency: "BDT", walletId: "W1", account: "Cash",
    loanDate: loanDate || "2026-01-01", dueDate: "", reminderDate: "", note: "",
    status: "ACTIVE", createdBy: "admin", createdAt: "", updatedAt: updatedAt,
    requestId: "",
  };
}

function sortSetup(loans) {
  const ctx = loadBackend();
  ctx.setupDatabase = () => {};
  ctx.requirePermission_ = () => null;
  ctx.getUserWalletAccess_ = () => ["W1"];
  ctx.readLoansRaw_ = () => loans.map((l) => Object.assign({}, l));
  ctx.repaymentSumMap_ = () => ({});
  ctx.additionSumMap_ = () => ({});
  ctx.getLoanFinancialState_ = () => ({
    status: "ACTIVE", remainingAmount: 100, originalAmount: 100,
    additionalAmount: 0, totalLoanAmount: 100, totalRepaid: 0,
  });
  ctx.getWalletById_ = () => null;
  return ctx;
}

test("parseServerTimestamp_ parses both timestamp forms and rejects junk", () => {
  const ctx = loadBackend();
  assert.ok(
    ctx.parseServerTimestamp_("02-Jan-2027 08:00") > ctx.parseServerTimestamp_("31-Dec-2026 23:00"),
    "a later month of a later year must be a larger timestamp"
  );
  assert.equal(ctx.parseServerTimestamp_("2026-09-22"), new Date(2026, 8, 22).getTime());
  assert.ok(Number.isNaN(ctx.parseServerTimestamp_("nope")));
  assert.ok(Number.isNaN(ctx.parseServerTimestamp_("")));
});

test("getLoans orders by parsed updatedAt descending, invalid last", () => {
  const ctx = sortSetup([
    { _row: 1, id: "A", updatedAt: "24-Sep-2026 09:00", loanDate: "2026-01-01" },
    { _row: 2, id: "B", updatedAt: "02-Jan-2027 08:00", loanDate: "2026-01-01" },
    { _row: 3, id: "C", updatedAt: "", loanDate: "2026-01-01" },
    { _row: 4, id: "D", updatedAt: "31-Dec-2026 23:00", loanDate: "2026-01-01" },
  ].map((l) => Object.assign({
    id: "", user: "admin", typeStr: "GIVEN", personName: "P", amount: 100, currency: "BDT",
    walletId: "W1", account: "Cash", dueDate: "", status: "ACTIVE",
  }, l)));

  const res = ctx.getLoans("admin", "all", {});
  assert.equal(res.status, "SUCCESS");
  // Lexical string order would wrongly put "31-Dec" before "24-Sep" and "02-Jan" last.
  assert.deepEqual(res.loans.map((l) => l.id), ["B", "D", "A", "C"]);
});
