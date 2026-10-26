"use strict";

// End-to-end coverage for the Savings module. Every test drives the real
// public savings functions against a seeded in-memory spreadsheet, so the plan
// tables, ledger sheets, wallet-effect rows and balance checks all run for real.

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");

function setup() {
  const ctx = loadBackend();
  ctx.setupDatabase();
  const ss = ctx.ss_();

  // Admin (implicit full permissions + access to every wallet).
  ss.getSheetByName("Users").appendRow([
    "admin", "Admin", "x", "Admin", "Active", "[]", "[]", "", "", "", "", "", 0,
  ]);

  // A wallet with 5000 opening cash and 5000 opening bank.
  ss.getSheetByName("Wallets").appendRow([
    "W001", "Main Wallet", "BDT", "BDT_Main", "Active", "now", "now", 5000, 5000,
  ]);

  // A user with NO wallet access (so effective permissions are empty).
  ss.getSheetByName("Users").appendRow([
    "nowallet", "No Wallet", "x", "User", "Active", "[]", "[]", "", "", "", "", "", 0,
  ]);

  ctx.cacheClear_("wallets");
  ctx.cacheClear_("user");
  return ctx;
}

function balance(ctx, account) {
  return ctx.getAccountBalance_("W001", account);
}

test("GROUP: create, list, contribute, payout reconcile the wallet", () => {
  const ctx = setup();

  const created = ctx.createSavingsPlan({
    user: "admin", type: "GROUP", name: "Family Committee", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", contribution: 100, rounds: 3,
    frequency: "MONTHLY", members: [{ name: "A" }, { name: "B" }], requestId: "g1",
  });
  assert.equal(created.status, "SUCCESS", created.message);
  assert.equal(created.plan.Type, "GROUP");
  assert.equal(created.plan.Group.MemberCount, 2);
  const planId = created.plan.PlanID;

  const list = ctx.getSavingsPlans("admin");
  assert.equal(list.status, "SUCCESS");
  assert.equal(list.plans.length, 1);

  const details = ctx.getSavingsPlanDetails(planId, "admin");
  assert.equal(details.status, "SUCCESS");
  assert.equal(details.members.length, 2);
  const selfId = details.members[0].MemberID;
  const otherId = details.members[1].MemberID;

  // Only a member flagged "me" (IsSelf) affects the wallet.
  const mark = ctx.updateSavingsGroupMember({ memberId: selfId, isSelf: true }, "admin");
  assert.equal(mark.status, "SUCCESS", mark.message);

  const before = balance(ctx, "Bank");
  const contribution = ctx.recordSavingsGroupContribution({
    user: "admin", planId, memberId: selfId, amount: 100, date: "2026-01-15", round: 1, requestId: "c1",
  });
  assert.equal(contribution.status, "SUCCESS", contribution.message);
  assert.equal(contribution.transaction.Type, "Savings Contribution");
  assert.equal(balance(ctx, "Bank"), before - 100);

  // Same requestId is idempotent.
  const retry = ctx.recordSavingsGroupContribution({
    user: "admin", planId, memberId: selfId, amount: 100, date: "2026-01-15", round: 1, requestId: "c1",
  });
  assert.equal(retry.status, "SUCCESS");
  assert.equal(retry.duplicated, true);
  assert.equal(balance(ctx, "Bank"), before - 100);

  // Over-contribution for the round is refused.
  const over = ctx.recordSavingsGroupContribution({
    user: "admin", planId, memberId: selfId, amount: 50, date: "2026-01-16", round: 1,
  });
  assert.equal(over.status, "ERROR");
  assert.equal(over.code, "CONTRIBUTION_EXCEEDS");

  // A non-"me" member's contribution is recorded but leaves the wallet alone.
  const other = ctx.recordSavingsGroupContribution({
    user: "admin", planId, memberId: otherId, amount: 100, date: "2026-01-16", round: 1, requestId: "c2",
  });
  assert.equal(other.status, "SUCCESS", other.message);
  assert.equal(other.transaction, null);
  assert.equal(balance(ctx, "Bank"), before - 100);

  // Payout is refused until every member has contributed this round.
  const pending = ctx.recordSavingsGroupPayout({
    user: "admin", planId, amount: 200, date: "2026-01-19", round: 2, recipientMemberId: selfId,
  });
  assert.equal(balance(ctx, "Bank"), before - 100);

  // Payout to the self member credits the wallet once the round is collected.
  const payout = ctx.recordSavingsGroupPayout({
    user: "admin", planId, amount: 200, date: "2026-01-20", round: 1, recipientMemberId: selfId,
  });
  assert.equal(payout.status, "SUCCESS", payout.message);
  assert.equal(payout.transaction.Type, "Savings Payout");
  assert.equal(balance(ctx, "Bank"), before + 100);

  const after = ctx.getSavingsPlanDetails(planId, "admin");
  assert.equal(after.plan.Summary.Collected, 200);
  assert.equal(after.plan.Summary.PaidOut, 200);
});

test("GROUP: payout correction reassigns the wallet effect to the new recipient", () => {
  const ctx = setup();

  const created = ctx.createSavingsPlan({
    user: "admin", type: "GROUP", name: "Committee", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", contribution: 100, rounds: 2,
    frequency: "MONTHLY", members: [{ name: "A" }, { name: "B" }],
  });
  assert.equal(created.status, "SUCCESS", created.message);
  const planId = created.plan.PlanID;
  const details = ctx.getSavingsPlanDetails(planId, "admin");
  const selfId = details.members[0].MemberID;
  const otherId = details.members[1].MemberID;
  assert.equal(ctx.updateSavingsGroupMember({ memberId: selfId, isSelf: true }, "admin").status, "SUCCESS");

  const before = balance(ctx, "Bank");
  ctx.recordSavingsGroupContribution({ user: "admin", planId, memberId: selfId, amount: 100, date: "2026-01-05", round: 1, requestId: "p1" });
  ctx.recordSavingsGroupContribution({ user: "admin", planId, memberId: otherId, amount: 100, date: "2026-01-05", round: 1, requestId: "p2" });
  assert.equal(balance(ctx, "Bank"), before - 100);

  // Pay out to the NON-self member first: recorded, but no wallet movement.
  const first = ctx.recordSavingsGroupPayout({ user: "admin", planId, amount: 200, date: "2026-01-10", round: 1, recipientMemberId: otherId });
  assert.equal(first.status, "SUCCESS", first.message);
  assert.equal(first.transaction, null);
  assert.equal(balance(ctx, "Bank"), before - 100);

  // Correction reassigns the round to the SELF member: the wallet must be credited.
  const correction = ctx.recordSavingsGroupPayout({ user: "admin", planId, amount: 200, date: "2026-01-11", round: 1, recipientMemberId: selfId, allowCorrection: true });
  assert.equal(correction.status, "SUCCESS", correction.message);
  assert.equal(correction.transaction.Type, "Savings Payout");
  assert.equal(balance(ctx, "Bank"), before + 100);
});

test("FIXED: generate installments, pay one, close the plan", () => {
  const ctx = setup();

  const created = ctx.createSavingsPlan({
    user: "admin", type: "FIXED", name: "Fixed DPS", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", amount: 500, durationMonths: 3, dueDay: 5,
  });
  assert.equal(created.status, "SUCCESS", created.message);
  const planId = created.plan.PlanID;

  const gen = ctx.generateSavingsFixedInstallments({ user: "admin", planId });
  assert.equal(gen.status, "SUCCESS", gen.message);
  assert.equal(gen.count, 3);

  // Generating twice is refused.
  const gen2 = ctx.generateSavingsFixedInstallments({ user: "admin", planId });
  assert.equal(gen2.status, "ERROR");
  assert.equal(gen2.code, "ALREADY_GENERATED");

  const details = ctx.getSavingsPlanDetails(planId, "admin");
  assert.equal(details.installments.length, 3);
  assert.equal(details.installments[0].RequiredAmount, 500);
  const instId = details.installments[0].InstallmentID;

  const before = balance(ctx, "Bank");
  const pay = ctx.addSavingsFixedPayment({
    user: "admin", planId, installmentId: instId, amount: 500, date: "2026-02-05",
  });
  assert.equal(pay.status, "SUCCESS", pay.message);
  assert.equal(pay.transaction.Type, "Savings Payment");
  assert.equal(balance(ctx, "Bank"), before - 500);

  // Paying more than the installment is refused.
  const over = ctx.addSavingsFixedPayment({
    user: "admin", planId, installmentId: instId, amount: 10, date: "2026-02-06",
  });
  assert.equal(over.status, "ERROR");
  assert.equal(over.code, "PAYMENT_EXCEEDS");

  const close = ctx.closeSavingsFixedPlan({ user: "admin", planId, closureDate: "2026-06-01", closureAmount: 0 });
  assert.equal(close.status, "SUCCESS", close.message);

  // Closed plans drop out of the default listing but remain with includeClosed.
  const open = ctx.getSavingsPlans("admin");
  assert.equal(open.plans.length, 0);
  const all = ctx.getSavingsPlans("admin", "ALL", { includeClosed: true });
  assert.equal(all.plans.length, 1);
  assert.equal(all.plans[0].Status, "CLOSED");
});

test("FLEXIBLE: deposit, withdrawal, delete reverses the wallet", () => {
  const ctx = setup();

  const created = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "Rainy Day", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", flexNote: "x",
  });
  assert.equal(created.status, "SUCCESS", created.message);
  const planId = created.plan.PlanID;

  const dep = ctx.addSavingsFlexDeposit({
    user: "admin", planId, amount: 1000, date: "2026-01-10", account: "Bank", requestId: "d1",
  });
  assert.equal(dep.status, "SUCCESS", dep.message);
  assert.equal(dep.transaction.Type, "Savings Deposit");
  assert.equal(balance(ctx, "Bank"), 4000);

  const wd = ctx.addSavingsFlexWithdrawal({
    user: "admin", planId, amount: 400, date: "2026-01-12", account: "Bank",
  });
  assert.equal(wd.status, "SUCCESS", wd.message);
  assert.equal(balance(ctx, "Bank"), 4400);

  const details = ctx.getSavingsPlanDetails(planId, "admin");
  assert.equal(details.plan.Summary.Deposited, 1000);
  assert.equal(details.plan.Summary.Withdrawn, 400);
  assert.equal(details.plan.Summary.Balance, 600);

  // Cannot withdraw more than is saved in the plan.
  const over = ctx.addSavingsFlexWithdrawal({
    user: "admin", planId, amount: 5000, date: "2026-01-13", account: "Bank",
  });
  assert.equal(over.status, "ERROR");
  assert.equal(over.code, "INSUFFICIENT_SAVINGS");

  const depositId = details.deposits[0].DepositID;
  const del = ctx.deleteSavingsFlexTransaction(depositId, "deposit", "admin");
  assert.equal(del.status, "SUCCESS", del.message);
  assert.equal(balance(ctx, "Bank"), 5400);
});

test("FLEXIBLE: closing returns the balance and works on an empty plan", () => {
  const ctx = setup();

  // Empty plan: the UI sends "0" as the closure amount, which must still succeed.
  const empty = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "Empty", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", requestId: "fe1",
  });
  assert.equal(empty.status, "SUCCESS", empty.message);
  const emptyClose = ctx.closeSavingsFlexPlan({
    user: "admin", planId: empty.plan.PlanID, closureDate: "2026-01-02", closureAmount: "0",
  });
  assert.equal(emptyClose.status, "SUCCESS", emptyClose.message);
  assert.equal(emptyClose.transaction, null);
  assert.equal(balance(ctx, "Bank"), 5000);

  // Funded plan: closing returns the whole remaining balance to the wallet.
  const funded = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "Funded", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", requestId: "fe2",
  });
  const fundedId = funded.plan.PlanID;
  ctx.addSavingsFlexDeposit({ user: "admin", planId: fundedId, amount: 500, date: "2026-01-05", account: "Bank", requestId: "fe3" });
  assert.equal(balance(ctx, "Bank"), 4500);

  const close = ctx.closeSavingsFlexPlan({ user: "admin", planId: fundedId, closureDate: "2026-02-01" });
  assert.equal(close.status, "SUCCESS", close.message);
  assert.equal(close.transaction.Type, "Savings Withdrawal");
  assert.equal(balance(ctx, "Bank"), 5000);
  assert.equal(close.plan.Status, "CLOSED");
});

test("plan update and delete guard against activity", () => {
  const ctx = setup();

  const created = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "Original", walletId: "W001",
    account: "Bank", startDate: "2026-01-01",
  });
  const planId = created.plan.PlanID;

  const upd = ctx.updateSavingsPlan({ planId, name: "Renamed" }, "admin");
  assert.equal(upd.status, "SUCCESS", upd.message);
  assert.equal(upd.plan.Name, "Renamed");

  // A fresh plan with no ledger rows can be hard-deleted.
  const del = ctx.deleteSavingsPlan(planId, "admin");
  assert.equal(del.status, "SUCCESS", del.message);

  // A plan with activity cannot be deleted.
  const created2 = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "Active", walletId: "W001",
    account: "Bank", startDate: "2026-01-01",
  });
  const planId2 = created2.plan.PlanID;
  ctx.addSavingsFlexDeposit({ user: "admin", planId: planId2, amount: 10, date: "2026-01-10", account: "Bank" });
  const del2 = ctx.deleteSavingsPlan(planId2, "admin");
  assert.equal(del2.status, "ERROR");
  assert.equal(del2.code, "PLAN_HAS_ACTIVITY");
});

test("validation and permission failures", () => {
  const ctx = setup();

  const badType = ctx.createSavingsPlan({
    user: "admin", type: "CRYPTO", name: "x", walletId: "W001", account: "Bank", startDate: "2026-01-01",
  });
  assert.equal(badType.status, "ERROR");
  assert.equal(badType.code, "INVALID_TYPE");

  const badName = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "", walletId: "W001", account: "Bank", startDate: "2026-01-01",
  });
  assert.equal(badName.status, "ERROR");
  assert.equal(badName.code, "INVALID_NAME");

  const badDate = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "x", walletId: "W001", account: "Bank", startDate: "01-01-2026",
  });
  assert.equal(badDate.status, "ERROR");
  assert.equal(badDate.code, "INVALID_DATE");

  // A user with no wallet access has no usable permissions.
  const denied = ctx.getSavingsPlans("nowallet");
  assert.equal(denied.status, "ERROR");
  assert.equal(denied.code, "PERMISSION_DENIED");
});

test("GROUP: member management and recipient order", () => {
  const ctx = setup();

  const created = ctx.createSavingsPlan({
    user: "admin", type: "GROUP", name: "Committee", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", contribution: 100, rounds: 4,
  });
  const planId = created.plan.PlanID;

  const add = ctx.addSavingsGroupMember({ user: "admin", planId, memberName: "A" });
  assert.equal(add.status, "SUCCESS", add.message);
  const added = ctx.addSavingsGroupMember({ user: "admin", planId, memberName: "B" });
  assert.equal(added.status, "SUCCESS");

  const upd = ctx.updateSavingsGroupMember({ planId, memberId: added.member.MemberID, memberName: "B2" }, "admin");
  assert.equal(upd.status, "SUCCESS", upd.message);

  const renamed = ctx.getSavingsPlanDetails(planId, "admin");
  assert.equal(renamed.members.length, 2);
  assert.ok(renamed.members.some((m) => m.MemberName === "B2"));

  const orderIds = renamed.members.map((m) => m.MemberID).reverse();
  const order = ctx.setSavingsGroupRecipientOrder({ user: "admin", planId, order: orderIds });
  assert.equal(order.status, "SUCCESS", order.message);
  assert.equal(order.order.length, 2);

  const removed = ctx.removeSavingsGroupMember(add.member.MemberID, "admin");
  assert.equal(removed.status, "SUCCESS", removed.message);
  const after = ctx.getSavingsPlanDetails(planId, "admin");
  assert.equal(after.members.length, 1);
});

test("idempotent plan creation", () => {
  const ctx = setup();
  const payload = {
    user: "admin", type: "FLEXIBLE", name: "Once", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", requestId: "plan-once",
  };
  const first = ctx.createSavingsPlan(payload);
  assert.equal(first.status, "SUCCESS");
  const second = ctx.createSavingsPlan(payload);
  assert.equal(second.status, "SUCCESS");
  assert.equal(second.duplicated, true);
  assert.equal(second.plan.PlanID, first.plan.PlanID);

  const list = ctx.getSavingsPlans("admin");
  assert.equal(list.plans.length, 1);
});

test("GROUP: round expected total, at-most-once payout, and paid-round guard", () => {
  const ctx = setup();
  const names = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10"];
  const created = ctx.createSavingsPlan({
    user: "admin", type: "GROUP", name: "Big Committee", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", contribution: 500, rounds: 3,
    frequency: "MONTHLY", members: names.map((n) => ({ name: n })),
  });
  assert.equal(created.status, "SUCCESS", created.message);
  const planId = created.plan.PlanID;

  const details = ctx.getSavingsPlanDetails(planId, "admin");
  // Round 1: all ten members pay 500 => expected 5000, collected 5000.
  for (const m of details.members) {
    const res = ctx.recordSavingsGroupContribution({
      user: "admin", planId, memberId: m.MemberID, amount: 500, date: "2026-01-10", round: 1,
    });
    assert.equal(res.status, "SUCCESS", res.message);
  }
  const afterRound1 = ctx.getSavingsPlanDetails(planId, "admin");
  const round1 = afterRound1.rounds.find((r) => Number(r.Round) === 1);
  assert.equal(round1.ExpectedAmount, 5000);
  assert.equal(round1.CollectedAmount, 5000);

  const memberA = details.members[0].MemberID;
  const memberB = details.members[1].MemberID;

  const payout1 = ctx.recordSavingsGroupPayout({
    user: "admin", planId, amount: 5000, date: "2026-01-20", round: 1, recipientMemberId: memberA,
  });
  assert.equal(payout1.status, "SUCCESS", payout1.message);

  // The same round cannot be paid twice without an explicit correction.
  const payout1Again = ctx.recordSavingsGroupPayout({
    user: "admin", planId, amount: 5000, date: "2026-01-21", round: 1, recipientMemberId: memberB,
  });
  assert.equal(payout1Again.status, "ERROR");
  assert.equal(payout1Again.code, "ROUND_ALREADY_PAID");

  // Round 2: fund it, then try to pay member A a second time => refused.
  for (const m of details.members) {
    ctx.recordSavingsGroupContribution({
      user: "admin", planId, memberId: m.MemberID, amount: 500, date: "2026-02-10", round: 2,
    });
  }
  const twice = ctx.recordSavingsGroupPayout({
    user: "admin", planId, amount: 5000, date: "2026-02-20", round: 2, recipientMemberId: memberA,
  });
  assert.equal(twice.status, "ERROR");
  assert.equal(twice.code, "MEMBER_ALREADY_RECEIVED");

  // An authorized correction (Admin holds MANAGE_SAVINGS) may override.
  const corrected = ctx.recordSavingsGroupPayout({
    user: "admin", planId, amount: 5000, date: "2026-02-20", round: 2, recipientMemberId: memberB, allowCorrection: true,
  });
  assert.equal(corrected.status, "SUCCESS", corrected.message);

  const final = ctx.getSavingsPlanDetails(planId, "admin");
  assert.equal(final.plan.Summary.PaidOut, 10000);
});

test("GROUP: DUE / MISSED effective statuses and partial contributions", () => {
  const ctx = setup();
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const created = ctx.createSavingsPlan({
    user: "admin", type: "GROUP", name: "Status Group", walletId: "W001",
    account: "Bank", startDate: "2020-01-01", contribution: 100, rounds: 2,
    frequency: "MONTHLY", members: [{ name: "A" }],
  });
  const planId = created.plan.PlanID;
  const memberId = ctx.getSavingsPlanDetails(planId, "admin").members[0].MemberID;

  // Half of the round-1 obligation: PARTIAL today, MISSED once the due date has passed.
  const partial = ctx.recordSavingsGroupContribution({
    user: "admin", planId, memberId, amount: 50, date: "2020-01-05", round: 1,
  });
  assert.equal(partial.status, "SUCCESS", partial.message);
  const obl = ctx.getSavingsPlanDetails(planId, "admin").obligations[0];
  assert.equal(obl.PaidAmount, 50);
  assert.equal(obl.Status, "PARTIAL");
  assert.equal(obl.EffectiveStatus, "MISSED");

  // Completing it flips the effective status to PAID.
  ctx.recordSavingsGroupContribution({ user: "admin", planId, memberId, amount: 50, date: "2020-01-06", round: 1 });
  const obl2 = ctx.getSavingsPlanDetails(planId, "admin").obligations[0];
  assert.equal(obl2.Status, "PAID");
  assert.equal(obl2.EffectiveStatus, "PAID");

  // A round whose due date is today reports DUE while still unpaid.
  const created2 = ctx.createSavingsPlan({
    user: "admin", type: "GROUP", name: "Due Group", walletId: "W001",
    account: "Bank", startDate: todayStr, contribution: 100, rounds: 1,
    frequency: "MONTHLY", members: [{ name: "B" }],
  });
  const planId2 = created2.plan.PlanID;
  const memberB = ctx.getSavingsPlanDetails(planId2, "admin").members[0].MemberID;
  ctx.recordSavingsGroupContribution({ user: "admin", planId: planId2, memberId: memberB, amount: 30, date: todayStr, round: 1 });
  const obl3 = ctx.getSavingsPlanDetails(planId2, "admin").obligations[0];
  assert.equal(obl3.EffectiveStatus, "DUE");
});

test("FIXED: month-end / leap-year due dates and overdue status", () => {
  const ctx = setup();
  const created = ctx.createSavingsPlan({
    user: "admin", type: "FIXED", name: "Month End DPS", walletId: "W001",
    account: "Bank", startDate: "2024-01-31", amount: 100, durationMonths: 3, dueDay: 31,
  });
  const planId = created.plan.PlanID;
  assert.equal(ctx.generateSavingsFixedInstallments({ user: "admin", planId }).status, "SUCCESS");

  const inst = ctx.getSavingsPlanDetails(planId, "admin").installments;
  // Jan 31 start clamps to Feb 29 (leap year), then Mar 31, then Apr 30.
  assert.equal(inst[0].DueDate, "2024-02-29");
  assert.equal(inst[1].DueDate, "2024-03-31");
  assert.equal(inst[2].DueDate, "2024-04-30");
  // All three due dates are in the past, so every installment is MISSED.
  assert.equal(inst[0].EffectiveStatus, "MISSED");

  // Paying the first installment clears its status.
  const pay = ctx.addSavingsFixedPayment({
    user: "admin", planId, installmentId: inst[0].InstallmentID, amount: 100, date: "2024-03-01",
  });
  assert.equal(pay.status, "SUCCESS", pay.message);
  const after = ctx.getSavingsPlanDetails(planId, "admin").installments;
  assert.equal(after[0].Status, "PAID");
  assert.equal(after[0].EffectiveStatus, "PAID");

  // A late payment (past the due date) still updates the installment cleanly.
  const late = ctx.addSavingsFixedPayment({
    user: "admin", planId, installmentId: after[1].InstallmentID, amount: 100, date: "2024-09-01",
  });
  assert.equal(late.status, "SUCCESS", late.message);
  assert.equal(ctx.getSavingsPlanDetails(planId, "admin").installments[1].Status, "PAID");
});

test("FIXED: 5-year and 10-year plans generate the right number of installments", () => {
  const ctx = setup();
  const five = ctx.createSavingsPlan({
    user: "admin", type: "FIXED", name: "Five Year", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", amount: 100, durationMonths: 60,
  });
  assert.equal(ctx.generateSavingsFixedInstallments({ user: "admin", planId: five.plan.PlanID }).count, 60);

  const ten = ctx.createSavingsPlan({
    user: "admin", type: "FIXED", name: "Ten Year", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", amount: 100, durationMonths: 120,
  });
  assert.equal(ctx.generateSavingsFixedInstallments({ user: "admin", planId: ten.plan.PlanID }).count, 120);
});

test("SAVINGS: wallet-access isolation and currency are enforced", () => {
  const ctx = setup();
  const ss = ctx.ss_();
  ss.getSheetByName("Wallets").appendRow(["W002", "Second", "BDT", "BDT_Main", "Active", "now", "now", 0, 0]);
  // A plain user scoped to W002 only (auto-granted default savings permissions).
  ss.getSheetByName("Users").appendRow([
    "w2user", "W2 User", "x", "User", "Active", "[]", '["W002"]', "", "", "", "", "", 0,
  ]);
  ctx.cacheClear_("wallets");
  ctx.cacheClear_("user");

  const created = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "Private", walletId: "W001",
    account: "Bank", startDate: "2026-01-01",
  });
  const planId = created.plan.PlanID;

  // The W002 user cannot even read a W001 plan...
  const read = ctx.getSavingsPlanDetails(planId, "w2user");
  assert.equal(read.status, "ERROR");
  assert.equal(read.code, "WALLET_ACCESS_DENIED");

  // ...nor move money in it.
  const dep = ctx.addSavingsFlexDeposit({ user: "w2user", planId, amount: 10, date: "2026-01-10", account: "Bank" });
  assert.equal(dep.status, "ERROR");
  assert.equal(dep.code, "WALLET_ACCESS_DENIED");

  // A client-supplied currency that disagrees with the wallet is rejected.
  const mismatch = ctx.createSavingsPlan({
    user: "admin", type: "FLEXIBLE", name: "Bad Currency", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", currency: "USD",
  });
  assert.equal(mismatch.status, "ERROR");
  assert.equal(mismatch.code, "CURRENCY_MISMATCH");
});

test("SAVINGS: backup exports plans and restore brings them back", () => {
  const ctx = setup();
  const created = ctx.createSavingsPlan({
    user: "admin", type: "GROUP", name: "Backup Group", walletId: "W001",
    account: "Bank", startDate: "2026-01-01", contribution: 200, rounds: 2,
    frequency: "MONTHLY", members: [{ name: "A" }, { name: "B" }],
  });
  const planId = created.plan.PlanID;
  const memberId = ctx.getSavingsPlanDetails(planId, "admin").members[0].MemberID;
  ctx.recordSavingsGroupContribution({ user: "admin", planId, memberId, amount: 200, date: "2026-01-10", round: 1 });

  const backup = ctx.getBackupData("admin");
  assert.equal(backup.status, "SUCCESS");
  assert.equal(backup.savingsPlans.length, 1);
  assert.equal(backup.savingsGroupObligations.length, 1);
  assert.equal(backup.savingsGroupRounds.length, 1);
  assert.equal(backup.savingsGroupMembers.length, 2);

  // Simulate data loss: wipe the savings tables, then restore from the backup.
  const ss = ctx.ss_();
  ss.getSheetByName("SavingsPlans")._setRows([ctx.SAVINGS_PLAN_HEADERS]);
  ss.getSheetByName("SavingsGroupMembers")._setRows([ctx.SAVINGS_GROUP_MEMBER_HEADERS]);
  ss.getSheetByName("SavingsGroupObligations")._setRows([ctx.SAVINGS_GROUP_OBLIGATION_HEADERS]);
  ss.getSheetByName("SavingsGroupRounds")._setRows([ctx.SAVINGS_GROUP_ROUND_HEADERS]);
  assert.equal(ctx.getSavingsPlans("admin").plans.length, 0);

  const restored = ctx.importBackup(backup, "admin");
  assert.equal(restored.status, "SUCCESS", restored.message);

  const details = ctx.getSavingsPlanDetails(planId, "admin");
  assert.equal(details.status, "SUCCESS");
  assert.equal(details.members.length, 2);
  assert.equal(details.obligations.length, 1);
  assert.equal(details.plan.Summary.Collected, 200);
});

test("SAVINGS: a backup with an orphan savings row is rejected without changes", () => {
  const ctx = setup();
  const backup = ctx.getBackupData("admin");
  backup.savingsPlans = [{ planId: "P1", walletId: "W001", row: ["P1", "FLEXIBLE", "X", "W001", "Bank", "BDT", "2026-01-01", "ACTIVE", "admin", "admin", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""] }];
  backup.savingsGroupMembers = [{ planId: "P1", row: ["M1", "P2", "Ghost", 1, "ACTIVE", ""] }];

  const res = ctx.importBackup(backup, "admin");
  assert.equal(res.status, "ERROR");
  assert.equal(res.code, ctx.ERR.VALIDATION_ERROR);
});
