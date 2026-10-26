"use strict";

// Payment idempotency ordering.
//
// The bug: the already-paid / overpayment / balance checks all read the ledger
// that the request itself is about to change, and they ran BEFORE the
// requestId duplicate check. A retry of a payment that actually landed was
// therefore rejected as LOAN_ALREADY_PAID / REPAYMENT_EXCEEDS_LOAN /
// INSUFFICIENT_BALANCE, and the client could never tell a duplicate submit from
// a genuine failure. These tests pin the required order and assert that a
// duplicate short-circuits BEFORE any of the state-dependent work.

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");
const { createSheet } = require("./stubs");

const LOAN_ROW = [
  "L1", "rafi", "GIVEN", "P1", "Rafi", "01700000000", 1000, "BDT", "2026-01-01",
  "W1", "Cash", "2026-02-01", "", "", 0, 1000, "ACTIVE", "boss", "", "", "",
];

// loanId, user, type, person, amount, currency, walletId, account, date, note, by, ts, requestId
const PAYMENT_ROW = [
  "PP1", "L1", "rafi", "RECEIVED", 200, "BDT", "W1", "Cash", "2026-01-15",
  "ফেরত", "rafi", "2026-01-15 10:00:00", "REQ-1",
];

// Sheet row 1 is the header, so the data rows the code looks up (row 2) sit at
// index 1 of the backing array.
const HEADER = ["(header)"];

function setup(opts = {}) {
  const ctx = loadBackend();
  const calls = { state: 0, balance: 0, append: 0, effect: 0, auth: 0 };

  ctx.setupDatabase = () => {};
  const loansSheet = createSheet("Loans", [HEADER, LOAN_ROW]);
  ctx.getLoansSheet_ = () => loansSheet;
  ctx.findLoanRowIndex_ = () => 2;
  ctx.authorize_ = () => { calls.auth++; return null; };
  ctx.getLoanFinancialState_ = () => {
    calls.state++;
    // A loan that is already fully repaid: every state-dependent check would
    // reject, so reaching any of them proves the ordering is wrong.
    return { remainingAmount: 0, totalLoanAmount: 1000, totalRepaid: 1000, status: "PAID" };
  };
  ctx.loanWalletCurrency_ = (user, walletId, account) => ({
    wallet: { WalletID: walletId, WalletName: "W1", Currency: "BDT" },
  });
  ctx.requireSufficientBalance_ = () => { calls.balance++; return { message: "insufficient" }; };
  ctx.getWalletById_ = () => null;
  ctx.recalcLoan_ = () => ctx.loanFromRow_(LOAN_ROW, 2);
  ctx.logAudit = () => {};
  ctx.writeLoanEffectRow_ = () => { calls.effect++; };
  ctx.findPaymentRequestRowIndex_ = () => {
    // Snapshot how much state-dependent work had happened by the time the
    // duplicate lookup ran. A non-zero value here means a state-dependent
    // decision was taken BEFORE idempotency, which is the bug.
    calls.stateAtLookup = calls.state;
    calls.balanceAtLookup = calls.balance;
    return opts.hasRequestId === false ? -1 : 2;
  };
  const paySheet = createSheet("Payments", [HEADER, PAYMENT_ROW]);
  const realAppend = paySheet.appendRow;
  paySheet.appendRow = (vals) => { calls.append++; return realAppend(vals); };
  ctx.getLoanPaymentsSheet_ = () => paySheet;
  ctx.paymentToClient_ = (p) => ({ id: p.id, requestId: p.requestId, amount: p.amount, note: p.note, walletId: p.walletId });

  return { ctx, calls };
}

const REQ = {
  loanId: "L1", user: "rafi", walletId: "W1", account: "Cash",
  amount: "200", paymentDate: "2026-01-15", note: "ফেরত", requestId: "REQ-1",
};

test("an exact retry of a landed payment is reported as a duplicate, not as a failure", () => {
  const { ctx, calls } = setup();
  const res = ctx.addLoanPayment(REQ);
  assert.equal(res.status, "SUCCESS");
  assert.equal(res.duplicated, true);
  assert.equal(res.payment.id, "PP1");
  // The stubbed state is "fully repaid, remaining 0", so reaching either
  // state-dependent check before the duplicate lookup would have produced
  // LOAN_ALREADY_PAID / REPAYMENT_EXCEEDS_LOAN instead of a SUCCESS.
  assert.equal(calls.stateAtLookup, 0, "already-paid / overpayment must be decided AFTER idempotency");
  assert.equal(calls.balanceAtLookup, 0, "the balance must not be checked before idempotency");
  assert.equal(calls.append, 0, "must not write a second payment row");
  assert.equal(calls.effect, 0, "must not write a second wallet effect row");
});

test("a retry that changes the amount is a genuine conflict", () => {
  const { ctx, calls } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { amount: "500" }));
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "DUPLICATE_REQUEST");
  assert.equal(calls.append, 0);
});

test("a retry that changes the note is a genuine conflict, not a swallowed duplicate", () => {
  // The note is part of the fingerprint: without it, a second REAL repayment of
  // the same amount on the same day to the same wallet was silently discarded.
  const { ctx } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { note: "সম্পূর্ণ ফেরত" }));
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "DUPLICATE_REQUEST");
});

test("a retry that changes the payment date is a genuine conflict", () => {
  const { ctx } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { paymentDate: "2026-01-16" }));
  assert.equal(res.code, "DUPLICATE_REQUEST");
});

test("a retry that changes the account is a genuine conflict", () => {
  const { ctx } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { account: "Bank" }));
  assert.equal(res.code, "DUPLICATE_REQUEST");
});

test("a retry for a different loan is a genuine conflict", () => {
  const { ctx } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { loanId: "L2" }));
  assert.equal(res.code, "DUPLICATE_REQUEST");
});

test("a fresh request against an already-repaid loan is still refused", () => {
  // Idempotency must not become a back door: without a matching requestId the
  // state checks must still run and still reject.
  const { ctx, calls } = setup({ hasRequestId: false });
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { requestId: "REQ-2" }));
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "LOAN_ALREADY_PAID");
  assert.equal(calls.state, 1);
  assert.equal(calls.append, 0);
});

test("a retry is only allowed on the loan's own wallet", () => {
  // Wallet scope is checked before the fingerprint, so a cross-wallet retry is
  // refused by the wallet rule and never reported as a duplicate.
  const { ctx, calls } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { walletId: "W2" }));
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "REPAYMENT_WALLET_CHANGE_NOT_ALLOWED");
  assert.equal(calls.state, 0);
});

test("a malformed amount is rejected before the duplicate lookup", () => {
  const { ctx, calls } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { amount: "1e3" }));
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "INVALID_AMOUNT");
  assert.equal(calls.state, 0, "an invalid amount must not be silently treated as a duplicate");
  assert.equal(calls.append, 0);
});

test("a malformed date is rejected before the duplicate lookup", () => {
  const { ctx } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { paymentDate: "2026-02-30" }));
  assert.equal(res.code, "INVALID_DATE");
});

test("a payment before the loan date is rejected", () => {
  const { ctx } = setup();
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { paymentDate: "2025-12-31" }));
  assert.equal(res.code, "INVALID_DATE");
});

test("a request with no requestId falls through to the state checks", () => {
  const { ctx, calls } = setup({ hasRequestId: false });
  const res = ctx.addLoanPayment({ loanId: "L1", user: "rafi", walletId: "W1", account: "Cash", amount: "200", paymentDate: "2026-01-15" });
  assert.equal(res.code, "LOAN_ALREADY_PAID");
  assert.equal(calls.state, 1);
});

test("a missing loan id never reaches the ledger", () => {
  const { ctx, calls } = setup();
  const res = ctx.addLoanPayment({ user: "rafi", amount: "200", requestId: "REQ-1" });
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "LOAN_NOT_FOUND");
  assert.equal(calls.auth, 0);
});

test("a rejected user is refused before the amount is even parsed", () => {
  const { ctx, calls } = setup();
  ctx.authorize_ = () => ({ status: "ERROR", message: "নিষিদ্ধ" });
  const res = ctx.addLoanPayment(Object.assign({}, REQ, { amount: "1e3" }));
  assert.equal(res.status, "ERROR");
  assert.match(res.message, /নিষিদ্ধ/);
  assert.equal(calls.append, 0);
});
