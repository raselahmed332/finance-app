"use strict";

// The three loan-wallet invariants, plus the payment idempotency ordering.
//
// 1. A loan's wallet is locked for good once it has any financial history
//    (its own L_ effect row, any A_ addition, or any P_ repayment).
// 2. An addition always moves money through the LOAN's wallet - a caller-chosen
//    wallet used to let the debit and the ledger row disagree.
// 3. getLoanDetails totals the whole ledger but only returns the rows that
//    belong to the wallet the caller is actually allowed to see.

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");

const LOAN = {
  _row: 2, id: "L1", user: "rafi", typeStr: "GIVEN", personId: "P1", personName: "Rafi",
  amount: 1000, currency: "BDT", loanDate: "2026-01-01", walletId: "W1", account: "Cash",
  dueDate: "2026-02-01", status: "ACTIVE", createdBy: "boss", createdAt: "", updatedAt: "", requestId: "",
};

// ---------------- 1. wallet lock ----------------

function lockSetup({ effectRow = null, additions = [], payments = [] } = {}) {
  const ctx = loadBackend();
  const calls = { effect: 0, additions: 0, payments: 0 };
  ctx.loadEffectRowSnapshot_ = () => { calls.effect++; return effectRow; };
  ctx.readAdditionsForLoan_ = () => { calls.additions++; return additions; };
  ctx.readPaymentsForLoan_ = () => { calls.payments++; return payments; };
  return { ctx, calls };
}

test("a brand-new loan with no history may still be moved between wallets", () => {
  const { ctx } = lockSetup();
  assert.equal(ctx.loanWalletLockReason_(LOAN), null);
});

test("a recorded initial disbursement locks the wallet", () => {
  const { ctx } = lockSetup({ effectRow: { Amount: 1000 } });
  assert.match(ctx.loanWalletLockReason_(LOAN), /Wallet বদলানো যাবে না/);
});

test("a recorded addition locks the wallet", () => {
  const { ctx } = lockSetup({ additions: [{ id: "A1", amount: 200 }] });
  assert.match(ctx.loanWalletLockReason_(LOAN), /টাকা যোগ করা হয়েছে/);
});

test("a recorded repayment locks the wallet", () => {
  const { ctx } = lockSetup({ payments: [{ id: "P1", amount: 200 }] });
  assert.match(ctx.loanWalletLockReason_(LOAN), /ফেরতের হিসাব/);
});

// ---------------- 2. addition wallet pinning ----------------

function additionSetup(overrides = {}) {
  const ctx = loadBackend();
  const calls = { balance: 0, appended: 0 };
  ctx.getLoanFinancialState_ = () => ({ remainingAmount: 800, status: "ACTIVE", totalAddition: 0, totalRepaid: 0 });
  ctx.loanWalletCurrency_ = (user, walletId, account, currency) => ({
    wallet: { WalletID: walletId, WalletName: "W1", Currency: "BDT" },
  });
  ctx.requireSufficientBalance_ = () => { calls.balance++; return null; };
  ctx.logAudit = () => {};
  ctx.recalcLoan_ = () => LOAN;
  ctx.getWalletById_ = () => null;
  ctx.readAdditionsForLoan_ = () => [];
  ctx.findAdditionRequestRowIndex_ = () => -1;
  Object.assign(ctx, overrides);
  return { ctx, calls };
}

test("an addition into a different wallet is refused", () => {
  const { ctx, calls } = additionSetup();
  const res = ctx.addLoanAdditionCore_(LOAN, {
    loanId: "L1", user: "rafi", walletId: "W2", account: "Cash", amount: "200", date: "2026-01-15", note: "",
  }, null);
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "ADDITION_WALLET_CHANGE_NOT_ALLOWED");
  assert.equal(calls.balance, 0, "must not touch a balance it was told not to use");
});

test("the wallet check runs BEFORE amount validation (no amount means no way in)", () => {
  // Ordering matters: a bad amount on a foreign wallet must not be able to
  // reach the money path, and a good amount on a foreign wallet must never be
  // silently redirected to the loan's wallet.
  const { ctx, calls } = additionSetup();
  const res = ctx.addLoanAdditionCore_(LOAN, {
    loanId: "L1", user: "rafi", walletId: "W2", account: "Cash", amount: "not-a-number", date: "2026-01-15",
  }, null);
  assert.equal(res.code, "ADDITION_WALLET_CHANGE_NOT_ALLOWED");
  assert.equal(calls.balance, 0);
});

test("an addition on the loan's own wallet passes the wallet check and reaches amount validation", () => {
  const { ctx, calls } = additionSetup();
  const res = ctx.addLoanAdditionCore_(LOAN, {
    loanId: "L1", user: "rafi", walletId: "W1", account: "Cash", amount: "1e3", date: "2026-01-15",
  }, null);
  // The wallet is fine, so we now fail on the (deliberately malformed) amount.
  assert.equal(res.code, "INVALID_AMOUNT");
});

test("a cancelled loan refuses additions before the wallet check", () => {
  const { ctx } = additionSetup();
  ctx.getLoanFinancialState_ = () => ({ remainingAmount: 800, status: "CANCELLED" });
  const res = ctx.addLoanAdditionCore_(LOAN, {
    loanId: "L1", user: "rafi", walletId: "W2", account: "Cash", amount: "200", date: "2026-01-15",
  }, null);
  assert.equal(res.code, "DATA_CONFLICT");
});

test("a fully repaid loan refuses additions before the wallet check", () => {
  const { ctx } = additionSetup();
  ctx.getLoanFinancialState_ = () => ({ remainingAmount: 0, status: "PAID" });
  const res = ctx.addLoanAdditionCore_(LOAN, {
    loanId: "L1", user: "rafi", walletId: "W2", account: "Cash", amount: "200", date: "2026-01-15",
  }, null);
  assert.equal(res.code, "PAID_LOAN");
});

// ---------------- 3. detail-row wallet scoping ----------------

function detailsSetup() {
  const ctx = loadBackend();
  ctx.setupDatabase = () => {};
  ctx.getLoanById_ = () => LOAN;
  ctx.requirePermission_ = () => null;
  ctx.getWalletById_ = () => null;
  ctx.additionToClient_ = (a) => ({ id: a.id, walletId: a.walletId, amount: a.amount });
  ctx.paymentToClient_ = (p) => ({ id: p.id, walletId: p.walletId, amount: p.amount });
  ctx.logAudit = () => {};
  // A real, pre-existing cross-wallet addition row (the corruption the old code
  // happily returned to anyone with access to the loan).
  ctx.readAdditionsForLoan_ = () => ([
    { id: "A1", loanId: "L1", walletId: "W1", amount: 200, date: "2026-01-10", account: "Cash", note: "" },
    { id: "A2", loanId: "L1", walletId: "W2", amount: 300, date: "2026-01-11", account: "Bank", note: "legacy" },
  ]);
  ctx.readPaymentsForLoan_ = () => ([
    { id: "P1", loanId: "L1", walletId: "W1", amount: 100, paymentDate: "2026-01-12", account: "Cash", note: "" },
    { id: "P2", loanId: "L1", walletId: "W2", amount: 50, paymentDate: "2026-01-13", account: "Bank", note: "legacy" },
  ]);
  return ctx;
}

test("getLoanDetails totals the whole ledger but only returns the loan wallet's rows", () => {
  const ctx = detailsSetup();
  ctx.hasWalletAccess_ = () => true;

  const res = ctx.getLoanDetails("rafi", "L1");
  assert.equal(res.status, "SUCCESS");
  assert.deepEqual(res.loan.additions.map((a) => a.id), ["A1"]);
  assert.deepEqual(res.loan.payments.map((p) => p.id), ["P1"]);
  // Totals must reflect ALL of it (1000 + 200 + 300 - 100 - 50 = 1350) or the
  // loan would look under-repaid compared with the list view.
  assert.equal(res.loan.totalAmount, 1500);
  assert.equal(res.loan.additionalAmount, 500);
  assert.equal(res.loan.totalRepaid, 150);
  assert.equal(res.loan.remaining, 1350);
});

test("getLoanDetails enforces wallet access instead of filtering silently", () => {
  const ctx = detailsSetup();
  ctx.hasWalletAccess_ = () => false;
  const res = ctx.getLoanDetails("rafi", "L1");
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, "UNAUTHORIZED_LOAN");
});

test("an unknown loan id is reported as not found", () => {
  const ctx = detailsSetup();
  ctx.hasWalletAccess_ = () => true;
  ctx.getLoanById_ = () => null;
  const res = ctx.getLoanDetails("rafi", "nope");
  assert.equal(res.code, "LOAN_NOT_FOUND");
});
